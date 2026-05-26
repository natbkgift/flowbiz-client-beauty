const crypto = require('node:crypto');
const { loadConfig } = require('../../../config');
const { AppError } = require('../../../common/errors');
const { recordAuditLog } = require('../../audit/service');
const { classifyMedicalSafety } = require('../../ai-agent/medical-safety');

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getHeaderValue(req, headerName) {
  const headers = req?.headers || {};
  return headers[headerName] || headers[headerName.toLowerCase()] || headers[headerName.toUpperCase()];
}

function getLineRuntime(configOverride = null) {
  const config = configOverride || loadConfig();
  return {
    mode: config.lineIntegrationMode || 'simulated',
    channelAccessToken: config.lineChannelAccessToken || '',
    channelSecret: config.lineChannelSecret || '',
    realSendEnabled: config.lineRealSendEnabled === true
  };
}

function getRawBody(input) {
  if (typeof input === 'string') {
    return input;
  }

  if (typeof input?.rawBody === 'string') {
    return input.rawBody;
  }

  if (input?.body && typeof input.body === 'object') {
    return JSON.stringify(input.body);
  }

  return '';
}

function normalizeSendInput(input = {}) {
  const recipientId = String(input.recipientId || input.to || '').trim();
  const text = String(input.text || '').trim();

  if (!recipientId) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'recipientId is required.');
  }

  if (!text) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'text is required.');
  }

  return {
    clinicId: input.clinicId ? Number(input.clinicId) : null,
    entityType: input.entityType || 'line_message',
    entityId: input.entityId ? Number(input.entityId) : null,
    actorUserId: input.actorUserId || null,
    recipientId,
    text,
    source: input.source || 'manual',
    approved: input.approved === true,
    dryRun: input.dryRun === true,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };
}

async function auditOutboundAttempt(input = {}) {
  if (!input.clinicId) {
    return null;
  }

  return recordAuditLog({
    clinicId: Number(input.clinicId),
    entityType: input.entityType || 'line_message',
    entityId: Number(input.entityId || input.clinicId),
    actionType: input.status === 'blocked' || input.status === 'failed'
      ? 'line.outbound_blocked'
      : 'line.outbound_attempt',
    actorUserId: input.actorUserId || null,
    contextJson: {
      mode: input.mode || 'simulated',
      status: input.status,
      dryRun: input.dryRun === true,
      reason: input.reason || null,
      integrationStatus: input.integrationStatus || null,
      providerMessageId: input.providerMessageId || null,
      recipientHash: input.recipientId ? sha256(input.recipientId) : null,
      messageHash: input.text ? sha256(input.text) : null,
      messageLength: input.text ? String(input.text).length : 0,
      medicalSafety: input.medicalSafety || null,
      metadata: input.metadata || {}
    }
  });
}

async function blockSend(normalized, runtime, reason, code, medicalSafety) {
  await auditOutboundAttempt({
    ...normalized,
    mode: runtime.mode,
    status: 'blocked',
    reason,
    medicalSafety,
    integrationStatus: runtime.mode === 'real' ? 'real_blocked' : 'simulated_blocked'
  });

  throw new AppError(400, code, reason);
}

async function enforceSafety(normalized, runtime) {
  const medicalSafety = classifyMedicalSafety(normalized.text);

  if (normalized.source === 'ai' && !normalized.approved) {
    await blockSend(normalized, runtime, 'AI-generated LINE messages require HITL approval before send.', 'HITL_APPROVAL_REQUIRED', medicalSafety);
  }

  if (medicalSafety.requiresHitl && !normalized.approved) {
    await blockSend(normalized, runtime, 'Medical-safety-sensitive LINE messages require staff approval before send.', 'MEDICAL_SAFETY_REVIEW_REQUIRED', medicalSafety);
  }

  return medicalSafety;
}

function buildDryRunResult(normalized, runtime, medicalSafety) {
  return {
    provider: 'line',
    providerMessageId: null,
    integrationStatus: runtime.mode === 'real' ? 'dry_run_real' : 'dry_run_simulated',
    status: 'sent',
    mode: runtime.mode,
    dryRun: true,
    sentAt: null,
    deliveredAt: null,
    failureReason: null,
    medicalSafety
  };
}

async function dryRunSend(input = {}, options = {}) {
  const runtime = getLineRuntime(options.config);
  const normalized = normalizeSendInput({ ...input, dryRun: true });
  const medicalSafety = await enforceSafety(normalized, runtime);
  const result = buildDryRunResult(normalized, runtime, medicalSafety);

  await auditOutboundAttempt({
    ...normalized,
    mode: runtime.mode,
    status: 'dry_run',
    integrationStatus: result.integrationStatus,
    medicalSafety
  });

  return result;
}

