const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { validateEntityId, validateGenerateMessagePayload } = require('./validation');
const {
  getDaysSince,
  computeLeadScore,
  computeCustomerScore,
  buildLeadRecommendations,
  buildCustomerRecommendations
} = require('./engine');
const { recordCustomerEvent } = require('../customers/service');

function mapLeadScore(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    leadId: row.lead_id,
    score: row.score,
    confidence: Number(row.confidence),
    reasonJson: row.reason_json,
    generatedAt: row.generated_at,
    dealProbability: row.reason_json?.dealProbability ?? null
  };
}

function mapCustomerScore(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    customerId: row.customer_id,
    score: row.score,
    lifetimeValueEstimate: row.lifetime_value_estimate,
    engagementScore: row.engagement_score,
    generatedAt: row.generated_at
  };
}

function mapRecommendation(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    recommendationType: row.recommendation_type,
    recommendationText: row.recommendation_text,
    priority: row.priority,
    confidence: Number(row.confidence),
    contextJson: row.context_json,
    createdAt: row.created_at
  };
}

function resolveAiScope(clinicContext) {
  return {
    clinicId: clinicContext.currentClinic.id,
    workspaceId: clinicContext.currentWorkspace?.id || null
  };
}

async function publishAiEventSafe(input, message) {
  try {
    const { publishDomainEvent } = require('../event-bus/publisher');
    await publishDomainEvent(input);
  } catch (error) {
    console.error(message, error.message);
  }
}

function mapAiInsight(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    insightType: row.insight_type,
    insightDataJson: row.insight_data_json,
    createdAt: row.created_at
  };
}

async function findLead(client, clinicContext, leadId) {
  const scope = typeof clinicContext === 'object' && clinicContext.currentClinic
    ? resolveAiScope(clinicContext)
    : { clinicId: clinicContext, workspaceId: null };
  const values = [scope.clinicId, leadId];
  const workspaceClause = scope.workspaceId ? `and workspace_id = $3` : '';

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
  }

  const result = await client.query(
    `
      select id, clinic_id, workspace_id, source, source_ref, full_name, phone, email, status, stage, last_contacted_at, created_at, updated_at
      from leads
      where clinic_id = $1 and id = $2
      ${workspaceClause}
      limit 1
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  return result.rows[0];
}

async function findCustomer(client, clinicContext, customerId) {
  const scope = typeof clinicContext === 'object' && clinicContext.currentClinic
    ? resolveAiScope(clinicContext)
    : { clinicId: clinicContext, workspaceId: null };
  const result = await client.query(
    `
      select c.*, cp.tags, cp.meta_json, cp.preferred_channel
      from customers c
      left join customer_profiles cp on cp.customer_id = c.id
      where c.clinic_id = $1 and c.id = $2
      limit 1
    `,
    [scope.clinicId, customerId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  return result.rows[0];
}

async function collectLeadSignals(client, clinicContext, leadId) {
  const scope = typeof clinicContext === 'object' && clinicContext.currentClinic
    ? resolveAiScope(clinicContext)
    : { clinicId: clinicContext, workspaceId: null };
  const lead = await findLead(client, clinicContext, leadId);
  const notesResult = await client.query(
    `select count(*)::int as note_count from notes where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [scope.clinicId, leadId]
  );
  const outboundResult = await client.query(
    `select count(*)::int as outbound_count from outbound_messages where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [scope.clinicId, leadId]
  );
  const automationResult = await client.query(
    `select count(*)::int as execution_count from automation_executions where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [scope.clinicId, leadId]
  );
  const tagsResult = await client.query(
    `
      select coalesce(array_agg(lt.name order by lt.name asc), '{}') as tags
      from lead_tag_links ltl
      inner join lead_tags lt on lt.id = ltl.tag_id
      where ltl.clinic_id = $1 and ltl.lead_id = $2
    `,
    [scope.clinicId, leadId]
  );
  const activityResult = await client.query(
    `
      select event_type, created_at
      from lead_activity
      where clinic_id = $1 and lead_id = $2
      order by created_at desc, id desc
      limit 12
    `,
    [scope.clinicId, leadId]
  );
  const stageHistoryResult = await client.query(
    `
      select count(*)::int as stage_change_count
      from lead_activity
      where clinic_id = $1 and lead_id = $2 and event_type = 'lead.stage_changed'
    `,
    [scope.clinicId, leadId]
  );

  const noteCount = notesResult.rows[0].note_count;
  const outboundMessageCount = outboundResult.rows[0].outbound_count;
  const automationExecutionCount = automationResult.rows[0].execution_count;
  const tags = tagsResult.rows[0].tags || [];
  const stageChangeCount = stageHistoryResult.rows[0].stage_change_count;
  const interactionCount = noteCount + outboundMessageCount + automationExecutionCount;
  const replyRate = outboundMessageCount > 0
    ? Math.min(1, (noteCount + automationExecutionCount) / (outboundMessageCount * 2))
    : noteCount > 0 ? 0.5 : 0.2;

  return {
    lead,
    activityTimeline: activityResult.rows,
    signals: {
      source: lead.source,
      stage: lead.stage,
      status: lead.status,
      tags,
      noteCount,
      outboundMessageCount,
      automationExecutionCount,
      stageChangeCount,
      interactionCount,
      replyRate,
      daysSinceLastContact: getDaysSince(lead.last_contacted_at)
    }
  };
}

