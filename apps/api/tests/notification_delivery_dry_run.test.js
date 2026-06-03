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
  deliverNotificationDraft,
  dryRunNotificationDraftDelivery,
  resolveDryRunAdapter
} = require('../src/modules/notifications/delivery-service');

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
      { method, headers: {}, socket: { remoteAddress: `127.17.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
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
    [`Notification Dry Run Clinic ${suffix} ${uniqueId}`, `notification-dry-run-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Dry Run Org ${suffix}`, `notification-dry-run-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Dry Run Workspace ${suffix}`, `notification-dry-run-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-dry-run-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-dry-run-${role}-${uniqueId}@flowbiz.local`, `Notification Dry Run ${role}`]
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
      overrides.message || 'Preview only notification body',
      overrides.sourceType || 'slot_offer',
      overrides.sourceId || '7001',
      overrides.idempotencyKey || `notification-dry-run-${uniqueId}-${tenant.clinicId}-${Date.now()}-${Math.random()}`,
      JSON.stringify(overrides.metadata || { bookingRequestId: 501, offerId: 7001, safe: true }),
      overrides.createdAt || '2026-06-01T08:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

test('Notification Delivery Dry Run - tenant-scoped dry-run attempts', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let draftAId;
  let draftBId;

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
      channel: 'sms',
      recipientRef: 'member:999',
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
    currentUser: { id: ownerUserId, email: `notification-dry-run-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Admin can dry-run delivery for own tenant draft', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/dry-run-delivery`,
      authenticateRequest: contextFor()
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.tenantId, tenantA.clinicId);
    assert.equal(res.body.draftId, draftAId);
    assert.equal(res.body.mode, 'dry_run');
    assert.equal(res.body.status, 'dry_run');
    assert.equal(res.body.channel, 'email');
    assert.equal(res.body.provider, 'dry_run_email');
    assert.equal(res.body.result.externalCallMade, false);
    assert.equal(res.body.result.blockedRealSend, true);
    assert.equal(res.body.payload.message.body, 'Preview only notification body');
  });

  await t.test('2. Admin cannot dry-run another tenant draft', async () => {
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftBId}/dry-run-delivery`,
      authenticateRequest: contextFor()
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOTIFICATION_DRAFT_NOT_FOUND');
  });

  await t.test('3. Dry-run creates a delivery attempt record', async () => {
    const result = await pool.query(
      `
        select *
        from notification_delivery_attempts
        where clinic_id = $1 and draft_id = $2
      `,
      [tenantA.clinicId, draftAId]
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].mode, 'dry_run');
    assert.equal(result.rows[0].status, 'dry_run');
  });

  await t.test('4. Repeated dry-run is idempotent', async () => {
    const first = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/dry-run-delivery`,
      authenticateRequest: contextFor()
    });
    const second = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/dry-run-delivery`,
      authenticateRequest: contextFor()
    });
    const count = await pool.query(
      'select count(*)::int as count from notification_delivery_attempts where clinic_id = $1 and draft_id = $2',
      [tenantA.clinicId, draftAId]
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.equal(first.body.id, second.body.id);
    assert.equal(first.body.idempotencyKey, second.body.idempotencyKey);
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('5. Dry-run result includes safety flags and no outbound message', async () => {
    const before = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenantA.clinicId]);
    const res = await routeJson({
      method: 'POST',
      path: `/admin/notification-drafts/${draftAId}/dry-run-delivery`,
      authenticateRequest: contextFor()
    });
    const after = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenantA.clinicId]);

    assert.equal(res.body.mode, 'dry_run');
    assert.equal(res.body.status, 'dry_run');
    assert.equal(res.body.result.externalCallMade, false);
    assert.equal(res.body.result.blockedRealSend, true);
    assert.equal(res.body.result.adapterResult.externalCallMade, false);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('6. Unsupported channel is blocked safely', async () => {
    assert.throws(
      () => resolveDryRunAdapter('webhook'),
      (error) => error instanceof AppError && error.code === 'UNSUPPORTED_NOTIFICATION_CHANNEL'
    );
  });

  await t.test('7. Real delivery is impossible and dry-run can be disabled', async () => {
    await assert.rejects(
      () => deliverNotificationDraft(),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_REAL_DELIVERY_DISABLED'
    );

    await assert.rejects(
      () => deliverNotificationDraft(null, draftAId, { config: { notificationRealDeliveryEnabled: true } }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE'
    );

    const context = await contextFor()();
    await assert.rejects(
      () => dryRunNotificationDraftDelivery(
        context,
        draftAId,
        { client: pool, config: { notificationDryRunEnabled: false, notificationRealDeliveryEnabled: false } }
      ),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_DRY_RUN_DISABLED'
    );

    const dryRunWithRealFlag = await dryRunNotificationDraftDelivery(
      context,
      draftAId,
      { client: pool, config: { notificationDryRunEnabled: true, notificationRealDeliveryEnabled: true } }
    );
    assert.equal(dryRunWithRealFlag.result.externalCallMade, false);
    assert.equal(dryRunWithRealFlag.result.blockedRealSend, true);
  });

  await t.test('8. Delivery attempts endpoint is read-only and tenant-scoped', async () => {
    const res = await routeJson({
      path: `/admin/notification-drafts/${draftAId}/delivery-attempts`,
      authenticateRequest: contextFor()
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].draftId, draftAId);

    const crossTenant = await routeJson({
      path: `/admin/notification-drafts/${draftBId}/delivery-attempts`,
      authenticateRequest: contextFor()
    });
    assert.equal(crossTenant.statusCode, 404);
    assert.equal(crossTenant.body.error.code, 'NOTIFICATION_DRAFT_NOT_FOUND');
  });

  await t.test('9. Every new AppError code has Thai user-message mapping', async () => {
    for (const code of [
      'INVALID_NOTIFICATION_DELIVERY_MODE',
      'NOTIFICATION_DRY_RUN_DISABLED',
      'UNSUPPORTED_NOTIFICATION_CHANNEL',
      'NOTIFICATION_REAL_DELIVERY_DISABLED',
      'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE',
      'NOTIFICATION_PROVIDER_DISABLED',
      'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
      'NOTIFICATION_PROVIDER_SECRET_MISSING'
    ]) {
      assert.equal(typeof THAI_ERROR_MESSAGES[code], 'string');
      assert.ok(THAI_ERROR_MESSAGES[code].length > 0);
    }
  });
});
