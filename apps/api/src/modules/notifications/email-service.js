'use strict';

const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { getAdminNotificationDraft, isValidNotificationEmail } = require('./service');
const { getLatestApprovalForDraft } = require('./approval-service');
const { mapNotificationDeliveryAttemptRow } = require('./serializer');
const { getNotificationProviderReadiness } = require('./provider-readiness');
const { getNotificationChannelConfig } = require('./provider-config');
const { assertNotificationRealDeliveryAllowed } = require('./provider-guards');
const { assertNotificationSendControlAllowed } = require('./send-control');
const { resolveEmailAdapter } = require('./email-adapter');
const { auditNotificationDeliveryEvent } = require('./audit');

function buildRealEmailDeliveryIdempotencyKey(draft, provider) {
  return [
    `tenant:${draft.tenantId}`,
    `draft:${draft.id}`,
    'mode:real',
    'channel:email',
    `provider:${provider}`
  ].join(':');
}

function buildEmailPayload(draft, channelConfig) {
  const to = String(draft.recipientRef || '').trim();
  if (!to) {
    throw new AppError(400, 'NOTIFICATION_EMAIL_RECIPIENT_MISSING', 'Notification email recipient is missing.');
  }
  if (!isValidNotificationEmail(to)) {
    throw new AppError(400, 'NOTIFICATION_EMAIL_RECIPIENT_INVALID', 'Notification email recipient must be a valid email address.');
  }

  return {
    tenantId: draft.tenantId,
    draftId: draft.id,
    channel: 'email',
    mode: 'real',
    provider: channelConfig.provider,
    from: channelConfig.from,
    replyTo: channelConfig.replyTo || null,
    to,
    subject: draft.subject || draft.title || 'FlowBiz notification',
    body: draft.message,
    recipient: {
      type: draft.recipientType,
      id: draft.recipientId,
      ref: draft.recipientRef
    },
    source: {
      type: draft.sourceType,
      id: draft.sourceId
    },
    eventType: draft.eventType,
    metadata: draft.metadata || {}
  };
}

async function loadExistingRealEmailAttempt(client, draft, provider) {
  const result = await client.query(
    `
      select *
      from notification_delivery_attempts
      where clinic_id = $1 and draft_id = $2 and mode = 'real' and channel = 'email' and provider = $3
      order by created_at desc, id desc
      limit 1
    `,
    [draft.tenantId, draft.id, provider]
  );

  return result.rows[0] ? mapNotificationDeliveryAttemptRow(result.rows[0]) : null;
}

async function insertRealEmailAttempt(client, draft, payload, provider, idempotencyKey) {
  const result = await client.query(
    `
      insert into notification_delivery_attempts (
        clinic_id,
        draft_id,
        channel,
        provider,
        mode,
        status,
        recipient_type,
        recipient_id,
        recipient_ref,
        payload_json,
        result_json,
        idempotency_key
      )
      values ($1, $2, 'email', $3, 'real', 'sending', $4, $5, $6, $7::jsonb, '{}'::jsonb, $8)
      on conflict (idempotency_key) do nothing
      returning *
    `,
    [
      draft.tenantId,
      draft.id,
      provider,
      draft.recipientType,
      draft.recipientId,
      draft.recipientRef,
      JSON.stringify(payload),
      idempotencyKey
    ]
  );

  if (result.rowCount > 0) {
    return mapNotificationDeliveryAttemptRow(result.rows[0]);
  }

  throw new AppError(409, 'NOTIFICATION_EMAIL_SEND_BLOCKED', 'Existing real email attempt is already in progress or completed.');
}

async function updateAttemptResult(client, attempt, status, resultJson) {
  const result = await client.query(
    `
      update notification_delivery_attempts
      set status = $1,
          result_json = $2::jsonb,
          updated_at = now()
      where id = $3
      returning *
    `,
    [status, JSON.stringify(resultJson), attempt.id]
  );

  return mapNotificationDeliveryAttemptRow(result.rows[0]);
}

