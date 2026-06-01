'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { handleNotificationRoutes } = require('../src/modules/notifications/routes');

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

async function routeJson({ method = 'GET', path, authenticateRequest, searchParams = {} }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    const handled = await handleNotificationRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.16.0.${Math.floor(Math.random() * 200) + 1}` } },
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
    [`Notification Preview Clinic ${suffix} ${uniqueId}`, `notification-preview-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Preview Org ${suffix}`, `notification-preview-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Preview Workspace ${suffix}`, `notification-preview-ws-${suffix}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-preview-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, role) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-preview-${role}-${uniqueId}@flowbiz.local`, `Notification Preview ${role}`]
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
      overrides.idempotencyKey || `notification-preview-${uniqueId}-${tenant.clinicId}-${Date.now()}-${Math.random()}`,
      JSON.stringify(overrides.metadata || { bookingRequestId: 501, offerId: 7001, safe: true }),
      overrides.createdAt || '2026-06-01T08:00:00.000Z'
    ]
  );
  return Number(result.rows[0].id);
}

test('Notification Admin Preview API - read-only tenant-scoped drafts', async (t) => {
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
      sourceId: '8001',
      createdAt: '2026-06-01T09:00:00.000Z'
    });
    draftBId = await createDraft(pool, tenantB, uniqueId, {
      recipientRef: 'member:999',
      sourceId: '9001',
      createdAt: '2026-06-01T10:00:00.000Z'
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
    currentUser: { id: ownerUserId, email: `notification-preview-${role}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, permissions: [] }
  });

  await t.test('1. Auth required', async () => {
    const res = await routeJson({ path: '/admin/notification-drafts' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  await t.test('2. Admin can list notification drafts for current tenant', async () => {
    const res = await routeJson({
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor()
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.items.some((item) => item.id === draftAId));
    assert.equal(res.body.items.some((item) => item.id === draftBId), false);
    assert.equal(res.body.items.find((item) => item.id === draftAId).status, 'draft');
    assert.equal(res.body.limit, 50);
    assert.equal(res.body.offset, 0);
  });

  await t.test('3. Admin cannot see drafts from another tenant', async () => {
    const res = await routeJson({
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor(tenantB)
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.some((item) => item.id === draftAId), false);
    assert.ok(res.body.items.some((item) => item.id === draftBId));
  });

  await t.test('4. Draft detail endpoint returns one draft from current tenant', async () => {
    const res = await routeJson({
      path: `/admin/notification-drafts/${draftAId}`,
      authenticateRequest: contextFor()
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, draftAId);
    assert.equal(res.body.tenantId, tenantA.clinicId);
    assert.equal(res.body.status, 'draft');
    assert.equal(res.body.metadata.safe, true);
  });

  await t.test('5. Draft detail endpoint rejects another tenant draft', async () => {
    const res = await routeJson({
      path: `/admin/notification-drafts/${draftBId}`,
      authenticateRequest: contextFor()
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOTIFICATION_DRAFT_NOT_FOUND');
  });

  await t.test('6. Filters are tenant-scoped and reject tenant override', async () => {
    const filtered = await routeJson({
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor(),
      searchParams: { eventType: 'slot_offer.accepted', channel: 'email', status: 'draft', sourceType: 'slot_offer', sourceId: '8001' }
    });
    assert.equal(filtered.statusCode, 200);
    assert.deepEqual(filtered.body.items.map((item) => item.id), [draftAId]);

    const override = await routeJson({
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor(),
      searchParams: { clinicId: tenantB.clinicId }
    });
    assert.equal(override.statusCode, 400);
    assert.equal(override.body.error.code, 'INVALID_REQUEST');
  });

  await t.test('7. API is read-only and does not create outbound delivery records', async () => {
    const before = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenantA.clinicId]);
    const res = await routeJson({
      method: 'POST',
      path: '/admin/notification-drafts',
      authenticateRequest: contextFor()
    });
    const after = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenantA.clinicId]);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(after.rows[0].count, before.rows[0].count);
  });
});
