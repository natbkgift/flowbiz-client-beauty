'use strict';

const { recordAuditLog } = require('../audit/service');

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

function safeToken(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim();
  if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9_.:-]+$/.test(normalized)) {
    return fallback;
  }

  return normalized;
}

function safeReasonCode(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized || normalized.length > 100 || !/^[A-Z0-9_]+$/.test(normalized)) {
    return 'UNSAFE_REASON_REDACTED';
  }

  return normalized;
}

function safeNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function buildSafeResultSummary(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return null;
  }

  const adapterResult = result.adapterResult && typeof result.adapterResult === 'object'
    ? result.adapterResult
    : null;

  return cleanObject({
    provider: safeToken(result.provider),
    external_call_made: hasOwn(result, 'externalCallMade') ? Boolean(result.externalCallMade) : undefined,
    safe_result: hasOwn(result, 'safeResult') ? Boolean(result.safeResult) : undefined,
    dry_run: hasOwn(result, 'dryRun') ? Boolean(result.dryRun) : undefined,
    blocked_real_send: hasOwn(result, 'blockedRealSend') ? Boolean(result.blockedRealSend) : undefined,
    message_id_present: hasOwn(result, 'messageId') ? Boolean(result.messageId) : undefined,
    accepted_count: Array.isArray(result.accepted) ? result.accepted.length : undefined,
    rejected_count: Array.isArray(result.rejected) ? result.rejected.length : undefined,
    reason: safeReasonCode(result.reason),
    adapter_provider: adapterResult ? safeToken(adapterResult.provider) : undefined,
    adapter_external_call_made: adapterResult && hasOwn(adapterResult, 'externalCallMade')
      ? Boolean(adapterResult.externalCallMade)
      : undefined,
    adapter_dry_run: adapterResult && hasOwn(adapterResult, 'dryRun') ? Boolean(adapterResult.dryRun) : undefined,
    adapter_blocked_real_send: adapterResult && hasOwn(adapterResult, 'blockedRealSend')
      ? Boolean(adapterResult.blockedRealSend)
      : undefined
  });
}

function buildSafeNotificationDeliveryAuditContext({
  draft,
  approval = null,
  attempt = null,
  context = {},
  channel = null,
  provider = null,
  mode = null,
  status = null,
  reason = null,
  result = null
}) {
  return cleanObject({
    clinic_id: safeNumber(draft?.tenantId),
    draft_id: safeNumber(draft?.id),
    delivery_attempt_id: safeNumber(attempt?.id),
    approval_request_id: safeNumber(approval?.id),
    actor_user_id: safeNumber(context.currentUser?.id),
    channel: safeToken(channel || attempt?.channel || draft?.channel),
    provider: safeToken(provider || attempt?.provider),
    mode: safeToken(mode || attempt?.mode),
    status: safeToken(status || attempt?.status),
    reason: safeReasonCode(reason),
    result: buildSafeResultSummary(result),
    recipient_type: safeToken(draft?.recipientType || attempt?.recipientType),
    recipient_id: safeNumber(draft?.recipientId ?? attempt?.recipientId),
    recipient_ref_present: draft?.recipientRef !== undefined || attempt?.recipientRef !== undefined
      ? Boolean(draft?.recipientRef || attempt?.recipientRef)
      : undefined,
    timestamp: new Date().toISOString()
  });
}

async function auditNotificationDeliveryEvent(client, {
  actionType,
  draft,
  approval = null,
  attempt = null,
  context = {},
  channel = null,
  provider = null,
  mode = null,
  status = null,
  reason = null,
  result = null
}) {
  if (!draft) {
    return null;
  }

  return recordAuditLog({
    clinicId: draft.tenantId,
    entityType: 'notification_delivery_attempt',
    entityId: attempt?.id || draft.id,
    actionType,
    actorUserId: context.currentUser?.id || null,
    contextJson: buildSafeNotificationDeliveryAuditContext({
      draft,
      approval,
      attempt,
      context,
      channel,
      provider,
      mode,
      status,
      reason,
      result
    })
  }, client);
}

module.exports = {
  auditNotificationDeliveryEvent,
  buildSafeNotificationDeliveryAuditContext,
  buildSafeResultSummary
};