async function collectCustomerSignals(client, clinicContext, customerId) {
  const scope = typeof clinicContext === 'object' && clinicContext.currentClinic
    ? resolveAiScope(clinicContext)
    : { clinicId: clinicContext, workspaceId: null };
  const customer = await findCustomer(client, clinicContext, customerId);
  const eventsResult = await client.query(
    `select count(*)::int as event_count, max(created_at) as last_event_at from customer_events where clinic_id = $1 and customer_id = $2`,
    [scope.clinicId, customerId]
  );
  const notesResult = await client.query(
    `select count(*)::int as note_count, max(created_at) as last_note_at from customer_notes where clinic_id = $1 and customer_id = $2`,
    [scope.clinicId, customerId]
  );
  const outboundResult = await client.query(
    `select count(*)::int as outbound_count, max(created_at) as last_message_at from outbound_messages where clinic_id = $1 and entity_type = 'customer' and entity_id = $2`,
    [scope.clinicId, customerId]
  );

  const eventCount = eventsResult.rows[0].event_count;
  const noteCount = notesResult.rows[0].note_count;
  const outboundMessageCount = outboundResult.rows[0].outbound_count;
  const activityCount = eventCount + noteCount + outboundMessageCount;
  const latestActivityAt = [
    eventsResult.rows[0].last_event_at,
    notesResult.rows[0].last_note_at,
    outboundResult.rows[0].last_message_at,
    customer.updated_at
  ].filter(Boolean).sort().slice(-1)[0] || null;
  const engagementScore = Math.min(100, 25 + eventCount * 10 + noteCount * 12 + outboundMessageCount * 8 + (customer.status === 'vip' ? 18 : 0));

  return {
    customer,
    signals: {
      status: customer.status,
      tags: customer.tags || [],
      eventCount,
      noteCount,
      outboundMessageCount,
      activityCount,
      daysSinceLastActivity: getDaysSince(latestActivityAt),
      engagementScore
    }
  };
}

async function upsertLeadScore(client, clinicId, leadId, scoreResult) {
  const result = await client.query(
    `
      insert into ai_lead_scores (clinic_id, lead_id, score, confidence, reason_json, generated_at)
      values ($1, $2, $3, $4, $5::jsonb, now())
      on conflict (clinic_id, lead_id)
      do update set
        score = excluded.score,
        confidence = excluded.confidence,
        reason_json = excluded.reason_json,
        generated_at = excluded.generated_at
      returning *
    `,
    [clinicId, leadId, scoreResult.score, scoreResult.confidence, JSON.stringify(scoreResult.reasonJson)]
  );

  return mapLeadScore(result.rows[0]);
}

