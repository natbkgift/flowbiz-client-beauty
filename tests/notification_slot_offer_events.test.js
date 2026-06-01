'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const {
  createAdminBookingRequestSlotOffer,
  updateAdminBookingRequestSlotOfferStatus,
  updateAdminBookingRequestStatus
} = require('../apps/api/src/modules/booking-requests/service');
const {
  hashAccessToken,
  respondToMemberSlotOffer
} = require('../apps/api/src/modules/member-access/service');

async function createTenant(pool, uniqueId) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`Notification Event Clinic ${uniqueId}`, `notification-event-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `Notification Event Org ${uniqueId}`, `notification-event-org-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `Notification Event Workspace ${uniqueId}`, `notification-event-ws-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `notification-event-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`notification-event-${uniqueId}@flowbiz.local`, 'Notification Event Owner']
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
      `notification-event-lead-${uniqueId}`,
      'Notification Event Lead',
      '0891111111',
      `notification-event-lead-${uniqueId}@example.com`,
      '@notification-event-lead'
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
      'Notification Event Member',
      '0892222222',
      `notification-event-member-${uniqueId}@example.com`,
      '@notification-event-member'
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
        '2099-06-15', 'afternoon', 'consultation', 'soon', 'requested',
        '{}'::jsonb, 'line', $4, $5, $6, $7, $8, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      'Notification Event Customer',
      '0893333333',
      `notification-event-customer-${uniqueId}@example.com`,
      '@notification-event-customer',
      'raw event private booking message'
    ]
  );
  return Number(result.rows[0].id);
}

async function createAccessToken(pool, tenant, memberId, rawToken) {
  await pool.query(
    `
      insert into clinic_member_access_tokens (
        clinic_id,
        member_id,
        token_hash,
        purpose,
        delivery_channel,
        contact_hint,
        expires_at,
        metadata_json
      )
      values ($1, $2, $3, 'member_access', 'email', 'email', $4, '{}'::jsonb)
    `,
    [tenant.clinicId, memberId, hashAccessToken(rawToken), new Date(Date.now() + 60 * 60 * 1000).toISOString()]
  );
}

test('Notification slot-offer integrations create draft-only records', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  let tenant;
  let userId;
  let leadId;
  let memberId;
  let bookingRequestId;

  t.before(async () => {
    tenant = await createTenant(pool, uniqueId);
    userId = await createUser(pool, uniqueId);
    leadId = await createLead(pool, tenant, uniqueId);
    memberId = await createMember(pool, tenant, leadId, uniqueId);
    bookingRequestId = await createBookingRequest(pool, tenant, leadId, memberId, uniqueId);
  });

  t.after(async () => {
    try {
      if (tenant?.clinicId) {
        await pool.query('delete from clinics where id = $1', [tenant.clinicId]);
      }
      if (userId) {
        await pool.query('delete from users where id = $1', [userId]);
      }
    } finally {
      await pool.end();
    }
  });

  const context = () => ({
    currentUser: { id: userId, email: `notification-event-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role: 'owner', permissions: [] }
  });

  await t.test('admin booking status update creates booking_request.status_changed draft', async () => {
    await updateAdminBookingRequestStatus(context(), bookingRequestId, { status: 'contacted' });

    const result = await pool.query(
      `
        select *
        from notification_drafts
        where clinic_id = $1
          and event_type = 'booking_request.status_changed'
          and source_type = 'booking_request'
          and source_id = $2
        order by id desc
        limit 1
      `,
      [tenant.clinicId, String(bookingRequestId)]
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].status, 'draft');
    assert.equal(result.rows[0].metadata_json.fromStatus, 'new');
    assert.equal(result.rows[0].metadata_json.toStatus, 'contacted');
  });

  await t.test('admin sends slot offer creates slot_offer.sent draft only', async () => {
    const created = await createAdminBookingRequestSlotOffer(context(), bookingRequestId, {
      offeredDate: '2099-06-20',
      offeredTimeWindow: 'specific_time',
      offeredStartTime: '14:00',
      durationMinutes: 60,
      offerStatus: 'draft',
      offerNote: 'raw offer note',
      internalNote: 'raw internal note',
      metadata: { unsafe: 'raw metadata' }
    });

    await updateAdminBookingRequestSlotOfferStatus(context(), bookingRequestId, created.offer.id, { offerStatus: 'sent' });

    const result = await pool.query(
      `
        select *
        from notification_drafts
        where clinic_id = $1
          and event_type = 'slot_offer.sent'
          and source_type = 'slot_offer'
          and source_id = $2
        limit 1
      `,
      [tenant.clinicId, String(created.offer.id)]
    );
    const outbound = await pool.query('select count(*)::int as count from outbound_messages where clinic_id = $1', [tenant.clinicId]);

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].status, 'draft');
    assert.equal(result.rows[0].recipient_type, 'member');
    assert.equal(outbound.rows[0].count, 0);
  });

  await t.test('customer accept and decline create admin drafts', async () => {
    const accepted = await createAdminBookingRequestSlotOffer(context(), bookingRequestId, {
      offeredDate: '2099-06-21',
      offeredTimeWindow: 'afternoon',
      offerStatus: 'ready_to_send'
    });
    const declined = await createAdminBookingRequestSlotOffer(context(), bookingRequestId, {
      offeredDate: '2099-06-22',
      offeredTimeWindow: 'morning',
      offerStatus: 'ready_to_send'
    });
    const token = `notification-event-token-${uniqueId}`;
    await createAccessToken(pool, tenant, memberId, token);

    await respondToMemberSlotOffer(tenant.clinicSlug, accepted.offer.id, {
      token,
      response: 'accepted',
      note: 'raw customer accept note'
    });
    await respondToMemberSlotOffer(tenant.clinicSlug, declined.offer.id, {
      token,
      response: 'declined',
      note: 'raw customer decline note'
    });

    const result = await pool.query(
      `
        select event_type, status, recipient_type, recipient_id, metadata_json
        from notification_drafts
        where clinic_id = $1
          and event_type in ('slot_offer.accepted', 'slot_offer.declined')
          and source_id = any($2::text[])
        order by event_type asc
      `,
      [tenant.clinicId, [String(accepted.offer.id), String(declined.offer.id)]]
    );
    const serialized = JSON.stringify(result.rows);

    assert.equal(result.rowCount, 2);
    assert.ok(result.rows.every((row) => row.status === 'draft'));
    assert.ok(result.rows.every((row) => row.recipient_type === 'admin'));
    assert.ok(result.rows.every((row) => Number(row.recipient_id) === userId));
    assert.doesNotMatch(serialized, /raw customer accept note/);
    assert.doesNotMatch(serialized, /raw customer decline note/);
  });
});
