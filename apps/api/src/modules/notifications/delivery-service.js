'use strict';

const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { getAdminNotificationDraft } = require('./service');
const { mapNotificationDeliveryAttemptRow } = require('./serializer');
const {
  assertNotificationDryRunAllowed,
  assertNotificationRealDeliveryAllowed
} = require('./provider-guards');
const { normalizeNotificationProviderConfig } = require('./provider-config');

const dryRunEmailAdapter = require('./delivery-adapters/dry-run-email');
const dryRunLineAdapter = require('./delivery-adapters/dry-run-line');
const dryRunSmsAdapter = require('./delivery-adapters/dry-run-sms');

const DRY_RUN_ADAPTERS = {
  email: {
    provider: 'dry_run_email',
    adapter: dryRunEmailAdapter
  },
  line: {
    provider: 'dry_run_line',
    adapter: dryRunLineAdapter
  },
  sms: {
    provider: 'dry_run_sms',
    adapter: dryRunSmsAdapter
  }
};

function resolveDryRunAdapter(channel) {
  const resolved = DRY_RUN_ADAPTERS[channel];
  if (!resolved) {
    throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_CHANNEL', 'Notification channel is not supported for dry-run delivery.');
  }
  return resolved;
}

function buildNotificationDeliveryIdempotencyKey(draft, provider) {
  return [
    `tenant:${draft.tenantId}`,
    `notification_draft:${draft.id}`,
    'mode:dry_run',
    `channel:${draft.channel}`,
    `provider:${provider}`
  ].join(':');
}

function buildDryRunDeliveryPayload(draft, config = loadConfig()) {
  const { provider } = resolveDryRunAdapter(draft.channel);
  const notificationConfig = normalizeNotificationProviderConfig(config);
  return {
    tenantId: draft.tenantId,
    draftId: draft.id,
    mode: 'dry_run',
    channel: draft.channel,
    provider,
    eventType: draft.eventType,
    recipient: {
      type: draft.recipientType,
      id: draft.recipientId,
      ref: draft.recipientRef
    },
    message: {
      title: draft.title,
      subject: draft.subject,
      body: draft.message
    },
    source: {
      type: draft.sourceType,
      id: draft.sourceId
    },
    metadata: draft.metadata || {},
    safety: {
      dryRunOnly: true,
      externalCallAllowed: false,
      realDeliveryEnabled: Boolean(notificationConfig.realDeliveryEnabled),
      globalKillSwitch: Boolean(notificationConfig.globalKillSwitch),
      providerConfigMissing: true
    }
  };
}

function assertNotificationDryRunEnabled(config = loadConfig()) {
  assertNotificationDryRunAllowed(config);
}

function assertNotificationRealDeliveryDisabled(config = loadConfig()) {
  assertNotificationRealDeliveryAllowed('email', config);
}

async function deliverNotificationDraft(context, draftId, options = {}) {
  assertNotificationRealDeliveryDisabled(options.config || loadConfig());
}

async function insertOrLoadDryRunAttempt(draft, payload, result, provider, client) {
  const idempotencyKey = buildNotificationDeliveryIdempotencyKey(draft, provider);
  const insertResult = await client.query(
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
      values ($1, $2, $3, $4, 'dry_run', 'dry_run', $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      on conflict (idempotency_key) do nothing
      returning *
    `,
    [
      draft.tenantId,
      draft.id,
      draft.channel,
      provider,
      draft.recipientType,
      draft.recipientId,
      draft.recipientRef,
      JSON.stringify(payload),
      JSON.stringify(result),
      idempotencyKey
    ]
  );

  if (insertResult.rowCount > 0) {
    return mapNotificationDeliveryAttemptRow(insertResult.rows[0]);
  }

  const existingResult = await client.query(
    `
      select *
      from notification_delivery_attempts
      where idempotency_key = $1 and clinic_id = $2 and draft_id = $3
      limit 1
    `,
    [idempotencyKey, draft.tenantId, draft.id]
  );
  return mapNotificationDeliveryAttemptRow(existingResult.rows[0]);
}

async function dryRunNotificationDraftDelivery(context, draftId, options = {}) {
  const config = options.config || loadConfig();
  assertNotificationDryRunEnabled(config);

  const client = options.client || getPool();
  const draft = await getAdminNotificationDraft(context, draftId, client);
  const { provider, adapter } = resolveDryRunAdapter(draft.channel);
  const payload = buildDryRunDeliveryPayload(draft, config);
  const adapterResult = await adapter.dryRunDeliver(payload);
  const result = {
    dryRun: true,
    externalCallMade: false,
    blockedRealSend: true,
    provider,
    providerConfigMissing: true,
    message: 'Dry run only. No notification was sent.',
    adapterResult
  };

  return insertOrLoadDryRunAttempt(draft, payload, result, provider, client);
}

async function listNotificationDraftDeliveryAttempts(context, draftId, client = getPool()) {
  const draft = await getAdminNotificationDraft(context, draftId, client);
  const result = await client.query(
    `
      select *
      from notification_delivery_attempts
      where clinic_id = $1 and draft_id = $2
      order by created_at desc, id desc
    `,
    [draft.tenantId, draft.id]
  );

  return {
    items: result.rows.map((row) => mapNotificationDeliveryAttemptRow(row)),
    total: result.rowCount
  };
}

module.exports = {
  buildDryRunDeliveryPayload,
  buildNotificationDeliveryIdempotencyKey,
  deliverNotificationDraft,
  dryRunNotificationDraftDelivery,
  listNotificationDraftDeliveryAttempts,
  resolveDryRunAdapter
};