async function upsertCustomerScore(client, clinicId, customerId, scoreResult) {
  const result = await client.query(
    `
      insert into ai_customer_scores (clinic_id, customer_id, score, lifetime_value_estimate, engagement_score, generated_at)
      values ($1, $2, $3, $4, $5, now())
      on conflict (clinic_id, customer_id)
      do update set
        score = excluded.score,
        lifetime_value_estimate = excluded.lifetime_value_estimate,
        engagement_score = excluded.engagement_score,
        generated_at = excluded.generated_at
      returning *
    `,
    [clinicId, customerId, scoreResult.score, scoreResult.lifetimeValueEstimate, scoreResult.engagementScore]
  );

  return mapCustomerScore(result.rows[0]);
}

async function replaceRecommendations(client, clinicId, entityType, entityId, recommendations) {
  await client.query(
    `delete from ai_recommendations where clinic_id = $1 and entity_type = $2 and entity_id = $3`,
    [clinicId, entityType, entityId]
  );

  const items = [];

  for (const recommendation of recommendations) {
    const result = await client.query(
      `
        insert into ai_recommendations (
          clinic_id,
          entity_type,
          entity_id,
          recommendation_type,
          recommendation_text,
          priority,
          confidence,
          context_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        returning *
      `,
      [
        clinicId,
        entityType,
        entityId,
        recommendation.recommendationType,
        recommendation.recommendationText,
        recommendation.priority,
        recommendation.confidence,
        JSON.stringify(recommendation.contextJson || {})
      ]
    );
    items.push(mapRecommendation(result.rows[0]));
  }

  return items;
}

async function recordLeadAiHistory(client, clinicId, leadId, recommendations) {
  const noteText = `AI suggestion generated ${recommendations.length} recommendation(s). Top action: ${recommendations[0]?.recommendationType || 'none'}.`;

  await client.query(
    `
      insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
      values ($1, 'lead', $2, null, 'ai.recommendation_generated', $3)
    `,
    [clinicId, leadId, noteText]
  );
}

async function syncLeadIntentScore(client, clinicContext, leadId, score) {
  const scope = resolveAiScope(clinicContext);

  if (scope.workspaceId) {
    await client.query(
      `
        update leads
        set intent_score = $4,
            updated_at = now()
        where clinic_id = $1 and id = $2 and workspace_id = $3
      `,
      [scope.clinicId, leadId, scope.workspaceId, score]
    );
    return;
  }

  await client.query(
    `
      update leads
      set intent_score = $3,
          updated_at = now()
      where clinic_id = $1 and id = $2
    `,
    [scope.clinicId, leadId, score]
  );
}

async function assertMessageGenerationRateLimit(client, clinicContext, leadId) {
  const scope = resolveAiScope(clinicContext);
  const result = await client.query(
    `
      select count(*)::int as generation_count
      from audit_logs
      where clinic_id = $1
        and entity_type = 'lead'
        and entity_id = $2
        and action_type = 'ai.message_generated'
        and created_at >= now() - interval '5 minutes'
    `,
    [scope.clinicId, leadId]
  );

  if (result.rows[0].generation_count >= 5) {
    throw new AppError(429, 'AI_RATE_LIMITED', 'Message generation is temporarily rate limited for this lead.');
  }
}

