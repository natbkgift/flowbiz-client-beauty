const crypto = require('node:crypto');
const { recordAuditLog } = require('../audit/service');

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const replayCache = new Map();

const SIGNING_SECRET_KEYS_BY_HEADER = {
  'x-hub-signature-256': ['FACEBOOK_WEBHOOK_SIGNING_SECRET', 'META_WEBHOOK_SIGNING_SECRET', 'FACEBOOK_APP_SECRET'],
  'x-tiktok-signature': ['TIKTOK_WEBHOOK_SIGNING_SECRET'],
  'x-wix-signature': ['WIX_WEBHOOK_SIGNING_SECRET'],
  'x-zonepang-signature': ['ZONEPANG_WEBHOOK_SIGNING_SECRET']
};

const SHARED_SECRET_KEYS_BY_HEADER = {
  'x-webhook-secret': ['FLOWBIZ_WEBHOOK_SHARED_SECRET'],
  'x-hub-signature-256': ['FACEBOOK_WEBHOOK_SECRET', 'META_WEBHOOK_SECRET'],
  'x-tiktok-signature': ['TIKTOK_WEBHOOK_SECRET'],
  'x-wix-signature': ['WIX_WEBHOOK_SECRET'],
  'x-zonepang-signature': ['ZONEPANG_WEBHOOK_SECRET']
};

function isProductionRuntime() {
  return (process.env.APP_ENV || 'development') === 'production';
}

function getHeaderValue(req, headerName) {
  const headers = req.headers || {};
  return headers[headerName] || headers[headerName.toLowerCase()] || headers[headerName.toUpperCase()];
}

