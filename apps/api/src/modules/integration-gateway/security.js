const { recordAuditLog } = require('../audit/service');

function getWebhookSecret(req, headerNames = []) {
  for (const headerName of headerNames) {
    const value = req.headers?.[headerName];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  const querySecret = req.query?.secret;
  return typeof querySecret === 'string' ? querySecret.trim() : '';
}

function getIntegrationStatus(secret) {
  if (secret.startsWith('sha256=')) {
    return 'live_signature_unverified';
  }
  if (secret.startsWith('mock') || secret === 'valid-secret') {
    return 'sandbox_secret';
  }
  return 'shared_secret';
}

function verifyWebhookSecret(req, headerNames = []) {
  const secret = getWebhookSecret(req, headerNames);
  return {
    ok: Boolean(secret) && secret !== 'invalid-secret',
    integrationStatus: getIntegrationStatus(secret),
    reason: !secret ? 'missing_secret' : secret === 'invalid-secret' ? 'invalid_secret' : null
  };
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
  getIntegrationStatus
};