function buildShortPersonalizedMessage({ lead, signals, recentActivity, tone, context }) {
  const firstName = (lead.full_name || 'คุณลูกค้า').trim().split(/\s+/)[0] || 'คุณลูกค้า';
  const tonePrefix = {
    friendly: `สวัสดีคุณ${firstName}`,
    professional: `เรียนคุณ${firstName}`,
    urgent: `สวัสดีคุณ${firstName}`
  }[tone] || `สวัสดีคุณ${firstName}`;
  const tags = Array.isArray(signals.tags) && signals.tags.length > 0 ? ` สนใจเรื่อง ${signals.tags.slice(0, 2).join(', ')}` : '';
  const stageHint = signals.stage ? `ตอนนี้อยู่ในขั้น ${signals.stage}` : 'ตอนนี้ทีมกำลังติดตามเคสของคุณ';
  const recentHint = recentActivity ? ` จากกิจกรรมล่าสุดคือ ${recentActivity.event_type}` : '';
  const contextHint = context?.goal ? ` เป้าหมายวันนี้คือ ${context.goal}` : '';
  const closing = tone === 'urgent'
    ? 'หากสะดวกตอบกลับเวลาที่พร้อมคุยได้เลยครับ'
    : 'ถ้าสะดวกแจ้งเวลาที่ต้องการให้ทีมช่วยต่อได้เลยครับ';

  return `${tonePrefix} ${stageHint}${tags}.${recentHint}${contextHint} ${closing}`.replace(/\s+/g, ' ').trim();
}

async function storeAiInsight(client, clinicContext, entityType, entityId, insightType, insightDataJson) {
  const scope = resolveAiScope(clinicContext);
  const result = await client.query(
    `
      insert into ai_insights (clinic_id, workspace_id, entity_type, entity_id, insight_type, insight_data_json)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning *
    `,
    [scope.clinicId, scope.workspaceId, entityType, entityId, insightType, JSON.stringify(insightDataJson || {})]
  );

  return mapAiInsight(result.rows[0]);
}

async function getLeadScore(clinicContext, leadId) {
  const normalizedLeadId = validateEntityId(leadId, 'leadId');
  const result = await getPool().query(
    `select * from ai_lead_scores where clinic_id = $1 and lead_id = $2 limit 1`,
    [clinicContext.currentClinic.id, normalizedLeadId]
  );

  if (result.rowCount === 0) {
    return recomputeLeadInsights(clinicContext, normalizedLeadId);
  }

  const recommendations = await getRecommendationsByEntity(clinicContext.currentClinic.id, 'lead', normalizedLeadId);

  return {
    score: mapLeadScore(result.rows[0]),
    recommendations,
    nextBestAction: recommendations.items[0] || null
  };
}

async function getCustomerScore(clinicContext, customerId) {
  const normalizedCustomerId = validateEntityId(customerId, 'customerId');
  const result = await getPool().query(
    `select * from ai_customer_scores where clinic_id = $1 and customer_id = $2 limit 1`,
    [clinicContext.currentClinic.id, normalizedCustomerId]
  );

  if (result.rowCount === 0) {
    return recomputeCustomerInsights(clinicContext, normalizedCustomerId);
  }

  const recommendations = await getRecommendationsByEntity(clinicContext.currentClinic.id, 'customer', normalizedCustomerId);

  return {
    score: mapCustomerScore(result.rows[0]),
    recommendations,
    nextBestAction: recommendations.items[0] || null
  };
}

async function getRecommendationsByEntity(clinicId, entityType, entityId) {
  const result = await getPool().query(
    `
      select *
      from ai_recommendations
      where clinic_id = $1 and entity_type = $2 and entity_id = $3
      order by
        case priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
        confidence desc,
        id asc
    `,
    [clinicId, entityType, entityId]
  );

  return {
    items: result.rows.map(mapRecommendation),
    nextBestAction: result.rowCount > 0 ? mapRecommendation(result.rows[0]) : null
  };
}

async function getLeadRecommendations(clinicContext, leadId) {
  const normalizedLeadId = validateEntityId(leadId, 'leadId');
  await findLead(getPool(), clinicContext, normalizedLeadId);
  const recommendations = await getRecommendationsByEntity(clinicContext.currentClinic.id, 'lead', normalizedLeadId);

  if (recommendations.items.length === 0) {
    const recomputed = await recomputeLeadInsights(clinicContext, normalizedLeadId);
    return recomputed.recommendations;
  }

  return recommendations;
}

