'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const {
  createNotificationDraft,
  createNotificationDraftForEvent,
  isValidNotificationEmail
} = require('../src/modules/notifications/service');
const {
  approveNotificationDraft,
  requestNotificationApproval
} = require('../src/modules/notifications/approval-service');
const { sendApprovedNotificationEmail } = require('../src/modules/notifications/email-service');
const { renderNotificationTemplate } = require('../src/modules/notifications/templates');

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`PR16B Clinic ${suffix} ${uniqueId}`, `pr16b-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR16B Org ${suffix}`, `pr16b-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR16B Workspace ${suffix}`, `pr16b-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr16b-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, 'PR16B Owner', 'hash', 'active') returning id",
    [`pr16b-owner-${uniqueId}@flowbiz.local`]
  );
  return Number(result.rows[0].id);
}

async function createLead(pool, tenant, uniqueId, suffix, overrides = {}) {
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
      `pr16b-lead-${suffix}-${uniqueId}`,
      overrides.fullName === undefined ? `PR16B Lead ${suffix}` : overrides.fullName,
      overrides.phone === undefined ? `08916${suffix}` : overrides.phone,
      overrides.email === undefined ? `pr16b-lead-${suffix}-${uniqueId}@example.com` : overrides.email,
      overrides.lineId === undefined ? `@pr16b-lead-${suffix}` : overrides.lineId
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId, suffix, overrides = {}) {
  const result = await pool.query(
    `
      insert into clinic_members (clinic_id, lead_id, display_name, phone, email, line_id, status, source)
      values ($1, $2, $3, $4, $5, $6, 'active', 'public_booking_request')
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      overrides.displayName === undefined ? `PR16B Member ${suffix}` : overrides.displayName,
      overrides.phone === undefined ? `08926${suffix}` : overrides.phone,
      overrides.email === undefined ? `pr16b-member-${suffix}-${uniqueId}@example.com` : overrides.email,
      overrides.lineId === undefined ? `@pr16b-member-${suffix}` : overrides.lineId
    ]
  );
  return Number(result.rows[0].id);
}

async function createBookingRequest(pool, tenant, leadId, memberId, uniqueId, suffix, overrides = {}) {
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
        '{}'::jsonb, $4, $5, $6, $7, $8, $9, 'new'
      )
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      memberId,
      overrides.preferredContactMethod || 'line',
      overrides.customerName === undefined ? `PR16B Customer ${suffix}` : overrides.customerName,
      overrides.phone === undefined ? `08936${suffix}` : overrides.phone,
      overrides.email === undefined ? `pr16b-booking-${suffix}-${uniqueId}@example.com` : overrides.email,
      overrides.lineId === undefined ? `@pr16b-booking-${suffix}` : overrides.lineId,
      overrides.message === undefined ? `raw PR16B private message ${suffix}` : overrides.message
    ]
  );
  return Number(result.rows[0].id);
}

async function createSlotOffer(pool, tenant, bookingRequestId, leadId, memberId, ownerUserId, suffix, overrides = {}) {
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
      values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $12, $13::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      bookingRequestId,
      leadId,
      memberId,
      overrides.offeredDate || '2099-06-20',
      overrides.offeredTimeWindow || 'specific_time',
      Object.prototype.hasOwnProperty.call(overrides, 'offeredStartTime') ? overrides.offeredStartTime : '14:00',
      Object.prototype.hasOwnProperty.call(overrides, 'durationMinutes') ? overrides.durationMinutes : 60,
      overrides.offerStatus || 'sent',
      overrides.offerNote === undefined ? `raw PR16B offer note ${suffix}` : overrides.offerNote,
      overrides.internalNote === undefined ? `raw PR16B internal note ${suffix}` : overrides.internalNote,
      ownerUserId,
      JSON.stringify(overrides.metadata || { unsafe: `raw PR16B metadata ${suffix}` })
    ]
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
        replyTo: 'reply@example.test'
      },
      line: { enabled: false, provider: 'none', channelAccessTokenConfigured: false },
      sms: { enabled: false, provider: 'none', from: null }
    }
  };
}

