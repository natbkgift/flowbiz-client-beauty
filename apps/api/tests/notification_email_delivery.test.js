'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { THAI_ERROR_MESSAGES } = require('../src/common/user-messages');
const { handleNotificationRoutes } = require('../src/modules/notifications/routes');
const { sendApprovedNotificationEmail } = require('../src/modules/notifications/email-service');

function createMockResponse() {
  return {
    statusCode: null,
    body: '',
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

async function routeJson({ method = 'GET', path, authenticateRequest }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);

  try {
    const handled = await handleNotificationRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.21.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
        parseJsonBody: async () => ({}),
        json
      }
    );

    if (!handled && response.statusCode === null) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
    }
  } catch (error) {
    if (error instanceof AppError) {
      response.writeHead(error.statusCode);
      response.end(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details || null } }));
    } else {
      response.writeHead(500);
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } }));
    }
  }

  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Notification Email Clinic ${suffix} ${uniqueId}`, `notification-email-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Email Org ${suffix}`, `notification-email-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Email Workspace ${suffix}`, `notification-email-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-email-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-email-${role}-${uniqueId}@flowbiz.local`, `Notification Email ${role}`]
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
      overrides.recipientRef || `member-${uniqueId}@example.test`,
      overrides.channel || 'email',
      overrides.title || 'Slot offer created',
      overrides.subject || 'A booking slot has been offered',
      overrides.message || 'Real email notification body',
      overrides.sourceType || 'slot_offer',
      overrides.sourceId || '7001',
      overrides.idempotencyKey || `notification-email-${uniqueId}-${tenant.clinicId}-${Date.now()}-${Math.random()}`,
      JSON.stringify(overrides.metadata || { bookingRequestId: 501, safe: true }),
      overrides.createdAt || '2026-06-03T08:00:00.000Z'
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
    [tenant.clinicId, draftId, status, userId, status === 'approved' ? userId : null, `notification-email-approval-${draftId}-${status}-${Date.now()}-${Math.random()}`]
  );
  return Number(result.rows[0].id);
}

function realSandboxConfig(overrides = {}) {
  return {
    notifications: {
      dryRunEnabled: true,
      realDeliveryEnabled: true,
      globalKillSwitch: false,
      email: {
        enabled: true,
        provider: 'sandbox',
        from: 'noreply@example.test',
        replyTo: 'reply@example.test'
      },
      line: { enabled: false, provider: 'none', channelAccessTokenConfigured: false },
      sms: { enabled: false, provider: 'none', from: null },
      ...overrides
    }
  };
}

test('Notification Email Delivery - safety-gated manual email send', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let approvedDraftId;
  let crossTenantDraftId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId, 'owner');
    userIds.push(ownerUserId);
    approvedDraftId = await createDraft(pool, tenantA, uniqueId, { sourceId: '8001' });
    crossTenantDraftId = await createDraft(pool, tenantB, uniqueId, { sourceId: '9001' });
    await createApproval(pool, tenantA, approvedDraftId, ownerUserId, 'approved');
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

  const contextFor = (tenant = tenantA, role = 'owner') => ({
    currentUser: { id: ownerUserId, email: `notification-email-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Real email send is blocked by default config', async () => {
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), approvedDraftId, { client: pool, config: {} }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_REAL_DELIVERY_DISABLED'
    );
  });

  await t.test('2. Real email send is blocked when global kill switch is active', async () => {
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), approvedDraftId, {
        client: pool,
        config: realSandboxConfig({ globalKillSwitch: true })
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE'
    );
  });

  await t.test('3. Real email send is blocked without approved approval', async () => {
    const draftId = await createDraft(pool, tenantA, uniqueId, { sourceId: '8101' });
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), draftId, { client: pool, config: realSandboxConfig() }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    );
  });

  await t.test('4. Real email send is blocked when approval is pending/rejected/cancelled', async () => {
    for (const status of ['pending', 'rejected', 'cancelled']) {
      const draftId = await createDraft(pool, tenantA, uniqueId, { sourceId: `82-${status}` });
      await createApproval(pool, tenantA, draftId, ownerUserId, status);
      await assert.rejects(
        () => sendApprovedNotificationEmail(contextFor(), draftId, { client: pool, config: realSandboxConfig() }),
        (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
      );
    }
  });

  await t.test('5. Real email send is blocked when draft channel is not email', async () => {
    const lineDraftId = await createDraft(pool, tenantA, uniqueId, { channel: 'line', recipientRef: 'line:user', sourceId: '8301' });
    await createApproval(pool, tenantA, lineDraftId, ownerUserId, 'approved');
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), lineDraftId, { client: pool, config: realSandboxConfig() }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_ONLY'
    );
  });

  await t.test('6. Real email send is blocked when email provider is not ready', async () => {
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), approvedDraftId, {
        client: pool,
        config: realSandboxConfig({ email: { enabled: true, provider: 'none', from: 'noreply@example.test' } })
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_CONTROL_BLOCKED'
    );
  });

  await t.test('7. Sandbox email send succeeds only when every gate passes', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${approvedDraftId}/send-email`,
      authenticateRequest: async () => contextFor()
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'NOTIFICATION_REAL_DELIVERY_DISABLED');

    const sent = await sendApprovedNotificationEmail(contextFor(), approvedDraftId, { client: pool, config: realSandboxConfig() });
    assert.equal(sent.tenantId, tenantA.clinicId);
    assert.equal(sent.draftId, approvedDraftId);
    assert.equal(sent.mode, 'real');
    assert.equal(sent.status, 'sent');
    assert.equal(sent.channel, 'email');
    assert.equal(sent.provider, 'sandbox');
    assert.equal(sent.result.externalCallMade, false);
    assert.equal(sent.result.safeResult, true);
    assert.equal(sent.result.accepted[0], `member-${uniqueId}@example.test`);
  });

  await t.test('8. Send creates one real email attempt and repeated send is idempotent', async () => {
    const first = await sendApprovedNotificationEmail(contextFor(), approvedDraftId, { client: pool, config: realSandboxConfig() });
    const second = await sendApprovedNotificationEmail(contextFor(), approvedDraftId, { client: pool, config: realSandboxConfig() });
    const count = await pool.query(
      "select count(*)::int as count from notification_delivery_attempts where clinic_id = $1 and draft_id = $2 and mode = 'real'",
      [tenantA.clinicId, approvedDraftId]
    );

    assert.equal(first.id, second.id);
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('9. Audit logs are written for requested, sent, and blocked paths', async () => {
    const blockedDraftId = await createDraft(pool, tenantA, uniqueId, { sourceId: '8401' });
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), blockedDraftId, { client: pool, config: realSandboxConfig() }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    );

    const audit = await pool.query(
      `
        select action_type
        from audit_logs
        where clinic_id = $1 and action_type like 'notification.email_%'
        order by id
      `,
      [tenantA.clinicId]
    );

    assert.ok(audit.rows.some((row) => row.action_type === 'notification.email_send_requested'));
    assert.ok(audit.rows.some((row) => row.action_type === 'notification.email_sent'));
    assert.ok(audit.rows.some((row) => row.action_type === 'notification.email_send_blocked'));
  });

  await t.test('10. Secret-like config values do not appear in payload/result', async () => {
    const attempt = await pool.query(
      `
        select payload_json, result_json
        from notification_delivery_attempts
        where clinic_id = $1 and draft_id = $2 and mode = 'real'
        limit 1
      `,
      [tenantA.clinicId, approvedDraftId]
    );
    const serialized = JSON.stringify(attempt.rows[0]);

    assert.equal(serialized.includes('line-secret-token'), false);
    assert.equal(serialized.includes('smtp-password'), false);
    assert.equal(serialized.includes('api_key'), false);
  });

  await t.test('11. LINE/SMS send remains unsupported and cross-tenant send is blocked', async () => {
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), crossTenantDraftId, { client: pool, config: realSandboxConfig() }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_DRAFT_NOT_FOUND'
    );

    const smsDraftId = await createDraft(pool, tenantA, uniqueId, { channel: 'sms', recipientRef: '+15555550100', sourceId: '8501' });
    await createApproval(pool, tenantA, smsDraftId, ownerUserId, 'approved');
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(), smsDraftId, { client: pool, config: realSandboxConfig() }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_ONLY'
    );
  });

  await t.test('12. New AppError codes have Thai user-message mappings', () => {
    for (const code of [
      'NOTIFICATION_EMAIL_ONLY',
      'NOTIFICATION_EMAIL_PROVIDER_NOT_READY',
      'NOTIFICATION_EMAIL_SEND_BLOCKED',
      'NOTIFICATION_EMAIL_SEND_FAILED',
      'NOTIFICATION_EMAIL_ALREADY_SENT',
      'NOTIFICATION_EMAIL_RECIPIENT_MISSING'
    ]) {
      assert.equal(typeof THAI_ERROR_MESSAGES[code], 'string');
      assert.ok(THAI_ERROR_MESSAGES[code].length > 0);
    }
  });
});
