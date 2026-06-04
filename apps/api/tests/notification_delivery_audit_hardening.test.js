'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { sendApprovedNotificationEmail } = require('../src/modules/notifications/email-service');
const { dryRunNotificationDraftDelivery } = require('../src/modules/notifications/delivery-service');
const { buildSafeNotificationDeliveryAuditContext } = require('../src/modules/notifications/audit');
const sandboxEmailAdapter = require('../src/modules/notifications/email-adapters/sandbox-email');

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Notification Audit Clinic ${suffix} ${uniqueId}`, `notification-audit-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Audit Org ${suffix}`, `notification-audit-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Audit Workspace ${suffix}`, `notification-audit-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-audit-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-audit-${role}-${uniqueId}@flowbiz.local`, `Notification Audit ${role}`]
  );
  return Number(result.rows[0].id);
}

async function createDraft(pool, tenant, uniqueId, overrides = {}) {
  const result = await pool.query(
    `
      insert into notification_drafts (
        clinic_id,
        event_type,
        recipient_type,
        recipient_id,
        recipient_ref,
        channel,
        title,
        subject,
        message,
        status,
        source_type,
        source_id,
        idempotency_key,
        metadata_json,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $12, $13::jsonb, $14::timestamptz, $14::timestamptz)
      returning id
    `,
    [
      tenant.clinicId,
      overrides.eventType || 'slot_offer.sent',
      overrides.recipientType || 'member',
      Object.prototype.hasOwnProperty.call(overrides, 'recipientId') ? overrides.recipientId : 901,
      overrides.recipientRef || `audit-recipient-${uniqueId}@example.test`,
      overrides.channel || 'email',
      overrides.title || `Audit title ${uniqueId}`,
      overrides.subject || `Audit subject secret ${uniqueId}`,
      overrides.message || `Audit body secret ${uniqueId}`,
      overrides.sourceType || 'slot_offer',
      overrides.sourceId || '7001',
      overrides.idempotencyKey || `notification-audit-${uniqueId}-${tenant.clinicId}-${Date.now()}-${Math.random()}`,
      JSON.stringify(overrides.metadata || { bookingRequestId: 501, auditSecret: `metadata-secret-${uniqueId}` }),
      overrides.createdAt || '2026-06-04T08:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

async function createApproval(pool, tenant, draftId, userId, status = 'approved') {
  const result = await pool.query(
    `
      insert into notification_approval_requests (
        clinic_id,
        draft_id,
        status,
        requested_by_user_id,
        decided_by_user_id,
        idempotency_key,
        decided_at
      )
      values ($1, $2, $3::varchar, $4, $5, $6, case when $3::varchar = 'approved' then now() else null end)
      returning id
    `,
    [tenant.clinicId, draftId, status, userId, status === 'approved' ? userId : null, `notification-audit-approval-${draftId}-${status}-${Date.now()}-${Math.random()}`]
  );
  return Number(result.rows[0].id);
}

function realSandboxConfig() {
  return {
    notifications: {
      dryRunEnabled: true,
      realDeliveryEnabled: true,
      globalKillSwitch: false,
      email: {
        enabled: true,
        provider: 'sandbox',
        from: 'noreply@example.test',
        replyTo: 'reply@example.test',
        smtpPassword: 'smtp-password-secret',
        apiKey: 'api_key-secret'
      },
      line: { enabled: false, provider: 'none', channelAccessTokenConfigured: false, channelAccessToken: 'line-token-secret' },
      sms: { enabled: false, provider: 'none', from: null, token: 'sms-token-secret' }
    }
  };
}

function contextFor(tenant, ownerUserId, uniqueId, role = 'owner') {
  return {
    currentUser: { id: ownerUserId, email: `notification-audit-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  };
}

async function loadAuditRows(pool, clinicId, draftId, actions) {
  const result = await pool.query(
    `
      select action_type, entity_id, actor_user_id, context_json
      from audit_logs
      where clinic_id = $1
        and action_type = any($2::text[])
        and context_json->>'draft_id' = $3
      order by id
    `,
    [clinicId, actions, String(draftId)]
  );

  return result.rows;
}

function assertBaseAuditContext(row, { tenant, draftId, actorUserId, approvalId = null, mode, channel, provider, status }) {
  const context = row.context_json;

  assert.equal(row.actor_user_id === null ? null : Number(row.actor_user_id), actorUserId);
  assert.equal(context.clinic_id, tenant.clinicId);
  assert.equal(context.draft_id, draftId);
  assert.equal(context.actor_user_id, actorUserId);
  assert.equal(context.approval_request_id, approvalId);
  assert.equal(context.channel, channel);
  assert.equal(context.provider, provider);
  assert.equal(context.mode, mode);
  assert.equal(context.status, status);
  assert.equal(typeof context.timestamp, 'string');
  assert.ok(!Number.isNaN(Date.parse(context.timestamp)));
}

