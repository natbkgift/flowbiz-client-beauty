const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { validateEntityId } = require('../ai/validation');
const { updateLead, getLeadDetail } = require('../leads/service');
const { recordAuditLog } = require('../audit/service');
const { validateOutcomeTrackingPayload, validatePerformanceEntityType } = require('./validation');

const OUTCOME_SCORE_DELTAS = {
  replied: 15,
  opened: 5,
  ignored: -10,
  converted: 25,
  lost: -30
};

function resolveFeedbackScope(clinicContext) {
  return {
    clinicId: clinicContext.currentClinic.id,
    workspaceId: clinicContext.currentWorkspace?.id || null
  };
}

function clampIntentScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
}

function mapOutcome(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionType: row.action_type,
    outcomeType: row.outcome_type,
    metadata: row.metadata_json,
    sourceEventId: row.source_event_id,
    createdAt: row.created_at
  };
}

function toMetric(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

async function publishDomainEventSafe(input, message) {
  try {
    const { publishDomainEvent } = require('../event-bus/publisher');
    return await publishDomainEvent(input);
  } catch (error) {
    console.error(message, error.message);
    return null;
  }
}

async function loadLeadRow(client, scope, leadId) {
  const result = await client.query(
    `
      select id, clinic_id, workspace_id, intent_score, status, stage
      from leads
      where clinic_id = $1 and workspace_id = $2 and id = $3
      limit 1
    `,
    [scope.clinicId, scope.workspaceId, leadId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  return result.rows[0];
}

async function loadFlowRow(client, scope, flowId) {
  const result = await client.query(
    `
      select id, clinic_id, workspace_id, name
      from automation_flows
      where clinic_id = $1 and workspace_id = $2 and id = $3
      limit 1
    `,
    [scope.clinicId, scope.workspaceId, flowId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'FLOW_NOT_FOUND', 'Automation flow not found.');
  }

  return result.rows[0];
}

async function loadMessageRow(client, clinicId, messageId) {
  const result = await client.query(
    `
      select
        om.id,
        om.clinic_id,
        om.entity_type,
        om.entity_id,
        om.template_id,
        om.message_type,
        om.provider_message_id,
        om.status,
        om.created_at,
        mt.name as template_name,
        mt.category as template_category,
        mt.channel_type,
        l.workspace_id,
        l.stage,
        l.intent_score,
        l.id as lead_id
      from outbound_messages om
      left join message_templates mt on mt.id = om.template_id
      left join leads l on om.entity_type = 'lead' and l.clinic_id = om.clinic_id and l.id = om.entity_id
      where om.clinic_id = $1 and om.id = $2
      limit 1
    `,
    [clinicId, messageId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Outbound message not found.');
  }

  return result.rows[0];
}

async function resolveTrackedEntity(client, clinicContext, normalized) {
  const scope = resolveFeedbackScope(clinicContext);

  if (!scope.workspaceId) {
    throw new AppError(400, 'WORKSPACE_SCOPE_REQUIRED', 'AI feedback actions require an active workspace.');
  }

  if (normalized.entityType === 'lead') {
    const lead = await loadLeadRow(client, scope, normalized.entityId);

    return {
      workspaceId: lead.workspace_id,
      relatedLeadId: lead.id,
      metadata: {
        leadId: lead.id,
        stage: lead.stage,
        intentScore: lead.intent_score,
        status: lead.status
      }
    };
  }

  if (normalized.entityType === 'flow') {
    const flow = await loadFlowRow(client, scope, normalized.entityId);

    return {
      workspaceId: flow.workspace_id,
      relatedLeadId: null,
      metadata: {
        flowId: flow.id,
        flowName: flow.name
      }
    };
  }

  const message = await loadMessageRow(client, scope.clinicId, normalized.entityId);
  const workspaceId = message.workspace_id || scope.workspaceId;

  if (workspaceId !== scope.workspaceId) {
    throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'Outbound message is outside the current workspace scope.');
  }

  return {
    workspaceId,
    relatedLeadId: message.lead_id || null,
    metadata: {
      outboundMessageId: message.id,
      leadId: message.lead_id || null,
      templateId: message.template_id,
      template: message.template_name,
      category: message.template_category,
      channelType: message.channel_type,
      messageType: message.message_type,
      providerMessageId: message.provider_message_id,
      stage: message.stage,
      intentScore: message.intent_score,
      messageStatus: message.status
    }
  };
}

function buildOutcomeIdempotencyKey(normalized, metadata, options = {}) {
  if (options.sourceEventId) {
    return `event:${options.sourceEventId}`;
  }

  if (metadata.idempotencyKey) {
    return String(metadata.idempotencyKey);
  }

  const stableIdentity = {
    entityType: normalized.entityType,
    entityId: normalized.entityId,
    actionType: normalized.actionType,
    outcomeType: normalized.outcomeType,
    outboundMessageId: metadata.outboundMessageId || null,
    providerMessageId: metadata.providerMessageId || null,
    externalEventId: metadata.externalEventId || null,
    leadId: metadata.leadId || null,
    flowId: metadata.flowId || null,
    stage: metadata.stage || null,
    template: metadata.template || null,
    tone: metadata.tone || null
  };

  return crypto.createHash('sha1').update(JSON.stringify(stableIdentity)).digest('hex');
}

function buildPerformanceWhere(entityType) {
  if (entityType === 'lead') {
    return `
      (
        (entity_type = 'lead' and entity_id = $3)
        or
        (entity_type = 'message' and metadata_json->>'leadId' = $3::text)
      )
    `;
  }

  return 'entity_type = $4 and entity_id = $3';
}

async function loadPerformanceSnapshot(client, clinicContext, entityType, entityId) {
  const normalizedEntityId = validateEntityId(entityId, 'entityId');
  const scope = resolveFeedbackScope(clinicContext);

  if (!scope.workspaceId) {
    throw new AppError(400, 'WORKSPACE_SCOPE_REQUIRED', 'AI performance queries require an active workspace.');
  }

  if (entityType === 'lead') {
    await loadLeadRow(client, scope, normalizedEntityId);
  } else if (entityType === 'flow') {
    await loadFlowRow(client, scope, normalizedEntityId);
  } else {
    const message = await loadMessageRow(client, scope.clinicId, normalizedEntityId);

    if ((message.workspace_id || scope.workspaceId) !== scope.workspaceId) {
      throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'Outbound message is outside the current workspace scope.');
    }
  }

  const values = entityType === 'lead'
    ? [scope.clinicId, scope.workspaceId, normalizedEntityId]
    : [scope.clinicId, scope.workspaceId, normalizedEntityId, entityType];
  const baseWhere = buildPerformanceWhere(entityType);
  const metricsResult = await client.query(
    `
      select
        count(*) filter (where action_type in ('message_sent', 'followup_sent') and outcome_type = 'sent')::int as sent_count,
        count(*) filter (where outcome_type = 'opened')::int as opened_count,
        count(*) filter (where outcome_type = 'replied')::int as replied_count,
        count(*) filter (where outcome_type = 'converted')::int as converted_count,
        count(*) filter (where outcome_type = 'ignored')::int as ignored_count
      from ai_outcomes
      where clinic_id = $1
        and workspace_id = $2
        and ${baseWhere}
    `,
    values
  );
  const breakdownResult = await client.query(
    `
      select
        nullif(coalesce(metadata_json->>'template', 'direct'), '') as template,
        nullif(coalesce(metadata_json->>'tone', 'default'), '') as tone,
        nullif(coalesce(metadata_json->>'stage', 'unknown'), '') as stage,
        count(*) filter (where action_type in ('message_sent', 'followup_sent') and outcome_type = 'sent')::int as sent_count,
        count(*) filter (where outcome_type = 'opened')::int as opened_count,
        count(*) filter (where outcome_type = 'replied')::int as replied_count,
        count(*) filter (where outcome_type = 'converted')::int as converted_count
      from ai_outcomes
      where clinic_id = $1
        and workspace_id = $2
        and ${baseWhere}
      group by 1, 2, 3
      order by sent_count desc, replied_count desc, converted_count desc, template asc
    `,
    values
  );

  const summary = metricsResult.rows[0];
  const sentCount = Number(summary.sent_count || 0);
  const openedCount = Number(summary.opened_count || 0);
  const repliedCount = Number(summary.replied_count || 0);
  const convertedCount = Number(summary.converted_count || 0);
  const ignoredCount = Number(summary.ignored_count || 0);

  return {
    entityType,
    entityId: normalizedEntityId,
    metrics: {
      sentCount,
      openedCount,
      repliedCount,
      convertedCount,
      ignoredCount,
      openRate: toMetric(openedCount, sentCount),
      replyRate: toMetric(repliedCount, sentCount),
      conversionRate: toMetric(convertedCount, sentCount)
    },
    breakdown: breakdownResult.rows.map((row) => {
      const groupSentCount = Number(row.sent_count || 0);
      const groupOpenedCount = Number(row.opened_count || 0);
      const groupRepliedCount = Number(row.replied_count || 0);
      const groupConvertedCount = Number(row.converted_count || 0);

      return {
        template: row.template,
        tone: row.tone,
        stage: row.stage,
        sentCount: groupSentCount,
        openRate: toMetric(groupOpenedCount, groupSentCount),
        replyRate: toMetric(groupRepliedCount, groupSentCount),
        conversionRate: toMetric(groupConvertedCount, groupSentCount)
      };
    })
  };
}

async function getAiPerformance(clinicContext, entityId, entityType = 'lead') {
  const client = await getPool().connect();

  try {
    return await loadPerformanceSnapshot(client, clinicContext, validatePerformanceEntityType(entityType), entityId);
  } finally {
    client.release();
  }
}

async function trackOutcome(clinicContext, payload, options = {}) {
  const normalized = validateOutcomeTrackingPayload(payload);
  const client = await getPool().connect();
  let clientReleased = false;

  try {
    await client.query('begin');
    const resolution = await resolveTrackedEntity(client, clinicContext, normalized);
    const metadata = {
      ...resolution.metadata,
      ...normalized.metadata,
      workspaceId: resolution.workspaceId
    };
    const idempotencyKey = buildOutcomeIdempotencyKey(normalized, metadata, options);
    const insertResult = await client.query(
      `
        insert into ai_outcomes (
          clinic_id,
          workspace_id,
          entity_type,
          entity_id,
          action_type,
          outcome_type,
          metadata_json,
          source_event_id,
          idempotency_key
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        on conflict (clinic_id, workspace_id, idempotency_key)
        do nothing
        returning *
      `,
      [
        clinicContext.currentClinic.id,
        resolution.workspaceId,
        normalized.entityType,
        normalized.entityId,
        normalized.actionType,
        normalized.outcomeType,
        JSON.stringify(metadata),
        options.sourceEventId || null,
        idempotencyKey
      ]
    );

    let storedOutcome;
    let duplicate = false;

    if (insertResult.rowCount === 0) {
      duplicate = true;
      const existingResult = await client.query(
        `
          select *
          from ai_outcomes
          where clinic_id = $1 and workspace_id = $2 and idempotency_key = $3
          limit 1
        `,
        [clinicContext.currentClinic.id, resolution.workspaceId, idempotencyKey]
      );
      storedOutcome = mapOutcome(existingResult.rows[0]);
    } else {
      storedOutcome = mapOutcome(insertResult.rows[0]);
      await recordAuditLog(
        {
          clinicId: clinicContext.currentClinic.id,
          entityType: normalized.entityType,
          entityId: normalized.entityId,
          actionType: 'ai.outcome_recorded',
          actorUserId: clinicContext.currentUser?.id || null,
          contextJson: {
            outcomeId: storedOutcome.id,
            actionType: normalized.actionType,
            outcomeType: normalized.outcomeType,
            leadId: resolution.relatedLeadId,
            sourceEventId: options.sourceEventId || null
          }
        },
        client
      );
    }

    await client.query('commit');
    client.release();
    clientReleased = true;

    const performanceEntityId = resolution.relatedLeadId || (normalized.entityType === 'lead' ? normalized.entityId : null);
    const performance = performanceEntityId
      ? await getAiPerformance(clinicContext, performanceEntityId, 'lead')
      : null;

    if (!duplicate) {
      await publishDomainEventSafe(
        {
          clinicId: clinicContext.currentClinic.id,
          eventType: 'ai.outcome_recorded',
          entityType: normalized.entityType,
          entityId: normalized.entityId,
          payloadJson: {
            outcomeId: storedOutcome.id,
            sourceEventId: options.sourceEventId || null,
            actionType: normalized.actionType,
            outcomeType: normalized.outcomeType,
            metadata,
            leadId: resolution.relatedLeadId,
            workspaceId: resolution.workspaceId,
            actorUserId: clinicContext.currentUser?.id || null
          }
        },
        'Event bus ai.outcome_recorded publish failed:'
      );

      if (performanceEntityId && performance) {
        await publishDomainEventSafe(
          {
            clinicId: clinicContext.currentClinic.id,
            eventType: 'ai.performance_updated',
            entityType: 'lead',
            entityId: performanceEntityId,
            payloadJson: {
              metrics: performance.metrics,
              workspaceId: resolution.workspaceId,
              actorUserId: clinicContext.currentUser?.id || null
            }
          },
          'Event bus ai.performance_updated publish failed:'
        );
      }
    }

    return {
      outcome: storedOutcome,
      duplicate,
      performance
    };
  } catch (error) {
    if (!clientReleased) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

function buildOutcomePayloadFromEvent(event) {
  switch (event.eventType) {
    case 'message.sent':
      if (!event.payloadJson?.outboundMessageId) {
        return null;
      }

      return {
        entityType: 'message',
        entityId: event.payloadJson.outboundMessageId,
        actionType: event.payloadJson.messageType === 'automation' ? 'followup_sent' : 'message_sent',
        outcomeType: 'sent',
        metadata: {
          outboundMessageId: event.payloadJson.outboundMessageId,
          leadId: event.entityType === 'lead' ? event.entityId : null,
          channelType: event.payloadJson.channelType || null,
          messageType: event.payloadJson.messageType || null,
          workspaceId: event.payloadJson.workspaceId || null
        }
      };
    case 'message.delivered':
      if (!event.payloadJson?.outboundMessageId) {
        return null;
      }

      return {
        entityType: 'message',
        entityId: event.payloadJson.outboundMessageId,
        actionType: event.payloadJson.actionType || 'message_sent',
        outcomeType: 'delivered',
        metadata: {
          outboundMessageId: event.payloadJson.outboundMessageId,
          leadId: event.payloadJson.leadId || (event.entityType === 'lead' ? event.entityId : null),
          workspaceId: event.payloadJson.workspaceId || null
        }
      };
    case 'message.replied':
      if (!event.payloadJson?.outboundMessageId) {
        return null;
      }

      return {
        entityType: 'message',
        entityId: event.payloadJson.outboundMessageId,
        actionType: event.payloadJson.actionType || 'message_sent',
        outcomeType: 'replied',
        metadata: {
          outboundMessageId: event.payloadJson.outboundMessageId,
          leadId: event.payloadJson.leadId || (event.entityType === 'lead' ? event.entityId : null),
          workspaceId: event.payloadJson.workspaceId || null
        }
      };
    case 'lead.converted':
      return {
        entityType: 'lead',
        entityId: event.entityId,
        actionType: 'lead_status_changed',
        outcomeType: 'converted',
        metadata: {
          workspaceId: event.payloadJson.workspaceId || null,
          previousStatus: event.payloadJson.previousStatus || null,
          nextStatus: event.payloadJson.status || 'converted'
        }
      };
    case 'lead.lost':
      return {
        entityType: 'lead',
        entityId: event.entityId,
        actionType: 'lead_status_changed',
        outcomeType: 'lost',
        metadata: {
          workspaceId: event.payloadJson.workspaceId || null,
          previousStatus: event.payloadJson.previousStatus || null,
          nextStatus: event.payloadJson.status || 'lost'
        }
      };
    default:
      return null;
  }
}

async function trackOutcomeFromEvent(event) {
  const payload = buildOutcomePayloadFromEvent(event);

  if (!payload) {
    return null;
  }

  const { resolveWorkerContext } = require('../worker-engine/worker');
  const context = await resolveWorkerContext(
    event.clinicId,
    event.payloadJson?.actorUserId || null,
    event.payloadJson?.workspaceId || null
  );

  return trackOutcome(context, payload, { sourceEventId: event.id });
}

async function applyOutcomeLearning(event) {
  const outcomePayload = event.payloadJson || {};
  const rawLeadId = outcomePayload.leadId || (event.entityType === 'lead' ? event.entityId : null);
  const delta = OUTCOME_SCORE_DELTAS[outcomePayload.outcomeType] || 0;

  if (!rawLeadId) {
    return {
      updated: false,
      leadId: null,
      delta: 0
    };
  }

  const leadId = validateEntityId(rawLeadId, 'leadId');

  if (delta === 0) {
    return {
      updated: false,
      leadId,
      delta: 0
    };
  }

  const { resolveWorkerContext } = require('../worker-engine/worker');
  const context = await resolveWorkerContext(
    event.clinicId,
    outcomePayload.actorUserId || null,
    outcomePayload.workspaceId || null
  );
  const leadDetail = await getLeadDetail(context, leadId);
  const previousScore = Number(leadDetail.intentScore || 0);
  const nextScore = clampIntentScore(previousScore + delta);

  if (nextScore === previousScore) {
    return {
      updated: false,
      leadId,
      previousScore,
      nextScore,
      delta
    };
  }

  await updateLead(context, leadId, { intentScore: nextScore });
  await recordAuditLog({
    clinicId: event.clinicId,
    entityType: 'lead',
    entityId: leadId,
    actionType: 'ai.learning_updated',
    actorUserId: context.currentUser?.id || null,
    contextJson: {
      outcomeId: outcomePayload.outcomeId || null,
      outcomeType: outcomePayload.outcomeType,
      delta,
      previousScore,
      nextScore,
      sourceEventId: event.id
    }
  });

  await publishDomainEventSafe(
    {
      clinicId: event.clinicId,
      eventType: 'ai.learning_updated',
      entityType: 'lead',
      entityId: leadId,
      payloadJson: {
        leadId,
        previousScore,
        nextScore,
        delta,
        outcomeId: outcomePayload.outcomeId || null,
        outcomeType: outcomePayload.outcomeType,
        workspaceId: context.currentWorkspace?.id || null,
        actorUserId: context.currentUser?.id || null
      }
    },
    'Event bus ai.learning_updated publish failed:'
  );

  return {
    updated: true,
    leadId,
    previousScore,
    nextScore,
    delta
  };
}

module.exports = {
  OUTCOME_SCORE_DELTAS,
  trackOutcome,
  trackOutcomeFromEvent,
  applyOutcomeLearning,
  getAiPerformance
};