function contextFor(tenant, ownerUserId, uniqueId) {
  return {
    currentUser: { id: ownerUserId, email: `pr16b-owner-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role: 'owner', permissions: [] }
  };
}

async function approveDraft(context, draftId, pool) {
  const approval = await requestNotificationApproval(context, draftId, {}, pool);
  return approveNotificationDraft(context, approval.id, {}, pool);
}

function assertMetadataIsSlotOfferSafe(metadata, rawNeedles = []) {
  assert.deepEqual(Object.keys(metadata).sort(), [
    'bookingRequestId',
    'durationMinutes',
    'offerId',
    'offerStatus',
    'offeredDate',
    'offeredStartTimeProvided',
    'offeredTimeWindow',
    'recipientEmailAvailable',
    'recipientSource'
  ]);

  const serialized = JSON.stringify(metadata);
  for (const needle of rawNeedles) {
    assert.equal(serialized.includes(needle), false, `metadata leaked ${needle}`);
  }
}

test('PR16B Customer Slot Offer Email Delivery', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    ownerUserId = await createUser(pool, uniqueId);
    userIds.push(ownerUserId);
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

  await t.test('creates an email draft for slot_offer.sent using member email even when preferred contact is LINE', async () => {
    const leadId = await createLead(pool, tenantA, uniqueId, 'member-source');
    const memberId = await createMember(pool, tenantA, leadId, uniqueId, 'member-source');
    const bookingRequestId = await createBookingRequest(pool, tenantA, leadId, memberId, uniqueId, 'member-source', {
      preferredContactMethod: 'line'
    });
    const offerId = await createSlotOffer(pool, tenantA, bookingRequestId, leadId, memberId, ownerUserId, 'member-source');
    const expectedEmail = `pr16b-member-member-source-${uniqueId}@example.com`;

    const first = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerId
    }, pool);
    const second = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerId
    }, pool);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.draft.eventType, 'slot_offer.sent');
    assert.equal(first.draft.sourceType, 'slot_offer');
    assert.equal(first.draft.sourceId, String(offerId));
    assert.equal(first.draft.recipientType, 'member');
    assert.equal(first.draft.recipientId, memberId);
    assert.equal(first.draft.recipientRef, expectedEmail);
    assert.equal(first.draft.channel, 'email');
    assert.equal(first.draft.metadata.recipientEmailAvailable, true);
    assert.equal(first.draft.metadata.recipientSource, 'member');
    assert.equal(first.draft.metadata.offeredDate, '2099-06-20');
    assert.equal(first.draft.metadata.offeredTimeWindow, 'specific_time');
    assert.equal(first.draft.metadata.offeredStartTimeProvided, true);
    assertMetadataIsSlotOfferSafe(first.draft.metadata, [
      expectedEmail,
      'PR16B Customer member-source',
      '08936member-source',
      '@pr16b-booking-member-source',
      'raw PR16B private message member-source',
      'raw PR16B offer note member-source',
      'raw PR16B internal note member-source'
    ]);

    const count = await pool.query(
      "select count(*)::int as count from notification_drafts where clinic_id = $1 and event_type = 'slot_offer.sent' and source_id = $2",
      [tenantA.clinicId, String(offerId)]
    );
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('falls through tenant-scoped email sources from member to lead to booking request', async () => {
    const leadOnlyId = await createLead(pool, tenantA, uniqueId, 'lead-source');
    const memberWithoutEmailId = await createMember(pool, tenantA, leadOnlyId, uniqueId, 'lead-source', { email: null });
    const leadBookingId = await createBookingRequest(pool, tenantA, leadOnlyId, memberWithoutEmailId, uniqueId, 'lead-source');
    const leadOfferId = await createSlotOffer(pool, tenantA, leadBookingId, leadOnlyId, memberWithoutEmailId, ownerUserId, 'lead-source');
    const leadDraft = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: leadOfferId
    }, pool);

    assert.equal(leadDraft.draft.recipientType, 'lead');
    assert.equal(leadDraft.draft.recipientId, leadOnlyId);
    assert.equal(leadDraft.draft.recipientRef, `pr16b-lead-lead-source-${uniqueId}@example.com`);
    assert.equal(leadDraft.draft.channel, 'email');
    assert.equal(leadDraft.draft.metadata.recipientSource, 'lead');

    const bookingOnlyLeadId = await createLead(pool, tenantA, uniqueId, 'booking-source', { email: null });
    const bookingOnlyMemberId = await createMember(pool, tenantA, bookingOnlyLeadId, uniqueId, 'booking-source', { email: null });
    const bookingOnlyId = await createBookingRequest(pool, tenantA, bookingOnlyLeadId, bookingOnlyMemberId, uniqueId, 'booking-source');
    const bookingOfferId = await createSlotOffer(pool, tenantA, bookingOnlyId, bookingOnlyLeadId, bookingOnlyMemberId, ownerUserId, 'booking-source');
    const bookingDraft = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: bookingOfferId
    }, pool);

    assert.equal(bookingDraft.draft.recipientType, 'booking_request');
    assert.equal(bookingDraft.draft.recipientId, bookingOnlyId);
    assert.equal(bookingDraft.draft.recipientRef, `pr16b-booking-booking-source-${uniqueId}@example.com`);
    assert.equal(bookingDraft.draft.channel, 'email');
    assert.equal(bookingDraft.draft.metadata.recipientSource, 'booking_request');
  });

  await t.test('does not use cross-tenant lead or member email sources', async () => {
    const leadBId = await createLead(pool, tenantB, uniqueId, 'cross-b');
    const memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'cross-b');
    const bookingEmail = `pr16b-booking-cross-a-${uniqueId}@example.com`;
    const bookingAId = await createBookingRequest(pool, tenantA, leadBId, memberBId, uniqueId, 'cross-a', {
      email: bookingEmail
    });
    const offerAId = await createSlotOffer(pool, tenantA, bookingAId, leadBId, memberBId, ownerUserId, 'cross-a');
    const draft = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerAId
    }, pool);

    assert.equal(draft.draft.recipientType, 'booking_request');
    assert.equal(draft.draft.recipientId, bookingAId);
    assert.equal(draft.draft.recipientRef, bookingEmail);
    assert.equal(draft.draft.channel, 'email');
    assert.equal(draft.draft.metadata.recipientEmailAvailable, true);
    assert.equal(draft.draft.metadata.recipientSource, 'booking_request');
    assert.notEqual(draft.draft.recipientRef, `pr16b-member-cross-b-${uniqueId}@example.com`);
    assert.notEqual(draft.draft.recipientRef, `pr16b-lead-cross-b-${uniqueId}@example.com`);
  });

  await t.test('no-email fallback creates a non-email draft that manual email send cannot use', async () => {
    const leadId = await createLead(pool, tenantA, uniqueId, 'no-email', { email: null });
    const memberId = await createMember(pool, tenantA, leadId, uniqueId, 'no-email', { email: null });
    const bookingRequestId = await createBookingRequest(pool, tenantA, leadId, memberId, uniqueId, 'no-email', {
      preferredContactMethod: 'email',
      email: null
    });
    const offerId = await createSlotOffer(pool, tenantA, bookingRequestId, leadId, memberId, ownerUserId, 'no-email');
    const result = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerId
    }, pool);

    assert.equal(result.draft.recipientType, 'member');
    assert.equal(result.draft.recipientId, memberId);
    assert.equal(result.draft.recipientRef, `member:${memberId}`);
    assert.equal(result.draft.channel, 'line');
    assert.equal(result.draft.metadata.recipientEmailAvailable, false);
    assert.equal(result.draft.metadata.recipientSource, 'fallback');
    assert.equal(isValidNotificationEmail(result.draft.recipientRef), false);

    await approveDraft(contextFor(tenantA, ownerUserId, uniqueId), result.draft.id, pool);
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(tenantA, ownerUserId, uniqueId), result.draft.id, {
        client: pool,
        config: realSandboxConfig()
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_ONLY'
    );
  });

  await t.test('phone fallback remains SMS draft-only and is rejected by real email delivery', async () => {
    const leadId = await createLead(pool, tenantA, uniqueId, 'sms-fallback', { email: null });
    const memberId = await createMember(pool, tenantA, leadId, uniqueId, 'sms-fallback', { email: null });
    const bookingRequestId = await createBookingRequest(pool, tenantA, leadId, memberId, uniqueId, 'sms-fallback', {
      preferredContactMethod: 'phone',
      email: null
    });
    const offerId = await createSlotOffer(pool, tenantA, bookingRequestId, leadId, memberId, ownerUserId, 'sms-fallback');
    const result = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerId
    }, pool);

    assert.equal(result.draft.channel, 'sms');
    assert.equal(result.draft.recipientRef, `member:${memberId}`);

    await approveDraft(contextFor(tenantA, ownerUserId, uniqueId), result.draft.id, pool);
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(tenantA, ownerUserId, uniqueId), result.draft.id, {
        client: pool,
        config: realSandboxConfig()
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_ONLY'
    );
  });

  await t.test('approved manual sandbox email send works for a slot_offer.sent email draft with safe audit context', async () => {
    const leadId = await createLead(pool, tenantA, uniqueId, 'send-flow');
    const memberId = await createMember(pool, tenantA, leadId, uniqueId, 'send-flow');
    const bookingRequestId = await createBookingRequest(pool, tenantA, leadId, memberId, uniqueId, 'send-flow', {
      preferredContactMethod: 'email'
    });
    const offerId = await createSlotOffer(pool, tenantA, bookingRequestId, leadId, memberId, ownerUserId, 'send-flow');
    const recipientEmail = `pr16b-member-send-flow-${uniqueId}@example.com`;
    const draftResult = await createNotificationDraftForEvent({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceId: offerId
    }, pool);

    await approveDraft(contextFor(tenantA, ownerUserId, uniqueId), draftResult.draft.id, pool);
    const sent = await sendApprovedNotificationEmail(contextFor(tenantA, ownerUserId, uniqueId), draftResult.draft.id, {
      client: pool,
      config: realSandboxConfig()
    });

    assert.equal(sent.status, 'sent');
    assert.equal(sent.mode, 'real');
    assert.equal(sent.channel, 'email');
    assert.equal(sent.provider, 'sandbox');
    assert.equal(sent.result.externalCallMade, false);
    assert.equal(sent.result.safeResult, true);
    assert.equal(sent.result.accepted[0], recipientEmail);

    const audit = await pool.query(
      `
        select action_type, context_json
        from audit_logs
        where clinic_id = $1
          and action_type = any($2::text[])
          and context_json->>'draft_id' = $3
        order by id
      `,
      [
        tenantA.clinicId,
        ['notification.email_send_requested', 'notification.email_sent'],
        String(draftResult.draft.id)
      ]
    );
    const serializedAudit = JSON.stringify(audit.rows);

    assert.equal(audit.rowCount, 2);
    assert.equal(serializedAudit.includes(recipientEmail), false);
    assert.equal(serializedAudit.includes('raw PR16B private message send-flow'), false);
    assert.equal(serializedAudit.includes('raw PR16B offer note send-flow'), false);
    assert.ok(audit.rows.every((row) => row.context_json.recipient_ref_present === true));
  });

  await t.test('email send endpoint rejects email-channel drafts with non-email recipientRef', async () => {
    const draft = await createNotificationDraft({
      tenantId: tenantA.clinicId,
      eventType: 'slot_offer.sent',
      sourceType: 'slot_offer',
      sourceId: `invalid-recipient-${uniqueId}`,
      recipientType: 'member',
      recipientId: 999001,
      recipientRef: 'member:999001',
      channel: 'email',
      metadata: { bookingRequestId: 123, offerId: 456 }
    }, pool);

    await approveDraft(contextFor(tenantA, ownerUserId, uniqueId), draft.draft.id, pool);
    await assert.rejects(
      () => sendApprovedNotificationEmail(contextFor(tenantA, ownerUserId, uniqueId), draft.draft.id, {
        client: pool,
        config: realSandboxConfig()
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_EMAIL_RECIPIENT_INVALID'
    );
  });

  await t.test('slot_offer.sent template is customer-facing and does not imply confirmation or secure-link work', () => {
    const template = renderNotificationTemplate('slot_offer.sent');
    const serialized = `${template.title} ${template.subject} ${template.message}`;

    assert.equal(template.title, 'Appointment slot offer');
    assert.equal(template.subject, 'Your appointment slot offer is ready');
    assert.match(template.message, /prepared an appointment slot offer/);
    assert.doesNotMatch(serialized, /confirmed|booked|payment|token|magic|https?:|link|admin|internal/i);
  });
});