function assertSafeAuditContext(context, rawNeedles) {
  const serialized = JSON.stringify(context);

  for (const needle of rawNeedles) {
    assert.equal(serialized.includes(needle), false, `audit context leaked ${needle}`);
  }

  assert.equal(serialized.includes('payload_json'), false);
  assert.equal(serialized.includes('"payload"'), false);
  assert.equal(serialized.includes('"body"'), false);
  assert.equal(serialized.includes('"message"'), false);
  assert.equal(serialized.includes('"subject"'), false);
  assert.equal(serialized.includes('"to"'), false);
  assert.equal(serialized.includes('"from"'), false);
  assert.equal(serialized.includes('"replyTo"'), false);
  assert.equal(serialized.includes('"accepted":'), false);
  assert.equal(serialized.includes('"rejected":'), false);
  assert.equal(serialized.includes('smtp-password-secret'), false);
  assert.equal(serialized.includes('api_key-secret'), false);
  assert.equal(serialized.includes('line-token-secret'), false);
  assert.equal(serialized.includes('sms-token-secret'), false);
  assert.equal(serialized.includes('stack'), false);
}

test('Notification Delivery Audit Hardening - audit context handles null caller context', () => {
  const context = buildSafeNotificationDeliveryAuditContext({
    draft: {
      tenantId: 101,
      id: 202,
      channel: 'email',
      recipientType: 'member',
      recipientId: 303,
      recipientRef: 'member@example.test'
    },
    context: null,
    channel: 'email',
    provider: 'sandbox',
    mode: 'real',
    status: 'blocked'
  });

  assert.equal(context.clinic_id, 101);
  assert.equal(context.draft_id, 202);
  assert.equal(context.actor_user_id, null);
  assert.equal(context.channel, 'email');
  assert.equal(context.provider, 'sandbox');
  assert.equal(context.mode, 'real');
  assert.equal(context.status, 'blocked');
  assert.equal(context.recipient_ref_present, true);
  assertSafeAuditContext(context, ['member@example.test']);
});