async function sendTextMessage(input = {}, options = {}) {
  const runtime = getLineRuntime(options.config);
  const normalized = normalizeSendInput(input);
  const medicalSafety = await enforceSafety(normalized, runtime);

  if (normalized.dryRun) {
    return dryRunSend(normalized, options);
  }

  if (runtime.mode === 'simulated') {
    const result = {
      provider: 'line',
      providerMessageId: `line-simulated-${Date.now()}`,
      integrationStatus: 'simulated',
      status: 'sent',
      mode: runtime.mode,
      dryRun: false,
      sentAt: new Date().toISOString(),
      deliveredAt: null,
      failureReason: null,
      medicalSafety
    };

    await auditOutboundAttempt({
      ...normalized,
      mode: runtime.mode,
      status: 'sent',
      integrationStatus: result.integrationStatus,
      providerMessageId: result.providerMessageId,
      medicalSafety
    });

    return result;
  }

  if (!runtime.realSendEnabled) {
    await blockSend(normalized, runtime, 'LINE real send is disabled. Set LINE_REAL_SEND_ENABLED=true explicitly.', 'LINE_REAL_SEND_DISABLED', medicalSafety);
  }

  if (!runtime.channelAccessToken) {
    await blockSend(normalized, runtime, 'LINE_CHANNEL_ACCESS_TOKEN is required for real LINE sends.', 'LINE_ACCESS_TOKEN_REQUIRED', medicalSafety);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    await blockSend(normalized, runtime, 'Fetch API is unavailable for LINE real send.', 'LINE_PROVIDER_SEND_FAILED', medicalSafety);
  }

  const response = await fetchImpl(LINE_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.channelAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: normalized.recipientId,
      messages: [
        {
          type: 'text',
          text: normalized.text
        }
      ]
    })
  });

  if (!response.ok) {
    const failureText = typeof response.text === 'function' ? await response.text() : '';
    await auditOutboundAttempt({
      ...normalized,
      mode: runtime.mode,
      status: 'failed',
      reason: `LINE provider returned HTTP ${response.status}`,
      integrationStatus: 'real_send_failed',
      medicalSafety,
      metadata: {
        ...normalized.metadata,
        providerStatus: response.status,
        providerFailureHash: sha256(failureText)
      }
    });

    throw new AppError(502, 'LINE_PROVIDER_SEND_FAILED', 'LINE provider send failed.');
  }

  const providerMessageId =
    (typeof response.headers?.get === 'function' && response.headers.get('x-line-request-id')) ||
    `line-real-${Date.now()}`;

  const result = {
    provider: 'line',
    providerMessageId,
    integrationStatus: 'real_send',
    status: 'sent',
    mode: runtime.mode,
    dryRun: false,
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    failureReason: null,
    medicalSafety
  };

  await auditOutboundAttempt({
    ...normalized,
    mode: runtime.mode,
    status: 'sent',
    integrationStatus: result.integrationStatus,
    providerMessageId,
    medicalSafety
  });

  return result;
}

function validateWebhookSignature(input, options = {}) {
  const runtime = getLineRuntime(options.config);
  const channelSecret = Object.prototype.hasOwnProperty.call(options, 'channelSecret')
    ? options.channelSecret
    : runtime.channelSecret;
  const signature = Object.prototype.hasOwnProperty.call(options, 'signature')
    ? options.signature
    : getHeaderValue(input, 'x-line-signature') || '';

  if (!channelSecret) {
    return { ok: false, reason: 'missing_channel_secret', integrationStatus: 'line_signature_unverified' };
  }

  if (!signature) {
    return { ok: false, reason: 'missing_signature', integrationStatus: 'line_signature_missing' };
  }

  const expected = crypto.createHmac('sha256', channelSecret).update(getRawBody(input)).digest('base64');
  const ok = timingSafeEqualString(signature, expected);

  return {
    ok,
    reason: ok ? null : 'invalid_signature',
    integrationStatus: ok ? 'line_signature_verified' : 'line_signature_invalid'
  };
}

function parseInboundEvent(input) {
  if (input && Array.isArray(input.events)) {
    return input.events.map((event) => parseInboundEvent(event));
  }

  const event = input || {};
  const message = event.message || {};
  const source = event.source || {};

  return {
    provider: 'line',
    eventType: event.type || null,
    replyToken: event.replyToken || null,
    timestamp: event.timestamp || null,
    sourceType: source.type || null,
    lineUserId: source.userId || null,
    lineGroupId: source.groupId || null,
    lineRoomId: source.roomId || null,
    messageId: message.id || null,
    messageType: message.type || null,
    text: message.type === 'text' ? message.text || '' : '',
    rawEvent: event
  };
}

module.exports = {
  LINE_PUSH_ENDPOINT,
  sendTextMessage,
  validateWebhookSignature,
  parseInboundEvent,
  dryRunSend,
  auditOutboundAttempt
};
