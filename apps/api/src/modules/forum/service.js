const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { generateSlug } = require('../blog/service'); // reuse Thai-safe slug helper
const { recordAuditLog } = require('../audit/service');

async function makeUniqueTopicSlug(client, clinicId, title) {
  const baseSlug = generateSlug(title);
  let slug = baseSlug;
  let attempts = 0;
  
  while (attempts < 5) {
    const checkResult = await client.query(
      'select id from forum_topics where clinic_id = $1 and slug = $2 limit 1',
      [clinicId, slug]
    );
    if (checkResult.rowCount === 0) {
      return slug;
    }
    const rand = Math.random().toString(36).substring(2, 7);
    slug = `${baseSlug}-${rand}`;
    attempts++;
  }
  return `${baseSlug}-${Date.now()}`;
}

async function createTopic(clinicContext, data) {
  const { title, content, authorDisplayName, isAnonymous, category } = data;
  const clinicId = clinicContext.currentClinic.id;
  const pool = getPool();

  if (!title || !content || !authorDisplayName) {
    throw new AppError(400, 'BAD_REQUEST', 'Title, content, and author display name are required.');
  }

  const slug = await makeUniqueTopicSlug(pool, clinicId, title);

  const result = await pool.query(
    `insert into forum_topics (
      clinic_id, title, slug, content, author_display_name, is_anonymous, category
    ) values ($1, $2, $3, $4, $5, $6, $7)
    returning *`,
    [
      clinicId, title, slug, content, authorDisplayName, 
      isAnonymous === undefined ? true : isAnonymous,
      category || 'general'
    ]
  );

  const topic = result.rows[0];
  await recordAuditLog({
    clinicId,
    entityType: 'forum_topic',
    entityId: Number(topic.id),
    actionType: 'forum.topic_created',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {
      category: topic.category,
      isAnonymous: topic.is_anonymous
    }
  });

  return topic;
}

async function listTopics(clinicId, options = {}) {
  const pool = getPool();
  const limit = Math.min(Number(options.limit) || 10, 100);
  const offset = Math.max(Number(options.offset) || 0, 0);

  let query = 'select * from forum_topics where clinic_id = $1';
  const values = [clinicId];
  let valueIndex = 2;

  if (options.category && options.category !== 'all') {
    query += ` and category = $${valueIndex}`;
    values.push(options.category);
    valueIndex++;
  }

  const status = options.status || 'active';
  query += ` and status = $${valueIndex}`;
  values.push(status);
  valueIndex++;

  query += ` order by created_at desc limit $${valueIndex} offset $${valueIndex + 1}`;
  values.push(limit, offset);

  // Count query
  let countQuery = 'select count(*)::int as count from forum_topics where clinic_id = $1';
  const countValues = [clinicId];
  if (options.category && options.category !== 'all') {
    countQuery += ' and category = $2';
    countValues.push(options.category);
  }
  countQuery += ` and status = $${countValues.length + 1}`;
  countValues.push(status);

  const countResult = await pool.query(countQuery, countValues);
  const result = await pool.query(query, values);

  return {
    items: result.rows,
    total: countResult.rows[0].count,
    limit,
    offset
  };
}

async function getTopicByIdOrSlug(clinicId, idOrSlug) {
  const pool = getPool();
  let result;
  
  if (/^\d+$/.test(idOrSlug)) {
    result = await pool.query(
      'select * from forum_topics where clinic_id = $1 and id = $2 limit 1',
      [clinicId, Number(idOrSlug)]
    );
  } else {
    result = await pool.query(
      'select * from forum_topics where clinic_id = $1 and slug = $2 limit 1',
      [clinicId, idOrSlug]
    );
  }

  if (result.rowCount === 0) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Forum topic not found.');
  }

  // Increment view count asynchronously
  pool.query('update forum_topics set view_count = view_count + 1 where id = $1', [result.rows[0].id]).catch(() => {});

  return result.rows[0];
}

