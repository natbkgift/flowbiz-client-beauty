const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { validateEntityId } = require('../ai/validation');
const { generateLeadMessage } = require('../ai/service');
const { sendLeadOutboundMessage } = require('../messaging/service');
const { recordAuditLog } = require('../audit/service');
const { getAiPerformance } = require('../ai-feedback/service');

function resolveActionScope(clinicContext) {
  return {
    clinicId: clinicContext.currentClinic.id,
    workspaceId: clinicContext.currentWorkspace?.id || null,
    organizationId: clinicContext.currentOrganization?.id || null
  };
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

async function loadLeadForActions(client, scope, leadId) {
  if (!scope.workspaceId) {
    throw new AppError(400, 'WORKSPACE_SCOPE_REQUIRED', 'AI auto actions require an active workspace.');
  }

  const result = await client.query(
    `
      select id, clinic_id, workspace_id, full_name, intent_score, status, stage, owner_user_id, last_contacted_at, next_followup_at
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

async function reserveActionExecution(client, scope, leadId, actionKey, sourceEventId, metadata = {}) {
  const result = await client.query(
    `
      insert into ai_action_executions (
        clinic_id,
        workspace_id,
        entity_type,
        entity_id,
        action_key,
        status,
        metadata_json,
        source_event_id
      )
      values ($1, $2, 'lead', $3, $4, 'pending', $5::jsonb, $6)
      on conflict (clinic_id, workspace_id, entity_type, entity_id, action_key, source_event_id)
      do nothing
      returning *
    `,
    [scope.clinicId, scope.workspaceId, leadId, actionKey, JSON.stringify(metadata), sourceEventId || null]
  );

  return result.rows[0] || null;
}

async function finalizeActionExecution(client, actionExecutionId, status, metadata = {}) {
  const result = await client.query(
    `
      update ai_action_executions
      set status = $2,
          metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
      where id = $1
      returning *
    `,
    [actionExecutionId, status, JSON.stringify(metadata)]
  );

  return result.rows[0] || null;
}

async function countRecentActionExecutions(client, scope, leadId, actionKey, intervalExpression) {
  const result = await client.query(
    `
      select count(*)::int as action_count
      from ai_action_executions
      where clinic_id = $1
        and workspace_id = $2
        and entity_type = 'lead'
        and entity_id = $3
        and action_key = $4
        and status in ('pending', 'executed')
        and created_at >= now() - interval '${intervalExpression}'
    `,
    [scope.clinicId, scope.workspaceId, leadId, actionKey]
  );

  return Number(result.rows[0].action_count || 0);
}

async function loadLeadOutcomeStats(client, scope, leadId) {
  const result = await client.query(
    `
      select
        max(created_at) filter (where action_type in ('message_sent', 'followup_sent') and outcome_type = 'sent') as last_sent_at,
        max(created_at) filter (where outcome_type = 'replied') as last_replied_at,
        count(*) filter (where outcome_type = 'ignored' and created_at >= now() - interval '30 days')::int as ignored_count,
        count(*) filter (where action_type in ('message_sent', 'followup_sent') and outcome_type = 'sent' and created_at >= now() - interval '30 days')::int as sent_count_30d
      from ai_outcomes
      where clinic_id = $1
        and workspace_id = $2
        and (
          (entity_type = 'lead' and entity_id = $3)
          or
          (entity_type = 'message' and metadata_json->>'leadId' = $3::text)
        )
    `,
    [scope.clinicId, scope.workspaceId, leadId]
  );

  return result.rows[0];
}

async function resolvePrimaryChannelId(client, clinicId) {
  const result = await client.query(
    `
      select id
      from channels
      where clinic_id = $1 and status = 'active'
      order by is_primary desc, id asc
      limit 1
    `,
    [clinicId]
  );

  return result.rows[0]?.id || null;
}

async function emitActionExecuted(clinicContext, leadId, actionKey, metadata) {
  await publishDomainEventSafe(
    {
      clinicId: clinicContext.currentClinic.id,
      eventType: 'ai.action_executed',
      entityType: 'lead',
      entityId: leadId,
      payloadJson: {
        actionKey,
        ...metadata,
        workspaceId: clinicContext.currentWorkspace?.id || null,
        actorUserId: clinicContext.currentUser?.id || null
      }
    },
    'Event bus ai.action_executed publish failed:'
  );
}

async function createLeadOptimizationInsight(client, clinicContext, leadId, insightDataJson) {
  const result = await client.query(
    `
      insert into ai_insights (clinic_id, workspace_id, entity_type, entity_id, insight_type, insight_data_json)
      values ($1, $2, 'lead', $3, 'flow_optimization_suggestion', $4::jsonb)
      returning *
    `,
    [clinicContext.currentClinic.id, clinicContext.currentWorkspace.id, leadId, JSON.stringify(insightDataJson)]
  );

  return result.rows[0];
}

async function executeAutoAction(clinicContext, leadId, options = {}) {
  const normalizedLeadId = validateEntityId(leadId, 'leadId');
  const scope = resolveActionScope(clinicContext);
  const client = await getPool().connect();

  try {
    const lead = await loadLeadForActions(client, scope, normalizedLeadId);
    const outcomeStats = await loadLeadOutcomeStats(client, scope, normalizedLeadId);
    const performance = await getAiPerformance(clinicContext, normalizedLeadId, 'lead');
    const actions = [];

    if (Number(lead.intent_score || 0) > 80) {
      await client.query('begin');
      const reserved = await reserveActionExecution(client, scope, normalizedLeadId, 'hot_lead_followup', options.sourceEventId, {
        triggerEventType: options.triggerEventType || 'manual',
        intentScore: lead.intent_score
      });

      if (reserved) {
        await client.query('commit');
        const { handleDomainEvent } = require('../automation/service');
        const automationResult = await handleDomainEvent(clinicContext, {
          eventName: 'ai.hot_lead_followup',
          entityType: 'lead',
          entityId: normalizedLeadId,
          eventId: `ai-hot-lead-${options.sourceEventId || reserved.id}`,
          contextJson: {
            leadId: normalizedLeadId,
            intentScore: Number(lead.intent_score || 0),
            actorUserId: clinicContext.currentUser?.id || null,
            workspaceId: scope.workspaceId,
            organizationId: scope.organizationId
          },
          deferExecution: true
        });

        await finalizeActionExecution(client, reserved.id, 'executed', {
          matchedFlows: automationResult.matchedFlows,
          executionIds: automationResult.executionIds,
          skippedExecutionIds: automationResult.skippedExecutionIds
        });
        await recordAuditLog({
          clinicId: scope.clinicId,
          entityType: 'lead',
          entityId: normalizedLeadId,
          actionType: 'ai.auto_action_executed',
          actorUserId: clinicContext.currentUser?.id || null,
          contextJson: {
            actionKey: 'hot_lead_followup',
            matchedFlows: automationResult.matchedFlows,
            sourceEventId: options.sourceEventId || null
          }
        });
        await emitActionExecuted(clinicContext, normalizedLeadId, 'hot_lead_followup', {
          matchedFlows: automationResult.matchedFlows,
          executionIds: automationResult.executionIds
        });
        actions.push({
          actionKey: 'hot_lead_followup',
          status: 'executed',
          matchedFlows: automationResult.matchedFlows,
          executionIds: automationResult.executionIds,
          skippedExecutionIds: automationResult.skippedExecutionIds
        });
      } else {
        await client.query('rollback').catch(() => {});
      }
    }

    const ignoredCount = Number(outcomeStats.ignored_count || 0);

    if (ignoredCount >= 2) {
      await client.query('begin');
      const reserved = await reserveActionExecution(client, scope, normalizedLeadId, 'adjust_message_strategy', options.sourceEventId, {
        recommendedTone: ignoredCount >= 3 ? 'professional' : 'friendly',
        recommendedCooldownHours: ignoredCount >= 3 ? 72 : 48,
        ignoredCount
      });

      if (reserved) {
        const updated = await finalizeActionExecution(client, reserved.id, 'executed', {
          recommendedTone: ignoredCount >= 3 ? 'professional' : 'friendly',
          recommendedCooldownHours: ignoredCount >= 3 ? 72 : 48,
          ignoredCount
        });
        await client.query('commit');
        await emitActionExecuted(clinicContext, normalizedLeadId, 'adjust_message_strategy', {
          recommendedTone: updated.metadata_json.recommendedTone,
          recommendedCooldownHours: updated.metadata_json.recommendedCooldownHours,
          ignoredCount
        });
        actions.push({
          actionKey: 'adjust_message_strategy',
          status: 'executed',
          recommendedTone: updated.metadata_json.recommendedTone,
          recommendedCooldownHours: updated.metadata_json.recommendedCooldownHours,
          ignoredCount
        });
      } else {
        await client.query('rollback').catch(() => {});
      }
    }

    const lastSentAt = outcomeStats.last_sent_at ? new Date(outcomeStats.last_sent_at) : null;
    const lastRepliedAt = outcomeStats.last_replied_at ? new Date(outcomeStats.last_replied_at) : null;
    const noReplyWindowElapsed = lastSentAt && (Date.now() - lastSentAt.getTime()) >= 48 * 60 * 60 * 1000;
    const repliedAfterLastSend = lastSentAt && lastRepliedAt && lastRepliedAt.getTime() >= lastSentAt.getTime();

    if (noReplyWindowElapsed && !repliedAfterLastSend) {
      const sentLast48h = await countRecentActionExecutions(client, scope, normalizedLeadId, 'send_followup_message', '48 hours');
      const sentLast7d = await countRecentActionExecutions(client, scope, normalizedLeadId, 'send_followup_message', '7 days');

      if (sentLast48h === 0 && sentLast7d < 3 && ignoredCount < 3) {
        await client.query('begin');
        const reserved = await reserveActionExecution(client, scope, normalizedLeadId, 'send_followup_message', options.sourceEventId, {
          triggerEventType: options.triggerEventType || 'manual',
          lastSentAt: lastSentAt.toISOString(),
          ignoredCount
        });

        if (reserved) {
          await client.query('commit');
          const channelId = await resolvePrimaryChannelId(client, scope.clinicId);

          if (channelId) {
            const tone = ignoredCount >= 2 ? 'professional' : 'friendly';
            const generated = await generateLeadMessage(clinicContext, {
              leadId: normalizedLeadId,
              tone,
              context: {
                goal: 'ติดตามลูกค้าที่ไม่มีการตอบกลับภายใน 48 ชั่วโมง',
                autoAction: true
              }
            });
            const outbound = await sendLeadOutboundMessage(
              clinicContext,
              normalizedLeadId,
              {
                channelId,
                content: generated.messageText
              },
              { messageType: 'automation' }
            );

            await finalizeActionExecution(client, reserved.id, 'executed', {
              outboundMessageId: outbound.id,
              channelId,
              tone,
              ignoredCount
            });
            await emitActionExecuted(clinicContext, normalizedLeadId, 'send_followup_message', {
              outboundMessageId: outbound.id,
              tone,
              ignoredCount
            });
            actions.push({
              actionKey: 'send_followup_message',
              status: 'executed',
              outboundMessageId: outbound.id,
              tone,
              ignoredCount
            });
          } else {
            await finalizeActionExecution(client, reserved.id, 'skipped', {
              reason: 'NO_ACTIVE_CHANNEL'
            });
          }
        } else {
          await client.query('rollback').catch(() => {});
        }
      }
    }

    const highDropOff = performance.metrics.sentCount >= 3
      && (performance.metrics.replyRate <= 0.15 || performance.metrics.openRate <= 0.25 || ignoredCount >= 3);

    if (highDropOff) {
      await client.query('begin');
      const reserved = await reserveActionExecution(client, scope, normalizedLeadId, 'suggest_flow_optimization', options.sourceEventId, {
        metrics: performance.metrics,
        ignoredCount,
        stage: lead.stage
      });

      if (reserved) {
        const insight = await createLeadOptimizationInsight(client, clinicContext, normalizedLeadId, {
          stage: lead.stage,
          metrics: performance.metrics,
          ignoredCount,
          suggestedChanges: [
            'ลดความถี่การ follow-up สำหรับ lead ที่ไม่มี engagement ต่อเนื่อง',
            'ทดสอบข้อความใหม่ที่ tone สุภาพขึ้นหรือเฉพาะเจาะจงกับ stage ปัจจุบัน',
            'ตรวจ flow ที่เกี่ยวข้องกับ lead กลุ่มนี้และเพิ่ม guard condition ตาม intent score'
          ]
        });
        await finalizeActionExecution(client, reserved.id, 'executed', {
          insightId: insight.id,
          metrics: performance.metrics,
          ignoredCount
        });
        await client.query('commit');
        await emitActionExecuted(clinicContext, normalizedLeadId, 'suggest_flow_optimization', {
          insightId: insight.id,
          metrics: performance.metrics,
          ignoredCount
        });
        actions.push({
          actionKey: 'suggest_flow_optimization',
          status: 'executed',
          insightId: insight.id,
          metrics: performance.metrics,
          ignoredCount
        });
      } else {
        await client.query('rollback').catch(() => {});
      }
    }

    return {
      leadId: normalizedLeadId,
      actions,
      metrics: performance.metrics
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleAutoActionEvent(event) {
  if (event.entityType !== 'lead') {
    return null;
  }

  const { resolveWorkerContext } = require('../worker-engine/worker');
  const context = await resolveWorkerContext(
    event.clinicId,
    event.payloadJson?.actorUserId || null,
    event.payloadJson?.workspaceId || null
  );

  return executeAutoAction(context, event.entityId, {
    sourceEventId: event.id,
    triggerEventType: event.eventType
  });
}

module.exports = {
  executeAutoAction,
  handleAutoActionEvent
};