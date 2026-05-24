const { AppError } = require('../../common/errors');
const { getPool } = require('../../db');
const { enqueueJob } = require('../worker-engine/scheduler');
const { sendLeadOutboundMessage } = require('../messaging/service');

function validateCampaignPayload(payload) {
  if (!payload.name) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Campaign name is required.');
  }
  if (!payload.channelType || !['line', 'email', 'sms', 'facebook'].includes(payload.channelType)) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Valid channelType is required.');
  }
  if (!payload.channelId) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'ChannelId is required.');
  }
  return {
    name: payload.name,
    channelType: payload.channelType,
    channelId: Number(payload.channelId),
    templateId: payload.templateId ? Number(payload.templateId) : null,
    customMessageText: payload.customMessageText || null,
    segmentQueryJson: payload.segmentQueryJson || {},
    scheduledAt: payload.scheduledAt || null
  };
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    workspaceId: Number(row.workspace_id),
    name: row.name,
    channelType: row.channel_type,
    channelId: Number(row.channel_id),
    templateId: row.template_id ? Number(row.template_id) : null,
    customMessageText: row.custom_message_text || null,
    segmentQueryJson: row.segment_query_json,
    status: row.status,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    statsJson: row.stats_json,
    createdBy: row.created_by ? Number(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildTargetQuery(clinicId, workspaceId, segmentQuery) {
  const values = [clinicId, workspaceId];
  const clauses = ['l.clinic_id = $1', 'l.workspace_id = $2'];

  if (segmentQuery.intentScoreMin !== undefined && segmentQuery.intentScoreMin !== null) {
    values.push(Number(segmentQuery.intentScoreMin));
    clauses.push(`l.intent_score >= $${values.length}`);
  }

  if (segmentQuery.stage) {
    values.push(segmentQuery.stage);
    clauses.push(`l.stage = $${values.length}`);
  }

  if (segmentQuery.status) {
    values.push(segmentQuery.status);
    clauses.push(`l.status = $${values.length}`);
  }

  if (segmentQuery.tagNames && Array.isArray(segmentQuery.tagNames) && segmentQuery.tagNames.length > 0) {
    values.push(segmentQuery.tagNames);
    clauses.push(`exists (
      select 1 
      from lead_tag_links ltl 
      inner join lead_tags lt on lt.id = ltl.tag_id 
      where ltl.lead_id = l.id and lt.name = any($${values.length})
    )`);
  }

  return { clauses, values };
}

async function createCampaign(clinicContext, payload) {
  const normalized = validateCampaignPayload(payload);
  const clinicId = clinicContext.currentClinic.id;
  const workspaceId = clinicContext.currentWorkspace.id;
  const userId = clinicContext.currentUser.id;

  const result = await getPool().query(
    `
      insert into campaigns (
        clinic_id,
        workspace_id,
        name,
        channel_type,
        channel_id,
        template_id,
        custom_message_text,
        segment_query_json,
        status,
        scheduled_at,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $10)
      returning *
    `,
    [
      clinicId,
      workspaceId,
      normalized.name,
      normalized.channelType,
      normalized.channelId,
      normalized.templateId,
      normalized.customMessageText,
      JSON.stringify(normalized.segmentQueryJson),
      normalized.scheduledAt,
      userId
    ]
  );

  return mapCampaign(result.rows[0]);
}

async function getCampaign(clinicContext, id) {
  const clinicId = clinicContext.currentClinic.id;
  const result = await getPool().query(
    `select * from campaigns where clinic_id = $1 and id = $2 limit 1`,
    [clinicId, id]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  }
  return mapCampaign(result.rows[0]);
}

async function previewCampaignTargetCount(clinicContext, segmentQuery) {
  const clinicId = clinicContext.currentClinic.id;
  const workspaceId = clinicContext.currentWorkspace.id;

  const { clauses, values } = buildTargetQuery(clinicId, workspaceId, segmentQuery || {});
  
  const queryText = `
    select count(distinct l.id) as count
    from leads l
    where ${clauses.join(' and ')}
  `;

  const result = await getPool().query(queryText, values);
  return {
    targetCount: Number(result.rows[0].count)
  };
}

async function enqueueCampaignBroadcast(clinicContext, campaignId) {
  const client = await getPool().connect();
  await client.query('begin');

  try {
    const clinicId = clinicContext.currentClinic.id;
    const workspaceId = clinicContext.currentWorkspace.id;
    const userId = clinicContext.currentUser.id;

    const campaignResult = await client.query(
      `select * from campaigns where clinic_id = $1 and id = $2 for update`,
      [clinicId, campaignId]
    );

    if (campaignResult.rowCount === 0) {
      throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
    }

    const campaign = campaignResult.rows[0];
    if (campaign.status !== 'draft') {
      throw new AppError(400, 'CAMPAIGN_NOT_DRAFT', 'Only draft campaigns can be broadcast.');
    }

    const { clauses, values } = buildTargetQuery(clinicId, workspaceId, campaign.segment_query_json || {});
    const queryText = `
      select distinct l.id
      from leads l
      where ${clauses.join(' and ')}
    `;
    const targetResult = await client.query(queryText, values);
    const targetIds = targetResult.rows.map((row) => Number(row.id));

    const stats = {
      targetCount: targetIds.length,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0
    };

    await client.query(
      `
        update campaigns
        set status = 'sending',
            started_at = now(),
            stats_json = $2::jsonb,
            updated_at = now()
        where id = $1
      `,
      [campaignId, JSON.stringify(stats)]
    );

    for (const targetId of targetIds) {
      const deliveryResult = await client.query(
        `
          insert into campaign_deliveries (campaign_id, entity_type, entity_id, status)
          values ($1, 'lead', $2, 'pending')
          on conflict (campaign_id, entity_type, entity_id)
          do update set status = 'pending', error_message = null, delivered_at = null
          returning id
        `,
        [campaignId, targetId]
      );

      const deliveryId = deliveryResult.rows[0].id;

      await enqueueJob(
        {
          clinicId,
          jobType: 'campaign.dispatch',
          payloadJson: {
            campaignId,
            deliveryId,
            actorUserId: userId,
            workspaceId
          }
        },
        client
      );
    }

    await client.query('commit');
    
    const finalResult = await getPool().query('select * from campaigns where id = $1', [campaignId]);
    return mapCampaign(finalResult.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function updateCampaignStats(campaignId) {
  const pool = getPool();

  const countsResult = await pool.query(
    `
      select status, count(*) as count
      from campaign_deliveries
      where campaign_id = $1
      group by status
    `,
    [campaignId]
  );

  let targetCount = 0;
  let sentCount = 0;
  let deliveredCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const row of countsResult.rows) {
    const count = Number(row.count);
    targetCount += count;
    if (row.status === 'delivered') {
      deliveredCount += count;
      sentCount += count;
    } else if (row.status === 'sent') {
      sentCount += count;
    } else if (row.status === 'failed') {
      failedCount += count;
    } else if (row.status === 'pending') {
      pendingCount += count;
    }
  }

  const stats = {
    targetCount,
    sentCount,
    deliveredCount,
    failedCount
  };

  const isFinished = pendingCount === 0;

  if (isFinished) {
    await pool.query(
      `
        update campaigns
        set stats_json = $2::jsonb,
            status = 'completed',
            finished_at = now(),
            updated_at = now()
        where id = $1
      `,
      [campaignId, JSON.stringify(stats)]
    );
  } else {
    await pool.query(
      `
        update campaigns
        set stats_json = $2::jsonb,
            updated_at = now()
        where id = $1
      `,
      [campaignId, JSON.stringify(stats)]
    );
  }
}

async function dispatchCampaignDelivery(clinicContext, deliveryId) {
  const pool = getPool();

  const deliveryResult = await pool.query(
    `
      select cd.*, c.clinic_id, c.channel_id, c.template_id, c.custom_message_text, c.segment_query_json, c.status as campaign_status
      from campaign_deliveries cd
      inner join campaigns c on c.id = cd.campaign_id
      where cd.id = $1
    `,
    [deliveryId]
  );

  if (deliveryResult.rowCount === 0) {
    throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Campaign delivery not found.');
  }

  const delivery = deliveryResult.rows[0];

  if (Number(delivery.clinic_id) !== Number(clinicContext.currentClinic.id)) {
    throw new AppError(403, 'FORBIDDEN', 'Access to this campaign delivery is denied.');
  }

  if (delivery.status !== 'pending') {
    return;
  }

  try {
    const outbound = await sendLeadOutboundMessage(
      clinicContext,
      Number(delivery.entity_id),
      {
        channelId: Number(delivery.channel_id),
        templateId: delivery.template_id ? Number(delivery.template_id) : null,
        content: delivery.custom_message_text || 'Broadcast Campaign Outbound'
      },
      {
        messageType: 'campaign'
      }
    );

    const isFailed = outbound.status === 'failed';
    const finalStatus = isFailed ? 'failed' : 'delivered';
    const errorMsg = isFailed ? (outbound.failureReason || 'Failed to send') : null;

    await pool.query(
      `
        update campaign_deliveries
        set status = $2,
            outbound_message_id = $3,
            error_message = $4,
            delivered_at = case when $2 = 'delivered' then now() else null end
        where id = $1
      `,
      [deliveryId, finalStatus, outbound.id, errorMsg]
    );

    await updateCampaignStats(delivery.campaign_id);

  } catch (error) {
    await pool.query(
      `
        update campaign_deliveries
        set status = 'failed',
            error_message = $2
        where id = $1
      `,
      [deliveryId, error.message]
    );

    await updateCampaignStats(delivery.campaign_id);
    throw error;
  }
}

module.exports = {
  createCampaign,
  getCampaign,
  previewCampaignTargetCount,
  enqueueCampaignBroadcast,
  dispatchCampaignDelivery
};