async function createReply(clinicContext, topicId, data) {
  const { content, authorDisplayName, isAnonymous, isDoctorReply } = data;
  const clinicId = clinicContext.currentClinic.id;
  const client = await getPool().connect();

  try {
    if (!content || !authorDisplayName) {
      throw new AppError(400, 'BAD_REQUEST', 'Content and author display name are required.');
    }

    // Verify topic exists
    const topicCheck = await client.query(
      'select id from forum_topics where clinic_id = $1 and id = $2',
      [clinicId, topicId]
    );
    if (topicCheck.rowCount === 0) {
      throw new AppError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');
    }

    await client.query('begin');
    const result = await client.query(
      `insert into forum_replies (
        topic_id, clinic_id, content, author_display_name, is_anonymous, is_doctor_reply, is_verified_answer
      ) values ($1, $2, $3, $4, $5, $6, $7)
      returning *`,
      [
        topicId, clinicId, content, authorDisplayName, 
        isAnonymous === undefined ? true : isAnonymous,
        isDoctorReply || false,
        isDoctorReply || false // doctor replies are auto-verified answers
      ]
    );
    const reply = result.rows[0];

    // Increment reply count and set is_doctor_verified to true if it is a doctor reply
    if (isDoctorReply) {
      await client.query(
        'update forum_topics set reply_count = reply_count + 1, is_doctor_verified = true, updated_at = now() where id = $1',
        [topicId]
      );
    } else {
      await client.query(
        'update forum_topics set reply_count = reply_count + 1, updated_at = now() where id = $1',
        [topicId]
      );
    }

    await recordAuditLog({
      clinicId,
      entityType: 'forum_reply',
      entityId: Number(reply.id),
      actionType: isDoctorReply ? 'forum.doctor_reply_created' : 'forum.reply_created',
      actorUserId: clinicContext.currentUser?.id || null,
      contextJson: {
        topicId,
        isDoctorReply: Boolean(isDoctorReply),
        isVerifiedAnswer: Boolean(isDoctorReply)
      }
    }, client);

    await client.query('commit');
    return reply;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function listReplies(clinicId, topicId) {
  const pool = getPool();
  const result = await pool.query(
    'select * from forum_replies where clinic_id = $1 and topic_id = $2 order by created_at asc',
    [clinicId, topicId]
  );
  return result.rows;
}

async function verifyReply(clinicContext, replyId, isVerified) {
  const clinicId = clinicContext.currentClinic.id;
  const client = await getPool().connect();

  try {
    const replyResult = await client.query(
      'select topic_id from forum_replies where clinic_id = $1 and id = $2',
      [clinicId, replyId]
    );
    if (replyResult.rowCount === 0) {
      throw new AppError(404, 'REPLY_NOT_FOUND', 'Forum reply not found.');
    }

    const { topic_id: topicId } = replyResult.rows[0];

    await client.query('begin');
    await client.query(
      'update forum_replies set is_verified_answer = $3 where clinic_id = $1 and id = $2',
      [clinicId, replyId, isVerified]
    );

    if (isVerified) {
      await client.query(
        'update forum_topics set is_doctor_verified = true, updated_at = now() where id = $1',
        [topicId]
      );
    } else {
      // Check if there are any other verified replies
      const otherVerifiedCheck = await client.query(
        'select id from forum_replies where topic_id = $1 and is_verified_answer = true limit 1',
        [topicId]
      );
      if (otherVerifiedCheck.rowCount === 0) {
        await client.query(
          'update forum_topics set is_doctor_verified = false, updated_at = now() where id = $1',
          [topicId]
        );
      }
    }

    await recordAuditLog({
      clinicId,
      entityType: 'forum_reply',
      entityId: Number(replyId),
      actionType: isVerified ? 'forum.reply_verified' : 'forum.reply_unverified',
      actorUserId: clinicContext.currentUser?.id || null,
      contextJson: {
        topicId: Number(topicId)
      }
    }, client);

    await client.query('commit');
    return { success: true };
  } catch (error) {
    try {
      await client.query('rollback');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function updateTopicStatus(clinicContext, topicId, status) {
  const clinicId = clinicContext.currentClinic.id;
  const pool = getPool();

  const result = await pool.query(
    'update forum_topics set status = $3, updated_at = now() where clinic_id = $1 and id = $2 returning *',
    [clinicId, topicId, status]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Forum topic not found.');
  }

  const topic = result.rows[0];
  await recordAuditLog({
    clinicId,
    entityType: 'forum_topic',
    entityId: Number(topicId),
    actionType: 'forum.topic_status_updated',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {
      status
    }
  });

  return topic;
}

module.exports = {
  createTopic,
  listTopics,
  getTopicByIdOrSlug,
  createReply,
  listReplies,
  verifyReply,
  updateTopicStatus
};
