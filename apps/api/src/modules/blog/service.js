const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

function generateSlug(title) {
  let slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug || `post-${Date.now()}`;
}

async function makeUniqueSlug(client, clinicId, title) {
  const baseSlug = generateSlug(title);
  let slug = baseSlug;
  let attempts = 0;
  
  while (attempts < 5) {
    const checkResult = await client.query(
      'select id from blog_posts where clinic_id = $1 and slug = $2 limit 1',
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

async function createPost(clinicContext, data) {
  const { title, excerpt, content, coverImageUrl, authorName, status, tags, seoTitle, seoDescription, ogImageUrl } = data;
  const clinicId = clinicContext.currentClinic.id;
  const pool = getPool();

  if (!title || !content || !authorName) {
    throw new AppError(400, 'BAD_REQUEST', 'Title, content, and author name are required.');
  }

  const slug = await makeUniqueSlug(pool, clinicId, title);
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const result = await pool.query(
    `insert into blog_posts (
      clinic_id, title, slug, excerpt, content, cover_image_url, 
      author_name, status, tags, seo_title, seo_description, og_image_url, published_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    returning *`,
    [
      clinicId, title, slug, excerpt || null, content, coverImageUrl || null,
      authorName, status || 'draft', tags || [], seoTitle || null, seoDescription || null, ogImageUrl || null, publishedAt
    ]
  );

  const post = result.rows[0];
  await recordAuditLog({
    clinicId,
    entityType: 'blog_post',
    entityId: Number(post.id),
    actionType: 'blog.post_created',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {
      status: post.status,
      slug: post.slug
    }
  });

  return post;
}

async function updatePost(clinicContext, postId, data) {
  const { title, excerpt, content, coverImageUrl, authorName, status, tags, seoTitle, seoDescription, ogImageUrl } = data;
  const clinicId = clinicContext.currentClinic.id;
  const pool = getPool();

  const postResult = await pool.query(
    'select * from blog_posts where clinic_id = $1 and id = $2',
    [clinicId, postId]
  );
  if (postResult.rowCount === 0) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Blog post not found.');
  }

  const existingPost = postResult.rows[0];
  let slug = existingPost.slug;
  if (title && title !== existingPost.title) {
    slug = await makeUniqueSlug(pool, clinicId, title);
  }

  let publishedAt = existingPost.published_at;
  if (status === 'published' && existingPost.status !== 'published') {
    publishedAt = new Date().toISOString();
  } else if (status === 'draft') {
    publishedAt = null;
  }

  const result = await pool.query(
    `update blog_posts
     set title = coalesce($3, title),
         slug = $4,
         excerpt = coalesce($5, excerpt),
         content = coalesce($6, content),
         cover_image_url = coalesce($7, cover_image_url),
         author_name = coalesce($8, author_name),
         status = coalesce($9, status),
         tags = coalesce($10, tags),
         seo_title = coalesce($11, seo_title),
         seo_description = coalesce($12, seo_description),
         og_image_url = coalesce($13, og_image_url),
         published_at = $14,
         updated_at = now()
     where clinic_id = $1 and id = $2
     returning *`,
    [
      clinicId, postId, title, slug, excerpt, content, coverImageUrl,
      authorName, status, tags, seoTitle, seoDescription, ogImageUrl, publishedAt
    ]
  );

  const post = result.rows[0];
  await recordAuditLog({
    clinicId,
    entityType: 'blog_post',
    entityId: Number(post.id),
    actionType: 'blog.post_updated',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {
      statusBefore: existingPost.status,
      statusAfter: post.status,
      slugBefore: existingPost.slug,
      slugAfter: post.slug
    }
  });

  return post;
}

async function listPosts(clinicId, options = {}) {
  const pool = getPool();
  const limit = Math.min(Number(options.limit) || 10, 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  
  let query = 'select * from blog_posts where clinic_id = $1';
  const values = [clinicId];

  let valueIndex = 2;
  if (options.status) {
    query += ` and status = $${valueIndex}`;
    values.push(options.status);
    valueIndex++;
  }

  query += ` order by case when status = 'published' then published_at else updated_at end desc limit $${valueIndex} offset $${valueIndex + 1}`;
  values.push(limit, offset);

  const countResult = await pool.query(
    `select count(*) as count from blog_posts where clinic_id = $1 ${options.status ? 'and status = $2' : ''}`,
    options.status ? [clinicId, options.status] : [clinicId]
  );

  const result = await pool.query(query, values);

  return {
    items: result.rows,
    total: Number(countResult.rows[0].count),
    limit,
    offset
  };
}

async function getPostBySlug(clinicId, slug) {
  const pool = getPool();
  const result = await pool.query(
    'select * from blog_posts where clinic_id = $1 and slug = $2 limit 1',
    [clinicId, slug]
  );
  
  if (result.rowCount === 0) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Blog post not found.');
  }
  return result.rows[0];
}

async function deletePost(clinicContext, postId) {
  const clinicId = clinicContext.currentClinic.id;
  const pool = getPool();

  const result = await pool.query(
    'delete from blog_posts where clinic_id = $1 and id = $2 returning id',
    [clinicId, postId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'POST_NOT_FOUND', 'Blog post not found.');
  }

  await recordAuditLog({
    clinicId,
    entityType: 'blog_post',
    entityId: Number(postId),
    actionType: 'blog.post_deleted',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {}
  });
  return { success: true };
}

module.exports = {
  createPost,
  updatePost,
  listPosts,
  getPostBySlug,
  deletePost,
  generateSlug
};
