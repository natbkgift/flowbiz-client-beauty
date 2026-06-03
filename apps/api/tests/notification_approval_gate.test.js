'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { THAI_ERROR_MESSAGES } = require('../src/common/user-messages');
const { handleNotificationRoutes } = require('../src/modules/notifications/routes');
const {
  assertNotificationApprovedForRealDelivery,
  assertNotificationSendControlAllowed
} = require('../src/modules/notifications/send-control');

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

async function routeJson({ method = 'GET', path, authenticateRequest, body = {} }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);

  try {
    const handled = await handleNotificationRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.19.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
        parseJsonBody: async () => body,
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
    [`Notification Approval Clinic ${suffix} ${uniqueId}`, `notification-approval-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Approval Org ${suffix}`, `notification-approval-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Approval Workspace ${suffix}`, `notification-approval-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-approval-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-approval-${role}-${uniqueId}@flowbiz.local`, `Notification Approval ${role}`]
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
      overrides.recipientRef || 'member:901',
      overrides.channel || 'line',
      overrides.title || 'Slot offer created',
      overrides.subject || 'A booking slot has been offered',
      overrides.message || 'Approval gate notification body',
      overrides.sourceType || 'slot_offer',
      overrides.sourceId || '7001',
      overrides.idempotencyKey || `notification-approval-${uniqueId}-${tenant.clinicId}-${Date.now()}-${Math.random()}`,
      JSON.stringify(overrides.metadata || { bookingRequestId: 501, offerId: 7001, safe: true }),
      overrides.createdAt || '2026-06-02T08:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

test('Notification Approval Gate - approval workflow and send control', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let draftAId;
  let draftBId;
  let approvalId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId, 'owner');
    userIds.push(ownerUserId);
    draftAId = await createDraft(pool, tenantA, uniqueId, {
      eventType: 'slot_offer.accepted',
      recipientType: 'admin',
      recipientId: ownerUserId,
      recipientRef: `admin:${ownerUserId}`,
      channel: 'email',
      sourceType: 'slot_offer',
      sourceId: '8001'
    });
    draftBId = await createDraft(pool, tenantB, uniqueId, {
      sourceId: '9001'
    });
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

  const contextFor = (tenant = tenantA, role = 'owner') => async () => ({
    currentUser: { id: ownerUserId, email: `notification-approval-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Admin can request approval for own tenant draft', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/approval-request`,
      authenticateRequest: contextFor(),
      body: { note: 'Please review before future send.' }
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.tenantId, tenantA.clinicId);
    assert.equal(res.body.draftId, draftAId);
    assert.equal(res.body.status, 'pending');
    assert.equal(res.body.requestedByUserId, ownerUserId);
    approvalId = res.body.id;
  });

  await t.test('2. Admin cannot request approval for another tenant draft', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftBId}/approval-request`,
      authenticateRequest: contextFor()
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOTIFICATION_DRAFT_NOT_FOUND');
  });

  await t.test('3. Duplicate approval request is idempotent while pending', async () => {
    const first = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/approval-request`,
      authenticateRequest: contextFor()
    });
    const second = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/approval-request`,
      authenticateRequest: contextFor()
    });
    const count = await pool.query(
      'select count(*)::int as count from notification_approval_requests where clinic_id = $1 and draft_id = $2',
      [tenantA.clinicId, draftAId]
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.equal(first.body.id, approvalId);
    assert.equal(second.body.id, approvalId);
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('4. Approval status appears in draft detail and list', async () => {
    const detail = await routeJson({
      path: `/admin/notification-drafts/${draftAId}`,
      authenticateRequest: contextFor()
    });
    const list = await routeJson({
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor()
    });
    const status = await routeJson({
      path: `/admin/notification-drafts/${draftAId}/approval-status`,
      authenticateRequest: contextFor()
    });

    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.approvalStatus, 'pending');
    assert.equal(detail.body.approval.id, approvalId);
    assert.equal(list.statusCode, 200);
    assert.equal(list.body.items.find((item) => item.id === draftAId).approvalStatus, 'pending');
    assert.equal(status.statusCode, 200);
    assert.equal(status.body.approvalStatus, 'pending');
  });

  await t.test('5. Admin can approve pending request and audit is recorded', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-approval-requests/${approvalId}/approve`,
      authenticateRequest: contextFor(),
      body: { note: 'Approved for future gated send.' }
    });
    const audit = await pool.query(
      `
        select action_type
        from audit_logs
        where clinic_id = $1 and entity_type = 'notification_approval_request' and entity_id = $2
        order by id
      `,
      [tenantA.clinicId, approvalId]
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'approved');
    assert.equal(res.body.decidedByUserId, ownerUserId);
    assert.deepEqual(audit.rows.map((row) => row.action_type), [
      'notification.approval_requested',
      'notification.approved'
    ]);
  });

  await t.test('6. Cannot approve or reject non-pending request', async () => {
    const approveAgain = await routeJson({
      method: 'POST',
      path: `/admin/notification-approval-requests/${approvalId}/approve`,
      authenticateRequest: contextFor()
    });
    const rejectApproved = await routeJson({
      method: 'POST',
      path: `/admin/notification-approval-requests/${approvalId}/reject`,
      authenticateRequest: contextFor()
    });

    assert.equal(approveAgain.statusCode, 409);
    assert.equal(approveAgain.body.error.code, 'NOTIFICATION_APPROVAL_NOT_PENDING');
    assert.equal(rejectApproved.statusCode, 409);
    assert.equal(rejectApproved.body.error.code, 'NOTIFICATION_APPROVAL_NOT_PENDING');
  });

  await t.test('7. Admin can reject and cancel separate pending requests', async () => {
    const rejectDraftId = await createDraft(pool, tenantA, uniqueId, { sourceId: '8101' });
    const cancelDraftId = await createDraft(pool, tenantA, uniqueId, { sourceId: '8102' });
    const rejectRequest = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${rejectDraftId}/approval-request`,
      authenticateRequest: contextFor()
    });
    const cancelRequest = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${cancelDraftId}/approval-request`,
      authenticateRequest: contextFor()
    });

    const rejected = await routeJson({
      method: 'POST',
      path: `/admin/notification-approval-requests/${rejectRequest.body.id}/reject`,
      authenticateRequest: contextFor(),
      body: { note: 'Needs edits.' }
    });
    const cancelled = await routeJson({
      method: 'POST',
      path: `/admin/notification-approval-requests/${cancelRequest.body.id}/cancel`,
      authenticateRequest: contextFor(),
      body: { note: 'No longer needed.' }
    });

    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.body.status, 'rejected');
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.body.status, 'cancelled');
  });

  await t.test('8. Approval does not send notification or create sent/delivered attempt', async () => {
    const outbound = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenantA.clinicId]);
    const attempts = await pool.query(
      `
        select count(*)::int as count
        from notification_delivery_attempts
        where clinic_id = $1 and draft_id = $2 and status in ('sent', 'delivered')
      `,
      [tenantA.clinicId, draftAId]
    );

    assert.equal(outbound.rows[0].count, 0);
    assert.equal(attempts.rows[0].count, 0);
  });

  await t.test('9. Send-control guard blocks missing or unapproved approvals', () => {
    const draft = { id: draftAId, tenantId: tenantA.clinicId, channel: 'email' };

    assert.throws(
      () => assertNotificationApprovedForRealDelivery(draft, null),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    );
    assert.throws(
      () => assertNotificationApprovedForRealDelivery(draft, { status: 'pending' }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    );
  });

  await t.test('10. Send-control guard still blocks when real delivery disabled or kill switch active', () => {
    const draft = { id: draftAId, tenantId: tenantA.clinicId, channel: 'email' };
    const approval = { status: 'approved' };

    assert.throws(
      () => assertNotificationSendControlAllowed({
        draft,
        approval,
        config: { notifications: { realDeliveryEnabled: false, globalKillSwitch: false } }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_REAL_DELIVERY_DISABLED'
    );

    assert.throws(
      () => assertNotificationSendControlAllowed({
        draft,
        approval,
        config: { notifications: { realDeliveryEnabled: true, globalKillSwitch: true } }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE'
    );
  });

  await t.test('11. Send-control guard blocks unready provider and unsupported channel', () => {
    assert.throws(
      () => assertNotificationSendControlAllowed({
        draft: { id: draftAId, tenantId: tenantA.clinicId, channel: 'webhook' },
        approval: { status: 'approved' },
        config: { notifications: { realDeliveryEnabled: true, globalKillSwitch: false } }
      }),
      (error) => error instanceof AppError && error.code === 'UNSUPPORTED_NOTIFICATION_CHANNEL'
    );

    assert.throws(
      () => assertNotificationSendControlAllowed({
        draft: { id: draftAId, tenantId: tenantA.clinicId, channel: 'email' },
        approval: { status: 'approved' },
        config: {
          notifications: {
            realDeliveryEnabled: true,
            globalKillSwitch: false,
            email: { enabled: false, provider: 'smtp', from: 'noreply@example.com' }
          }
        }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_SEND_CONTROL_BLOCKED'
    );
  });

  await t.test('12. Every new AppError code has Thai user-message mapping', () => {
    for (const code of [
      'NOTIFICATION_APPROVAL_NOT_FOUND',
      'NOTIFICATION_APPROVAL_ALREADY_EXISTS',
      'NOTIFICATION_APPROVAL_NOT_PENDING',
      'INVALID_NOTIFICATION_APPROVAL_DECISION',
      'NOTIFICATION_SEND_CONTROL_BLOCKED',
      'NOTIFICATION_SEND_APPROVAL_REQUIRED'
    ]) {
      assert.equal(typeof THAI_ERROR_MESSAGES[code], 'string');
      assert.ok(THAI_ERROR_MESSAGES[code].length > 0);
    }
  });
});