async function sendApprovedNotificationEmail(context, draftId, options = {}) {
  const config = options.config || loadConfig();
  const pool = options.client || getPool();
  const client = options.client || pool;
  let draft = null;
  let approval = null;
  let provider = null;

  try {
    draft = await getAdminNotificationDraft(context, draftId, client);
    if (draft.channel !== 'email') {
      throw new AppError(400, 'NOTIFICATION_EMAIL_ONLY', 'Only email real delivery is supported in this release.');
    }

    approval = await getLatestApprovalForDraft(client, draft.tenantId, draft.id);
    const providerReadiness = getNotificationProviderReadiness(config);
    assertNotificationSendControlAllowed({ draft, approval, providerReadiness, config });
    assertNotificationRealDeliveryAllowed('email', config);

    const channelConfig = getNotificationChannelConfig('email', config);
    const resolved = resolveEmailAdapter(channelConfig.provider);
    provider = resolved.provider;
    const { adapter } = resolved;
    const existing = await loadExistingRealEmailAttempt(client, draft, provider);
    if (existing?.status === 'sent') {
      return existing;
    }
    if (existing && ['failed', 'blocked', 'sending'].includes(existing.status)) {
      throw new AppError(409, 'NOTIFICATION_EMAIL_SEND_BLOCKED', 'Existing real email attempt is not retryable in this release.');
    }

    const payload = buildEmailPayload(draft, channelConfig);
    const idempotencyKey = buildRealEmailDeliveryIdempotencyKey(draft, provider);
    const attempt = await insertRealEmailAttempt(client, draft, payload, provider, idempotencyKey);
    await auditNotificationDeliveryEvent(client, {
      actionType: 'notification.email_send_requested',
      draft,
      approval,
      attempt,
      context,
      channel: 'email',
      provider,
      mode: 'real',
      status: 'sending'
    });

    let adapterResult;
    try {
      adapterResult = await adapter.sendEmailNotification(payload, channelConfig);
    } catch (error) {
      const failedResult = {
        provider,
        externalCallMade: false,
        safeResult: false,
        reason: error.code || 'EMAIL_ADAPTER_FAILED'
      };
      const failedAttempt = await updateAttemptResult(client, attempt, 'failed', failedResult);
      await auditNotificationDeliveryEvent(client, {
        actionType: 'notification.email_send_failed',
        draft,
        approval,
        attempt: failedAttempt,
        context,
        channel: 'email',
        provider,
        mode: 'real',
        status: 'failed',
        reason: failedResult.reason,
        result: failedResult
      });
      throw new AppError(502, 'NOTIFICATION_EMAIL_SEND_FAILED', 'Email send failed.');
    }

    const safeResult = {
      provider,
      externalCallMade: Boolean(adapterResult.externalCallMade),
      messageId: adapterResult.messageId || null,
      accepted: Array.isArray(adapterResult.accepted) ? adapterResult.accepted : [],
      rejected: Array.isArray(adapterResult.rejected) ? adapterResult.rejected : [],
      safeResult: Boolean(adapterResult.safeResult)
    };
    const status = safeResult.safeResult && safeResult.accepted.length > 0 ? 'sent' : 'failed';
    const updatedAttempt = await updateAttemptResult(client, attempt, status, safeResult);
    await auditNotificationDeliveryEvent(client, {
      actionType: status === 'sent' ? 'notification.email_sent' : 'notification.email_send_failed',
      draft,
      approval,
      attempt: updatedAttempt,
      context,
      channel: 'email',
      provider,
      mode: 'real',
      status,
      result: safeResult
    });

    if (status !== 'sent') {
      throw new AppError(502, 'NOTIFICATION_EMAIL_SEND_FAILED', 'Email send failed.');
    }

    return updatedAttempt;
  } catch (error) {
    if (error instanceof AppError) {
      if (draft && error.code !== 'NOTIFICATION_EMAIL_SEND_FAILED') {
        await auditNotificationDeliveryEvent(client, {
          actionType: 'notification.email_send_blocked',
          draft,
          approval,
          attempt: null,
          context,
          channel: 'email',
          provider,
          mode: 'real',
          status: 'blocked',
          reason: error.code
        });
      }
      throw error;
    }
    throw error;
  }
}

module.exports = {
  buildEmailPayload,
  buildRealEmailDeliveryIdempotencyKey,
  sendApprovedNotificationEmail
};