async function getCustomerRecommendations(clinicContext, customerId) {
  const normalizedCustomerId = validateEntityId(customerId, 'customerId');
  await findCustomer(getPool(), clinicContext, normalizedCustomerId);
  const recommendations = await getRecommendationsByEntity(clinicContext.currentClinic.id, 'customer', normalizedCustomerId);

  if (recommendations.items.length === 0) {
    const recomputed = await recomputeCustomerInsights(clinicContext, normalizedCustomerId);
    return recomputed.recommendations;
  }

  return recommendations;
}

async function recomputeLeadInsights(clinicContext, leadId) {
  const normalizedLeadId = validateEntityId(leadId, 'leadId');
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const { signals } = await collectLeadSignals(client, clinicContext, normalizedLeadId);
    const scoreResult = computeLeadScore(signals);
    const recommendationsRaw = buildLeadRecommendations(signals, scoreResult);
    const score = await upsertLeadScore(client, clinicContext.currentClinic.id, normalizedLeadId, scoreResult);
    await syncLeadIntentScore(client, clinicContext, normalizedLeadId, score.score);
    const recommendations = await replaceRecommendations(client, clinicContext.currentClinic.id, 'lead', normalizedLeadId, recommendationsRaw);
    await recordLeadAiHistory(client, clinicContext.currentClinic.id, normalizedLeadId, recommendations);
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'lead',
        entityId: normalizedLeadId,
        actionType: 'ai.scoring_executed',
        actorUserId: clinicContext.currentUser?.id || null,
        contextJson: {
          score: score.score,
          confidence: score.confidence
        }
      },
      client
    );
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'lead',
        entityId: normalizedLeadId,
        actionType: 'suggestion.generate',
        actorUserId: clinicContext.currentUser?.id || null,
        contextJson: {
          recommendationCount: recommendations.length,
          score: score.score,
          dealProbability: score.dealProbability
        }
      },
      client
    );
    await client.query('commit');

    await publishAiEventSafe(
      {
        clinicId: clinicContext.currentClinic.id,
        eventType: 'ai.lead_scored',
        entityType: 'lead',
        entityId: normalizedLeadId,
        payloadJson: {
          score: score.score,
          confidence: score.confidence,
          actorUserId: clinicContext.currentUser?.id || null,
          workspaceId: clinicContext.currentWorkspace?.id || null
        }
      },
      'Event bus ai.lead_scored publish failed:'
    );

    if (recommendations.length > 0) {
      await publishAiEventSafe(
        {
          clinicId: clinicContext.currentClinic.id,
          eventType: 'ai.recommendation_generated',
          entityType: 'lead',
          entityId: normalizedLeadId,
          payloadJson: {
            recommendationCount: recommendations.length,
            score: score.score,
            dealProbability: score.dealProbability,
            actorUserId: clinicContext.currentUser?.id || null
          }
        },
        'Event bus ai.recommendation_generated publish failed for lead:'
      );
    }

    return {
      score,
      recommendations: {
        items: recommendations,
        nextBestAction: recommendations[0] || null
      },
      nextBestAction: recommendations[0] || null
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function recomputeCustomerInsights(clinicContext, customerId) {
  const normalizedCustomerId = validateEntityId(customerId, 'customerId');
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const { signals } = await collectCustomerSignals(client, clinicContext, normalizedCustomerId);
    const scoreResult = computeCustomerScore(signals);
    const recommendationsRaw = buildCustomerRecommendations(signals, scoreResult);
    const score = await upsertCustomerScore(client, clinicContext.currentClinic.id, normalizedCustomerId, scoreResult);
    const recommendations = await replaceRecommendations(client, clinicContext.currentClinic.id, 'customer', normalizedCustomerId, recommendationsRaw);
    await recordCustomerEvent(client, clinicContext.currentClinic.id, normalizedCustomerId, 'ai.recommendation_generated', 'ai_service', {
      recommendationCount: recommendations.length,
      nextBestAction: recommendations[0]?.recommendationType || null,
      score: score.score
    });
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'customer',
        entityId: normalizedCustomerId,
        actionType: 'suggestion.generate',
        actorUserId: clinicContext.currentUser?.id || null,
        contextJson: {
          recommendationCount: recommendations.length,
          score: score.score,
          lifetimeValueEstimate: score.lifetimeValueEstimate
        }
      },
      client
    );
    await client.query('commit');

    if (recommendations.length > 0) {
      await publishAiEventSafe(
        {
          clinicId: clinicContext.currentClinic.id,
          eventType: 'ai.recommendation_generated',
          entityType: 'customer',
          entityId: normalizedCustomerId,
          payloadJson: {
            recommendationCount: recommendations.length,
            score: score.score,
            lifetimeValueEstimate: score.lifetimeValueEstimate,
            actorUserId: clinicContext.currentUser?.id || null
          }
        },
        'Event bus ai.recommendation_generated publish failed for customer:'
      );
    }

    return {
      score,
      recommendations: {
        items: recommendations,
        nextBestAction: recommendations[0] || null
      },
      nextBestAction: recommendations[0] || null
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function scoreLead(clinicContext, leadId) {
  const result = await recomputeLeadInsights(clinicContext, leadId);

  return {
    leadId: validateEntityId(leadId, 'leadId'),
    intentScore: result.score.score,
    confidence: result.score.confidence,
    reasonJson: result.score.reasonJson,
    generatedAt: result.score.generatedAt
  };
}

async function generateLeadMessage(clinicContext, payload) {
  const normalized = validateGenerateMessagePayload(payload);
  const client = await getPool().connect();

  try {
    await client.query('begin');
    await assertMessageGenerationRateLimit(client, clinicContext, normalized.leadId);
    const { lead, signals, activityTimeline } = await collectLeadSignals(client, clinicContext, normalized.leadId);
    const messageText = buildShortPersonalizedMessage({
      lead,
      signals,
      recentActivity: activityTimeline[0] || null,
      tone: normalized.tone,
      context: normalized.context
    });
    const insight = await storeAiInsight(client, clinicContext, 'lead', normalized.leadId, 'message_generation', {
      tone: normalized.tone,
      messageText,
      context: normalized.context
    });
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'lead',
        entityId: normalized.leadId,
        actionType: 'ai.message_generated',
        actorUserId: clinicContext.currentUser?.id || null,
        contextJson: {
          tone: normalized.tone,
          insightId: insight.id
        }
      },
      client
    );
    await client.query('commit');

    await publishAiEventSafe(
      {
        clinicId: clinicContext.currentClinic.id,
        eventType: 'ai.message_generated',
        entityType: 'lead',
        entityId: normalized.leadId,
        payloadJson: {
          tone: normalized.tone,
          actorUserId: clinicContext.currentUser?.id || null,
          workspaceId: clinicContext.currentWorkspace?.id || null
        }
      },
      'Event bus ai.message_generated publish failed:'
    );

    return {
      leadId: normalized.leadId,
      messageText
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getFlowInsights(clinicContext, flowId) {
  const normalizedFlowId = validateEntityId(flowId, 'flowId');
  const scope = resolveAiScope(clinicContext);
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const flowResult = await client.query(
      `
        select id, clinic_id, workspace_id, name
        from automation_flows
        where clinic_id = $1 and workspace_id = $2 and id = $3
        limit 1
      `,
      [scope.clinicId, scope.workspaceId, normalizedFlowId]
    );

    if (flowResult.rowCount === 0) {
      throw new AppError(404, 'FLOW_NOT_FOUND', 'Automation flow not found.');
    }

    const executionStatsResult = await client.query(
      `
        select
          count(*)::int as execution_count,
          count(*) filter (where status = 'failed')::int as failed_count,
          count(*) filter (where status = 'completed')::int as completed_count
        from automation_executions
        where clinic_id = $1 and workspace_id = $2 and flow_id = $3
      `,
      [scope.clinicId, scope.workspaceId, normalizedFlowId]
    );
    const stepStatsResult = await client.query(
      `
        select
          s.id as step_id,
          s.step_order,
          s.step_type,
          count(ase.id)::int as execution_count,
          count(*) filter (where ase.status = 'failed')::int as failed_count,
          avg(extract(epoch from (coalesce(ase.completed_at, ase.created_at) - coalesce(ase.started_at, ase.created_at))) * 1000) as avg_duration_ms
        from automation_steps s
        left join automation_step_executions ase on ase.step_id = s.id
        where s.clinic_id = $1 and s.flow_id = $2
        group by s.id, s.step_order, s.step_type
        order by s.step_order asc
      `,
      [scope.clinicId, normalizedFlowId]
    );

    const executionStats = executionStatsResult.rows[0];
    const bottlenecks = stepStatsResult.rows
      .filter((row) => Number(row.avg_duration_ms || 0) > 0)
      .sort((left, right) => Number(right.avg_duration_ms || 0) - Number(left.avg_duration_ms || 0))
      .slice(0, 3)
      .map((row) => ({
        stepId: Number(row.step_id),
        stepType: row.step_type,
        averageDurationMs: Math.round(Number(row.avg_duration_ms || 0))
      }));
    const failurePoints = stepStatsResult.rows
      .filter((row) => Number(row.failed_count || 0) > 0)
      .map((row) => ({
        stepId: Number(row.step_id),
        stepType: row.step_type,
        failedCount: Number(row.failed_count || 0)
      }));
    const suggestedChanges = [];

    if (bottlenecks.some((item) => item.stepType === 'wait')) {
      suggestedChanges.push('Delay step ใช้เวลานานเกินไป แนะนำลดระยะเวลารอใน flow');
    }

    if (failurePoints.some((item) => item.stepType === 'send_message')) {
      suggestedChanges.push('ขั้นตอนส่งข้อความมี failure rate สูง แนะนำปรับข้อความหรือ channel strategy');
    }

    if (Number(executionStats.failed_count || 0) > 0 && Number(executionStats.execution_count || 0) > 0
      && Number(executionStats.failed_count) / Number(executionStats.execution_count) >= 0.3) {
      suggestedChanges.push('Flow นี้มี failure rate สูง ควรตรวจ guard conditions และข้อมูล input ของแต่ละ step');
    }

    if (suggestedChanges.length === 0) {
      suggestedChanges.push('Flow ทำงานได้ค่อนข้างเสถียร แนะนำทดสอบข้อความและ delay เพื่อเพิ่ม conversion');
    }

    const insightPayload = {
      bottlenecks,
      failurePoints,
      suggestedChanges,
      executionSummary: {
        executionCount: Number(executionStats.execution_count || 0),
        failedCount: Number(executionStats.failed_count || 0),
        completedCount: Number(executionStats.completed_count || 0)
      }
    };
    const insight = await storeAiInsight(client, clinicContext, 'automation_flow', normalizedFlowId, 'flow_optimization', insightPayload);
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'automation_flow',
        entityId: normalizedFlowId,
        actionType: 'ai.insight_generated',
        actorUserId: clinicContext.currentUser?.id || null,
        contextJson: {
          insightId: insight.id
        }
      },
      client
    );
    await client.query('commit');

    await publishAiEventSafe(
      {
        clinicId: clinicContext.currentClinic.id,
        eventType: 'ai.flow_insight_generated',
        entityType: 'automation_flow',
        entityId: normalizedFlowId,
        payloadJson: {
          insightId: insight.id,
          actorUserId: clinicContext.currentUser?.id || null,
          workspaceId: clinicContext.currentWorkspace?.id || null
        }
      },
      'Event bus ai.flow_insight_generated publish failed:'
    );

    return {
      flowId: normalizedFlowId,
      ...insightPayload,
      insight
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getLeadScore,
  getCustomerScore,
  getLeadRecommendations,
  getCustomerRecommendations,
  scoreLead,
  generateLeadMessage,
  getFlowInsights,
  recomputeLeadInsights,
  recomputeCustomerInsights,
  getRecommendationsByEntity
};