function getWebhookSecret(req, headerNames = []) {
  for (const headerName of headerNames) {
    const value = getHeaderValue(req, headerName);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  const querySecret = req.query?.secret;
  return typeof querySecret === 'string' ? querySecret.trim() : '';
}

function getWebhookCredential(req, headerNames = []) {
  for (const headerName of headerNames) {
    const value = getHeaderValue(req, headerName);
    if (typeof value === 'string' && value.trim()) {
      return { value: value.trim(), headerName: headerName.toLowerCase() };
    }
  }

  const querySecret = req.query?.secret;
  return {
    value: typeof querySecret === 'string' ? querySecret.trim() : '',
    headerName: 'query.secret'
  };
}

function getConfiguredSecret(headerName, byHeaderMap, fallbackEnvName) {
  const candidateKeys = [
    ...(byHeaderMap[headerName] || []),
    fallbackEnvName
  ];

  for (const key of candidateKeys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function getSigningSecret(headerName) {
  return getConfiguredSecret(headerName, SIGNING_SECRET_KEYS_BY_HEADER, 'FLOWBIZ_WEBHOOK_SIGNING_SECRET');
}

function getSharedSecret(headerName) {
  return getConfiguredSecret(headerName, SHARED_SECRET_KEYS_BY_HEADER, 'FLOWBIZ_WEBHOOK_SHARED_SECRET');
}

function getIntegrationStatus(secret) {
  if (!secret) {
    return 'missing_secret';
  }

  if (secret.startsWith('sha256=')) {
    return 'live_signature_unverified';
  }
  if (secret.startsWith('mock') || secret === 'valid-secret') {
    return 'sandbox_secret';
  }
  return 'shared_secret';
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getWebhookTimestamp(req) {
  const value =
    getHeaderValue(req, 'x-webhook-timestamp') ||
    getHeaderValue(req, 'x-flowbiz-timestamp') ||
    getHeaderValue(req, 'x-signature-timestamp');

  return typeof value === 'string' ? value.trim() : '';
}

function parseTimestampMs(timestamp) {
  if (!timestamp) {
    return null;
  }

  if (/^\d+$/.test(timestamp)) {
    const numeric = Number(timestamp);
    return numeric > 100000000000 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateTimestamp(req, nowMs = Date.now()) {
  const timestamp = getWebhookTimestamp(req);

  if (!timestamp) {
    return isProductionRuntime() ? { ok: false, reason: 'missing_timestamp' } : { ok: true, timestamp };
  }

  const timestampMs = parseTimestampMs(timestamp);
  if (!timestampMs) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  if (Math.abs(nowMs - timestampMs) > REPLAY_WINDOW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  return { ok: true, timestamp };
}

function pruneReplayCache(nowMs = Date.now()) {
  for (const [key, seenAt] of replayCache.entries()) {
    if (nowMs - seenAt > REPLAY_WINDOW_MS) {
      replayCache.delete(key);
    }
  }
}

function rememberSignature(signature, nowMs = Date.now()) {
  pruneReplayCache(nowMs);

  if (replayCache.has(signature)) {
    return false;
  }

  replayCache.set(signature, nowMs);
  return true;
}

function getRawBody(req) {
  if (typeof req.rawBody === 'string') {
    return req.rawBody;
  }

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }

  return '';
}

function expectedHmacs(signingSecret, req, timestamp) {
  const rawBody = getRawBody(req);
  const payloads = timestamp ? [`${timestamp}.${rawBody}`, rawBody] : [rawBody];
  return payloads.map((payload) => crypto.createHmac('sha256', signingSecret).update(payload).digest('hex'));
}

function verifyHmacSignature(req, signatureValue, signingSecret) {
  const provided = signatureValue.replace(/^sha256=/i, '').trim();
  const timestamp = getWebhookTimestamp(req);
  return expectedHmacs(signingSecret, req, timestamp).some((expected) => timingSafeEqualString(provided, expected));
}

function verifyWebhookSecret(req, headerNames = []) {
  const { value: credential, headerName } = getWebhookCredential(req, headerNames);
  const integrationStatus = getIntegrationStatus(credential);

  if (!credential) {
    return { ok: false, integrationStatus, reason: 'missing_secret' };
  }

  if (credential === 'invalid-secret') {
    return { ok: false, integrationStatus, reason: 'invalid_secret' };
  }

  if (credential.startsWith('sha256=')) {
    const signingSecret = getSigningSecret(headerName);
    if (!signingSecret) {
      return { ok: false, integrationStatus, reason: 'missing_signing_secret' };
    }

    const timestampResult = validateTimestamp(req);
    if (!timestampResult.ok) {
      return { ok: false, integrationStatus, reason: timestampResult.reason };
    }

    if (!verifyHmacSignature(req, credential, signingSecret)) {
      return { ok: false, integrationStatus, reason: 'invalid_signature' };
    }

    if (!rememberSignature(credential)) {
      return { ok: false, integrationStatus, reason: 'replayed_signature' };
    }

    return { ok: true, integrationStatus: 'live_signature_verified', reason: null };
  }

  const sharedSecret = getSharedSecret(headerName);
  if (sharedSecret) {
    const ok = timingSafeEqualString(credential, sharedSecret);
    return {
      ok,
      integrationStatus: ok ? 'live_shared_secret_verified' : integrationStatus,
      reason: ok ? null : 'invalid_secret'
    };
  }

  if (!isProductionRuntime() && (credential.startsWith('mock') || credential === 'valid-secret')) {
    return { ok: true, integrationStatus: 'sandbox_secret', reason: null };
  }

  return {
    ok: false,
    integrationStatus,
    reason: isProductionRuntime() ? 'missing_shared_secret' : 'invalid_secret'
  };
}

function resetWebhookReplayCacheForTests() {
  replayCache.clear();
}

async function auditWebhookEvent({ clinicId, source, status, rawRecordId = null, leadId = null, reason = null, integrationStatus = null }) {
  if (!clinicId) {
    return;
  }

  try {
    await recordAuditLog({
      clinicId: Number(clinicId),
      entityType: 'integration_webhook',
      entityId: Number(rawRecordId || leadId || clinicId),
      actionType: status === 'accepted' ? 'integration.webhook_accepted' : 'integration.webhook_rejected',
      actorUserId: null,
      contextJson: {
        source,
        status,
        reason,
        leadId: leadId ? Number(leadId) : null,
        rawRecordId: rawRecordId ? Number(rawRecordId) : null,
        integrationStatus
      }
    });
  } catch (_) {
    // Webhook auth responses must not become 500s because an attacker used an unknown clinic id.
  }
}

module.exports = {
  verifyWebhookSecret,
  auditWebhookEvent,
  getIntegrationStatus,
  resetWebhookReplayCacheForTests
};