test('Notification Delivery Audit Hardening - safe tenant-scoped evidence', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let successDraftId;
  let successApprovalId;
  let crossTenantDraftId;

  const rawRecipient = `audit-recipient-${uniqueId}@example.test`;
  const rawBody = `Audit body secret ${uniqueId}`;
  const rawSubject = `Audit subject secret ${uniqueId}`;
  const rawMetadata = `metadata-secret-${uniqueId}`;
  const rawNeedles = [rawRecipient, rawBody, rawSubject, rawMetadata];

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId, 'owner');
    userIds.push(ownerUserId);
    successDraftId = await createDraft(pool, tenantA, uniqueId, {
      recipientRef: rawRecipient,
      subject: rawSubject,
      message: rawBody,
      sourceId: '8001'
    });
    successApprovalId = await createApproval(pool, tenantA, successDraftId, ownerUserId, 'approved');
    crossTenantDraftId = await createDraft(pool, tenantB, uniqueId, {
      recipientRef: `cross-tenant-${uniqueId}@example.test`,
      sourceId: '9001'
    });
    await createApproval(pool, tenantB, crossTenantDraftId, ownerUserId, 'approved');
  });

  t.after(async () => {
    try {
      if (tenantA?.clinicId && tenantB?.clinicId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[tenantA.clinicId, tenantB.clinicId]]);
      }
      if (userIds.length) {
        await pool.query('delete from users where id = any($1::bigint[])', [userIds]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('1. Real email success writes safe requested and sent audit context', async () => {
    const sent = await sendApprovedNotificationEmail(
      contextFor(tenantA, ownerUserId, uniqueId),
      successDraftId,
      { client: pool, config: realSandboxConfig() }
    );
    const auditRows = await loadAuditRows(pool, tenantA.clinicId, successDraftId, [
      'notification.email_send_requested',
      'notification.email_sent'
    ]);
    const requested = auditRows.find((row) => row.action_type === 'notification.email_send_requested');
    const sentAudit = auditRows.find((row) => row.action_type === 'notification.email_sent');

    assert.equal(sent.status, 'sent');
    assert.ok(requested);
    assert.ok(sentAudit);
    assertBaseAuditContext(requested, {
      tenant: tenantA,
      draftId: successDraftId,
      actorUserId: ownerUserId,
      approvalId: successApprovalId,
      mode: 'real',
      channel: 'email',
      provider: 'sandbox',
      status: 'sending'
    });
    assertBaseAuditContext(sentAudit, {
      tenant: tenantA,
      draftId: successDraftId,
      actorUserId: ownerUserId,
      approvalId: successApprovalId,
      mode: 'real',
      channel: 'email',
      provider: 'sandbox',
      status: 'sent'
    });
    assert.equal(requested.context_json.delivery_attempt_id, sent.id);
    assert.equal(sentAudit.context_json.delivery_attempt_id, sent.id);
    assert.equal(sentAudit.context_json.result.external_call_made, false);
    assert.equal(sentAudit.context_json.result.safe_result, true);
    assert.equal(sentAudit.context_json.result.message_id_present, true);
    assert.equal(sentAudit.context_json.result.accepted_count, 1);
    assert.equal(sentAudit.context_json.result.rejected_count, 0);
    assert.equal(sentAudit.context_json.recipient_type, 'member');
    assert.equal(sentAudit.context_json.recipient_ref_present, true);

    assertSafeAuditContext(requested.context_json, rawNeedles);
    assertSafeAuditContext(sentAudit.context_json, rawNeedles);
  });

  await t.test('2. Blocked real email send writes safe blocked audit without attempt', async () => {
    const blockedRecipient = `blocked-recipient-${uniqueId}@example.test`;
    const blockedBody = `Blocked body secret ${uniqueId}`;
    const blockedDraftId = await createDraft(pool, tenantA, uniqueId, {
      recipientRef: blockedRecipient,
      message: blockedBody,
      sourceId: '8101'
    });

    await assert.rejects(
      () => sendApprovedNotificationEmail(
        contextFor(tenantA, ownerUserId, uniqueId),
        blockedDraftId,
        { client: pool, config: realSandboxConfig() }
      ),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    );

    const attempts = await pool.query(
      "select count(*)::int as count from notification_delivery_attempts where clinic_id = $1 and draft_id = $2 and mode = 'real'",
      [tenantA.clinicId, blockedDraftId]
    );
    const auditRows = await loadAuditRows(pool, tenantA.clinicId, blockedDraftId, ['notification.email_send_blocked']);
    const blocked = auditRows[0];

    assert.equal(attempts.rows[0].count, 0);
    assert.ok(blocked);
    assertBaseAuditContext(blocked, {
      tenant: tenantA,
      draftId: blockedDraftId,
      actorUserId: ownerUserId,
      approvalId: null,
      mode: 'real',
      channel: 'email',
      provider: null,
      status: 'blocked'
    });
    assert.equal(blocked.context_json.reason, 'NOTIFICATION_SEND_APPROVAL_REQUIRED');
    assert.equal(blocked.context_json.delivery_attempt_id, null);
    assertSafeAuditContext(blocked.context_json, [blockedRecipient, blockedBody]);
  });

  await t.test('3. Failed adapter path writes safe failed audit context', async () => {
    const failedRecipient = `failed-recipient-${uniqueId}@example.test`;
    const failedBody = `Failed body secret ${uniqueId}`;
    const failedDraftId = await createDraft(pool, tenantA, uniqueId, {
      recipientRef: failedRecipient,
      message: failedBody,
      sourceId: '8201'
    });
    const failedApprovalId = await createApproval(pool, tenantA, failedDraftId, ownerUserId, 'approved');
    const originalSend = sandboxEmailAdapter.sendEmailNotification;
    const thrown = new Error(`Do not leak ${failedRecipient} ${failedBody}`);
    thrown.code = 'EMAIL_ADAPTER_SIMULATED_FAILURE';
    thrown.stack = `STACK ${failedRecipient} ${failedBody}`;

    sandboxEmailAdapter.sendEmailNotification = async () => {
      throw thrown;
    };

    try {
      await assert.rejects(
        () => sendApprovedNotificationEmail(
          contextFor(tenantA, ownerUserId, uniqueId),
          failedDraftId,
          { client: pool, config: realSandboxConfig() }
        ),
        (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_SEND_FAILED'
      );
    } finally {
      sandboxEmailAdapter.sendEmailNotification = originalSend;
    }

    const attempts = await pool.query(
      `
        select id, status
        from notification_delivery_attempts
        where clinic_id = $1 and draft_id = $2 and mode = 'real'
        limit 1
      `,
      [tenantA.clinicId, failedDraftId]
    );
    const auditRows = await loadAuditRows(pool, tenantA.clinicId, failedDraftId, ['notification.email_send_failed']);
    const failed = auditRows[0];

    assert.equal(attempts.rowCount, 1);
    assert.equal(attempts.rows[0].status, 'failed');
    assert.ok(failed);
    assertBaseAuditContext(failed, {
      tenant: tenantA,
      draftId: failedDraftId,
      actorUserId: ownerUserId,
      approvalId: failedApprovalId,
      mode: 'real',
      channel: 'email',
      provider: 'sandbox',
      status: 'failed'
    });
    assert.equal(failed.context_json.delivery_attempt_id, Number(attempts.rows[0].id));
    assert.equal(failed.context_json.reason, 'EMAIL_ADAPTER_SIMULATED_FAILURE');
    assert.equal(failed.context_json.result.external_call_made, false);
    assert.equal(failed.context_json.result.safe_result, false);
    assert.equal(failed.context_json.result.reason, 'EMAIL_ADAPTER_SIMULATED_FAILURE');
    assertSafeAuditContext(failed.context_json, [failedRecipient, failedBody]);
  });

  await t.test('4. Dry-run delivery writes safe requested and completed audit context', async () => {
    const dryRunRecipient = `dry-run-recipient-${uniqueId}@example.test`;
    const dryRunBody = `Dry run body secret ${uniqueId}`;
    const dryRunDraftId = await createDraft(pool, tenantA, uniqueId, {
      recipientRef: dryRunRecipient,
      message: dryRunBody,
      sourceId: '8301'
    });

    const attempt = await dryRunNotificationDraftDelivery(
      contextFor(tenantA, ownerUserId, uniqueId),
      dryRunDraftId,
      { client: pool, config: { notificationDryRunEnabled: true, notificationRealDeliveryEnabled: false } }
    );
    const auditRows = await loadAuditRows(pool, tenantA.clinicId, dryRunDraftId, [
      'notification.delivery_dry_run_requested',
      'notification.delivery_dry_run_completed'
    ]);
    const requested = auditRows.find((row) => row.action_type === 'notification.delivery_dry_run_requested');
    const completed = auditRows.find((row) => row.action_type === 'notification.delivery_dry_run_completed');

    assert.equal(attempt.mode, 'dry_run');
    assert.equal(attempt.status, 'dry_run');
    assert.equal(attempt.result.externalCallMade, false);
    assert.ok(requested);
    assert.ok(completed);
    assertBaseAuditContext(requested, {
      tenant: tenantA,
      draftId: dryRunDraftId,
      actorUserId: ownerUserId,
      approvalId: null,
      mode: 'dry_run',
      channel: 'email',
      provider: 'dry_run_email',
      status: 'requested'
    });
    assertBaseAuditContext(completed, {
      tenant: tenantA,
      draftId: dryRunDraftId,
      actorUserId: ownerUserId,
      approvalId: null,
      mode: 'dry_run',
      channel: 'email',
      provider: 'dry_run_email',
      status: 'dry_run'
    });
    assert.equal(completed.context_json.delivery_attempt_id, attempt.id);
    assert.equal(completed.context_json.result.external_call_made, false);
    assert.equal(completed.context_json.result.dry_run, true);
    assert.equal(completed.context_json.result.blocked_real_send, true);
    assert.equal(completed.context_json.result.adapter_external_call_made, false);
    assert.equal(completed.context_json.result.adapter_dry_run, true);
    assertSafeAuditContext(requested.context_json, [dryRunRecipient, dryRunBody]);
    assertSafeAuditContext(completed.context_json, [dryRunRecipient, dryRunBody]);
  });

  await t.test('5. Cross-tenant send is blocked without leaking tenant B draft evidence into tenant A audit', async () => {
    await assert.rejects(
      () => sendApprovedNotificationEmail(
        contextFor(tenantA, ownerUserId, uniqueId),
        crossTenantDraftId,
        { client: pool, config: realSandboxConfig() }
      ),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_DRAFT_NOT_FOUND'
    );

    const tenantAAudit = await pool.query(
      `
        select count(*)::int as count
        from audit_logs
        where clinic_id = $1
          and action_type like 'notification.email_%'
          and context_json->>'draft_id' = $2
      `,
      [tenantA.clinicId, String(crossTenantDraftId)]
    );
    const crossTenantAttempts = await pool.query(
      'select count(*)::int as count from notification_delivery_attempts where draft_id = $1',
      [crossTenantDraftId]
    );

    assert.equal(tenantAAudit.rows[0].count, 0);
    assert.equal(crossTenantAttempts.rows[0].count, 0);
  });
});
