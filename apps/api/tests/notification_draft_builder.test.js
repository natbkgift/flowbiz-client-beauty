'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const {
  buildNotificationDraft,
  createNotificationDraftForEvent,
  sanitizeMetadata
} = require('../src/modules/notifications/service');

async function createTenant(pool, uniqueId) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Notification Draft Clinic ${uniqueId}`, `notification-draft-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Draft Org ${uniqueId}`, `notification-draft-org-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Draft Workspace ${uniqueId}`, `notification-draft-ws-${uniqueId}`]
  );

  return {
    clinicId,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-draft-${uniqueId}@flowbiz.local`, 'Notification Draft Owner']
  );
  return Number(result.rows[0].id);
}

async function createLead(pool, tenant, uniqueId) {
  const result = await pool.query(
    `
      insert into leads (
        clinic_id, organization_id, workspace_id, source, source_ref,
        full_name, phone, email, line_user_id, status, stage
      )
      values ($1, $2, $3, 'website', $4, $5, $6, $7, $8, 'new', 'inquiry')
      returning id
    `,
    [
      tenant.clinicId,
      tenant.organizationId,
      tenant.workspaceId,
      `notification-draft-lead-${uniqueId}`,
      'Private Draft Customer',
      '0891234567',
      `private-draft-${uniqueId}@example.com`,
      '@private-draft'
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId) {
  const result = await pool.query(
    `
      insert into clinic_members (clinic_id, lead_id, display_name, phone, email, line_id, status, source)
      values ($1, $2, $3, $4, $5, $6, 'active', 'public_booking_request')
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      'Private Draft Member',
      '0897654321',
      `private-member-${uniqueId}@example.com`,
      '@private-member'
    ]
  );
  return Number(result.rows[0].id);
}

async function createBookingRequest(pool, tenant, leadId, memberId, uniqueId) {
  const result = await pool.query(
    `
      insert into clinic_booking_requests (
        clinic_id, lead_id, member_id, request_type, interest_type,
        preferred_date, preferred_time_window, visit_type, urgency, slot_status,
        slot_request_json, preferred_contact_method, customer_name, phone,
        email, line_id, message, status
      )
      values (
        $1, $2, $3, 'booking_request', 'service',
        '2099-06-15', 'afternoon', 'consultation', 'soon', 'offered',
        '{}'::jsonb, 'line', $4, $5, $6, $7, $8, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      'Unsafe Draft Customer',
      '0899999999',
      `unsafe-draft-${uniqueId}@example.com`,
      '@unsafe-draft',
      'raw private booking draft message'
    ]
  );
  return Number(result.rows[0].id);
}

async function createSlotOffer(pool, tenant, bookingRequestId, leadId, memberId, ownerUserId, status = 'sent') {
  const result = await pool.query(
    `
      insert into clinic_booking_slot_offers (
        clinic_id,
        booking_request_id,
        lead_id,
        member_id,
        offered_date,
        offered_time_window,
        offered_start_time,
        duration_minutes,
        offer_status,
        offer_note,
        internal_note,
        created_by_user_id,
        updated_by_user_id,
        metadata_json
      )
      values ($1, $2, $3, $4, '2099-06-20', 'specific_time', '14:00', 60, $5, $6, $7, $8, $8, $9::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingRequestId,
      leadId,
      memberId,
      status,
      'raw unsafe offer note',
      'raw unsafe internal note',
      ownerUserId,
      JSON.stringify({ unsafe: 'raw unsafe slot metadata' })
    ]
  );
  return Number(result.rows[0].id);
}

test('Notification draft builder creates draft-only records safely', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenant;
  let ownerUserId;
  let leadId;
  let memberId;
  let bookingRequestId;
  let sentOfferId;
  let declinedOfferId;

  t.before(async () => {
    tenant = await createTenant(pool, uniqueId);
    ownerUserId = await createUser(pool, uniqueId);
    leadId = await createLead(pool, tenant, uniqueId);
    memberId = await createMember(pool, tenant, leadId, uniqueId);
    bookingRequestId = await createBookingRequest(pool, tenant, leadId, memberId, uniqueId);
    sentOfferId = await createSlotOffer(pool, tenant, bookingRequestId, leadId, memberId, ownerUserId, 'sent');
    declinedOfferId = await createSlotOffer(pool, tenant, bookingRequestId, leadId, memberId, ownerUserId, 'declined');
  });

  t.after(async () => {
    try {
      if (tenant?.clinicId) {
        await pool.query('delete from clinics where id = $1', [tenant.clinicId]);
      }
      if (ownerUserId) {
        await pool.query('delete from users where id = $1', [ownerUserId]);
      }
    } finally {
      await pool.end();
    }
  });

  await t.test('creates draft for slot_offer.sent and prevents duplicates', async () => {
    const first = await createNotificationDraftForEvent({
      tenantId: tenant.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: sentOfferId
    }, pool);
    const second = await createNotificationDraftForEvent({
      tenantId: tenant.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: sentOfferId
    }, pool);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.draft.tenantId, tenant.clinicId);
    assert.equal(first.draft.eventType, 'slot_offer.sent');
    assert.equal(first.draft.recipientType, 'member');
    assert.equal(first.draft.channel, 'line');
    assert.equal(first.draft.status, 'draft');
    assert.match(first.draft.idempotencyKey, /event:slot_offer\.sent/);

    const count = await pool.query('select count(*)::int as count from notification_drafts where idempotency_key = $1', [
      first.draft.idempotencyKey
    ]);
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('creates admin draft for slot_offer.accepted', async () => {
    const result = await createNotificationDraftForEvent({
      tenantId: tenant.clinicId,
      eventType: 'slot_offer.accepted',
      sourceId: sentOfferId
    }, pool);

    assert.equal(result.draft.eventType, 'slot_offer.accepted');
    assert.equal(result.draft.recipientType, 'admin');
    assert.equal(result.draft.recipientId, ownerUserId);
    assert.equal(result.draft.channel, 'email');
    assert.equal(result.draft.status, 'draft');
  });

  await t.test('creates admin draft for slot_offer.declined', async () => {
    const result = await createNotificationDraftForEvent({
      tenantId: tenant.clinicId,
      eventType: 'slot_offer.declined',
      sourceId: declinedOfferId
    }, pool);

    assert.equal(result.draft.eventType, 'slot_offer.declined');
    assert.equal(result.draft.recipientType, 'admin');
    assert.equal(result.draft.recipientId, ownerUserId);
    assert.equal(result.draft.status, 'draft');
  });

  await t.test('creates customer draft for booking_request.status_changed', async () => {
    const result = await createNotificationDraftForEvent({
      tenantId: tenant.clinicId,
      eventType: 'booking_request.status_changed',
      sourceId: bookingRequestId,
      metadata: {
        fromStatus: 'new',
        toStatus: 'contacted'
      }
    }, pool);

    assert.equal(result.draft.eventType, 'booking_request.status_changed');
    assert.equal(result.draft.sourceType, 'booking_request');
    assert.equal(result.draft.sourceId, String(bookingRequestId));
    assert.equal(result.draft.metadata.fromStatus, 'new');
    assert.equal(result.draft.metadata.toStatus, 'contacted');
    assert.equal(result.draft.status, 'draft');
  });

  await t.test('draft metadata and content do not expose unsafe customer fields', async () => {
    const unsafe = buildNotificationDraft({
      tenantId: tenant.clinicId,
      eventType: 'slot_offer.sent',
      sourceType: 'slot_offer',
      sourceId: sentOfferId,
      recipientType: 'lead',
      recipientId: leadId,
      channel: 'line',
      metadata: {
        customerName: 'Unsafe Draft Customer',
        phone: '0899999999',
        email: `unsafe-draft-${uniqueId}@example.com`,
        lineId: '@unsafe-draft',
        message: 'raw private booking draft message',
        safe: { bookingRequestId }
      }
    });
    const serialized = JSON.stringify(unsafe);

    assert.deepEqual(sanitizeMetadata({ customerName: 'Unsafe Draft Customer', safe: true }), { safe: true });
    assert.doesNotMatch(serialized, /Unsafe Draft Customer/);
    assert.doesNotMatch(serialized, /0899999999/);
    assert.doesNotMatch(serialized, /unsafe-draft-/);
    assert.doesNotMatch(serialized, /@unsafe-draft/);
    assert.doesNotMatch(serialized, /raw private booking draft message/);
    assert.equal(unsafe.metadata.safe.bookingRequestId, bookingRequestId);
  });

  await t.test('creating drafts does not create outbound delivery records', async () => {
    const outbound = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenant.clinicId]);
    assert.equal(outbound.rows[0].count, 0);
  });
});
