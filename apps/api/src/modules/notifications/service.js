'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { renderNotificationTemplate } = require('./templates');
const { mapNotificationDraftRow } = require('./serializer');

const SUPPORTED_EVENT_TYPES = new Set([
  'slot_offer.sent',
  'slot_offer.accepted',
  'slot_offer.declined',
  'booking_request.status_changed'
]);

const CONTACT_METHOD_CHANNEL = {
  line: 'line',
  email: 'email',
  phone: 'sms'
};

const MAX_EMAIL_LENGTH = 254;
const bangkokDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const ADMIN_NOTIFICATION_DRAFT_ROLES = new Set([
  'owner',
  'manager',
  'marketing',
  'sales',
  'staff',
  'admin',
  'operator'
]);

const UNSAFE_METADATA_KEYS = new Set([
  'customerName',
  'fullName',
  'name',
  'phone',
  'email',
  'lineId',
  'line_id',
  'lineUserId',
  'line_user_id',
  'message',
  'note',
  'offerNote',
  'offer_note',
  'internalNote',
  'internal_note',
  'customerResponseNote',
  'customer_response_note',
  'honeypot'
]);

function normalizeTenantId(value) {
  const tenantId = Number(value);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT', 'tenantId is required.');
  }
  return tenantId;
}

function normalizeSourceId(value) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT', 'sourceId is required.');
  }
  return String(value);
}

function channelForContactMethod(method) {
  return CONTACT_METHOD_CHANNEL[method] || 'line';
}

function normalizeNotificationEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH || /\s/.test(trimmed)) {
    return null;
  }

  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf('@') || atIndex === trimmed.length - 1) {
    return null;
  }

  return trimmed;
}

function isValidNotificationEmail(value) {
  return Boolean(normalizeNotificationEmail(value));
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return bangkokDateFormatter.format(value);
  }
  return String(value).slice(0, 10);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce((metadata, [key, entryValue]) => {
    if (UNSAFE_METADATA_KEYS.has(key)) {
      return metadata;
    }

    if (isPlainObject(entryValue)) {
      metadata[key] = sanitizeMetadata(entryValue);
      return metadata;
    }

    if (Array.isArray(entryValue)) {
      metadata[key] = entryValue.map((item) => (
        isPlainObject(item) ? sanitizeMetadata(item) : item
      ));
      return metadata;
    }

    metadata[key] = entryValue;
    return metadata;
  }, {});
}

function trimString(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', 'Expected string query value.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function asPositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const stringValue = String(value);
  if (!/^\d+$/.test(stringValue)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a positive integer.`);
  }
  const parsed = Number.parseInt(stringValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function asNonNegativeInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const stringValue = String(value);
  if (!/^\d+$/.test(stringValue)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a non-negative integer.`);
  }
  const parsed = Number.parseInt(stringValue, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', `${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function rejectAdminClinicOverrideQuery(searchParams) {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden in the query string.');
  }
}

function assertAdminNotificationPreviewContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }

  const role = context.currentMembership?.legacyRole || context.currentMembership?.role;
  const normalizedRole = context.currentMembership?.role;
  if (!ADMIN_NOTIFICATION_DRAFT_ROLES.has(role) && !ADMIN_NOTIFICATION_DRAFT_ROLES.has(normalizedRole)) {
    throw new AppError(403, 'NOTIFICATION_DRAFT_PERMISSION_DENIED', 'Notification draft preview permission is required.');
  }
}

function normalizeAdminDraftFilters(searchParams) {
  rejectAdminClinicOverrideQuery(searchParams);

  const eventType = trimString(searchParams.get('eventType'), 120);
  if (eventType && !SUPPORTED_EVENT_TYPES.has(eventType)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', 'eventType is invalid.');
  }

  const channel = trimString(searchParams.get('channel'), 40);
  if (channel && !['line', 'email', 'sms'].includes(channel)) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', 'channel is invalid.');
  }

  const status = trimString(searchParams.get('status'), 40);
  if (status && status !== 'draft') {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT_QUERY', 'status is invalid.');
  }

  return {
    eventType,
    channel,
    status,
    sourceType: trimString(searchParams.get('sourceType'), 80),
    sourceId: trimString(searchParams.get('sourceId'), 160),
    limit: Math.min(asPositiveInteger(searchParams.get('limit'), 50, 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function recipientRef(recipientType, recipientId, fallback) {
  if (recipientId !== null && recipientId !== undefined) {
    return `${recipientType}:${recipientId}`;
  }
  return fallback || `${recipientType}:unresolved`;
}

function buildIdempotencyKey(draft, idempotencyScope) {
  const recipientKey = draft.recipientId === null || draft.recipientId === undefined
    ? draft.recipientRef
    : draft.recipientId;
  const scope = idempotencyScope ? `:scope:${idempotencyScope}` : '';
  return [
    `tenant:${draft.tenantId}`,
    `event:${draft.eventType}`,
    `source:${draft.sourceType}:${draft.sourceId}`,
    `recipient:${draft.recipientType}:${recipientKey}`,
    `channel:${draft.channel}${scope}`
  ].join(':');
}

function buildNotificationDraft(input) {
  const tenantId = normalizeTenantId(input.tenantId);
  const eventType = input.eventType;
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_EVENT', 'Notification event type is not supported.');
  }

  const template = renderNotificationTemplate(eventType);
  if (!template) {
    throw new AppError(500, 'NOTIFICATION_TEMPLATE_NOT_FOUND', `Template not found for event type: ${eventType}`);
  }
  const sourceType = input.sourceType || (eventType.startsWith('slot_offer.') ? 'slot_offer' : 'booking_request');
  const sourceId = normalizeSourceId(input.sourceId);
  const recipientType = input.recipientType;
  if (!recipientType) {
    throw new AppError(400, 'INVALID_NOTIFICATION_DRAFT', 'recipientType is required.');
  }
  const recipientId = input.recipientId === undefined ? null : input.recipientId;
  const recipientReference = input.recipientRef || recipientRef(recipientType, recipientId, input.recipientFallbackRef);
  const channel = input.channel || 'line';
  const metadata = sanitizeMetadata(input.metadata);

  const draft = {
    tenantId,
    eventType,
    recipientType,
    recipientId,
    recipientRef: recipientReference,
    channel,
    title: template.title,
    subject: template.subject,
    message: template.message,
    status: 'draft',
    sourceType,
    sourceId,
    idempotencyKey: null,
    metadata,
    createdAt: input.createdAt || new Date().toISOString()
  };
  draft.idempotencyKey = input.idempotencyKey || buildIdempotencyKey(draft, input.idempotencyScope);
  return draft;
}

async function insertNotificationDraft(draft, client = getPool()) {
  const result = await client.query(
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
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $12, $13::jsonb)
      on conflict (idempotency_key) do nothing
      returning *
    `,
    [
      draft.tenantId,
      draft.eventType,
      draft.recipientType,
      draft.recipientId,
      draft.recipientRef,
      draft.channel,
      draft.title,
      draft.subject,
      draft.message,
      draft.sourceType,
      draft.sourceId,
      draft.idempotencyKey,
      JSON.stringify(draft.metadata || {})
    ]
  );

  if (result.rowCount > 0) {
    return {
      draft: mapNotificationDraftRow(result.rows[0]),
      created: true
    };
  }

  const existingResult = await client.query(
    'select * from notification_drafts where idempotency_key = $1 limit 1',
    [draft.idempotencyKey]
  );
  return {
    draft: mapNotificationDraftRow(existingResult.rows[0]),
    created: false
  };
}

async function createNotificationDraft(input, client = getPool()) {
  return insertNotificationDraft(buildNotificationDraft(input), client);
}

async function loadSlotOfferDraftContext(client, tenantId, sourceId) {
  const result = await client.query(
    `
      select
        o.id,
        o.booking_request_id,
        o.lead_id,
        o.member_id,
        o.offered_date,
        o.offered_time_window,
        o.offered_start_time,
        o.duration_minutes,
        o.offer_status,
        o.customer_response,
        o.created_by_user_id,
        o.updated_by_user_id,
        br.lead_id as booking_lead_id,
        br.member_id as booking_member_id,
        br.email as booking_request_email,
        br.preferred_contact_method,
        br.status as booking_status,
        m.id as tenant_member_id,
        m.email as member_email,
        l.id as tenant_lead_id,
        l.email as lead_email
      from clinic_booking_slot_offers o
      inner join clinic_booking_requests br
        on br.clinic_id = o.clinic_id
        and br.id = o.booking_request_id
      left join clinic_members m
        on m.clinic_id = o.clinic_id
        and m.id = coalesce(o.member_id, br.member_id)
      left join leads l
        on l.clinic_id = o.clinic_id
        and l.id = coalesce(o.lead_id, br.lead_id)
      where o.clinic_id = $1 and o.id = $2::bigint
      limit 1
    `,
    [tenantId, sourceId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'SLOT_OFFER_NOT_FOUND', 'Slot offer not found.');
  }

  return result.rows[0];
}

async function loadBookingRequestDraftContext(client, tenantId, sourceId) {
  const result = await client.query(
    `
      select id, lead_id, member_id, preferred_contact_method, status, slot_status
      from clinic_booking_requests
      where clinic_id = $1 and id = $2::bigint
      limit 1
    `,
    [tenantId, sourceId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found.');
  }

  return result.rows[0];
}

function customerRecipientFromRow(row) {
  if (row.member_id) {
    return {
      recipientType: 'member',
      recipientId: Number(row.member_id),
      recipientRef: recipientRef('member', row.member_id),
      channel: channelForContactMethod(row.preferred_contact_method)
    };
  }

  if (row.lead_id) {
    return {
      recipientType: 'lead',
      recipientId: Number(row.lead_id),
      recipientRef: recipientRef('lead', row.lead_id),
      channel: channelForContactMethod(row.preferred_contact_method)
    };
  }

  return {
    recipientType: 'booking_request',
    recipientId: Number(row.booking_request_id || row.id),
    recipientRef: recipientRef('booking_request', row.booking_request_id || row.id),
    channel: channelForContactMethod(row.preferred_contact_method)
  };
}

function safeFallbackChannelForSlotOffer(row) {
  const channel = channelForContactMethod(row.preferred_contact_method);
  return channel === 'email' ? 'line' : channel;
}

function customerLogicalRecipientFromSlotOfferRow(row) {
  if (row.tenant_member_id) {
    return {
      recipientType: 'member',
      recipientId: Number(row.tenant_member_id),
      recipientRef: recipientRef('member', row.tenant_member_id),
      channel: safeFallbackChannelForSlotOffer(row)
    };
  }

  if (row.tenant_lead_id) {
    return {
      recipientType: 'lead',
      recipientId: Number(row.tenant_lead_id),
      recipientRef: recipientRef('lead', row.tenant_lead_id),
      channel: safeFallbackChannelForSlotOffer(row)
    };
  }

  return {
    recipientType: 'booking_request',
    recipientId: Number(row.booking_request_id),
    recipientRef: recipientRef('booking_request', row.booking_request_id),
    channel: safeFallbackChannelForSlotOffer(row)
  };
}

function customerRecipientFromSlotOfferSent(row) {
  const candidates = [
    {
      recipientSource: 'member',
      recipientType: 'member',
      recipientId: row.tenant_member_id,
      email: row.member_email
    },
    {
      recipientSource: 'lead',
      recipientType: 'lead',
      recipientId: row.tenant_lead_id,
      email: row.lead_email
    },
    {
      recipientSource: 'booking_request',
      recipientType: 'booking_request',
      recipientId: row.booking_request_id,
      email: row.booking_request_email
    }
  ];

  for (const candidate of candidates) {
    const email = normalizeNotificationEmail(candidate.email);
    if (!candidate.recipientId || !email) {
      continue;
    }

    return {
      recipientType: candidate.recipientType,
      recipientId: Number(candidate.recipientId),
      recipientRef: email,
      channel: 'email',
      metadataPatch: {
        recipientEmailAvailable: true,
        recipientSource: candidate.recipientSource
      }
    };
  }

  return {
    ...customerLogicalRecipientFromSlotOfferRow(row),
    metadataPatch: {
      recipientEmailAvailable: false,
      recipientSource: 'fallback'
    }
  };
}

function adminRecipientFromSlotOffer(row, tenantId) {
  const adminId = row.created_by_user_id || row.updated_by_user_id || null;
  return {
    recipientType: 'admin',
    recipientId: adminId ? Number(adminId) : null,
    recipientRef: adminId ? recipientRef('admin', adminId) : `clinic:${tenantId}:admins`,
    channel: 'email'
  };
}

async function createNotificationDraftForEvent(input, client = getPool()) {
  const tenantId = normalizeTenantId(input.tenantId);
  const sourceId = normalizeSourceId(input.sourceId);

  if (input.eventType === 'slot_offer.sent') {
    const row = await loadSlotOfferDraftContext(client, tenantId, sourceId);
    const { metadataPatch, ...recipient } = customerRecipientFromSlotOfferSent(row);
    return createNotificationDraft({
      tenantId,
      eventType: input.eventType,
      sourceType: 'slot_offer',
      sourceId,
      ...recipient,
      metadata: {
        bookingRequestId: Number(row.booking_request_id),
        offerId: Number(row.id),
        offerStatus: row.offer_status,
        offeredDate: formatDateOnly(row.offered_date),
        offeredTimeWindow: row.offered_time_window,
        offeredStartTimeProvided: Boolean(row.offered_start_time),
        durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
        ...metadataPatch
      }
    }, client);
  }

  if (input.eventType === 'slot_offer.accepted' || input.eventType === 'slot_offer.declined') {
    const row = await loadSlotOfferDraftContext(client, tenantId, sourceId);
    const recipient = adminRecipientFromSlotOffer(row, tenantId);
    return createNotificationDraft({
      tenantId,
      eventType: input.eventType,
      sourceType: 'slot_offer',
      sourceId,
      ...recipient,
      metadata: {
        bookingRequestId: Number(row.booking_request_id),
        offerId: Number(row.id),
        memberId: row.member_id ? Number(row.member_id) : null,
        leadId: row.lead_id ? Number(row.lead_id) : null,
        response: input.eventType === 'slot_offer.accepted' ? 'accepted' : 'declined'
      }
    }, client);
  }

  if (input.eventType === 'booking_request.status_changed') {
    const row = await loadBookingRequestDraftContext(client, tenantId, sourceId);
    const recipient = customerRecipientFromRow(row);
    const fromStatus = input.metadata?.fromStatus || null;
    const toStatus = input.metadata?.toStatus || row.status;
    return createNotificationDraft({
      tenantId,
      eventType: input.eventType,
      sourceType: 'booking_request',
      sourceId,
      ...recipient,
      idempotencyScope: `${fromStatus || 'unknown'}->${toStatus || 'unknown'}`,
      metadata: {
        bookingRequestId: Number(row.id),
        leadId: row.lead_id ? Number(row.lead_id) : null,
        memberId: row.member_id ? Number(row.member_id) : null,
        fromStatus,
        toStatus,
        slotStatus: row.slot_status || null
      }
    }, client);
  }

  throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_EVENT', 'Notification event type is not supported.');
}

async function listAdminNotificationDrafts(context, searchParams = new URLSearchParams(), client = getPool()) {
  assertAdminNotificationPreviewContext(context);
  const filters = normalizeAdminDraftFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['d.clinic_id = $1'];

  if (filters.eventType) {
    values.push(filters.eventType);
    clauses.push(`d.event_type = $${values.length}`);
  }

  if (filters.channel) {
    values.push(filters.channel);
    clauses.push(`d.channel = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`d.status = $${values.length}`);
  }

  if (filters.sourceType) {
    values.push(filters.sourceType);
    clauses.push(`d.source_type = $${values.length}`);
  }

  if (filters.sourceId) {
    values.push(filters.sourceId);
    clauses.push(`d.source_id = $${values.length}`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await client.query(
    `
      select *, count(*) over()::int as total_count
      from (
        select
          d.*,
          ar.id as approval_request_id,
          ar.clinic_id as approval_clinic_id,
          ar.draft_id as approval_draft_id,
          ar.status as approval_status,
          ar.requested_by_user_id as approval_requested_by_user_id,
          ar.decided_by_user_id as approval_decided_by_user_id,
          ar.requested_note as approval_requested_note,
          ar.decision_note as approval_decision_note,
          ar.idempotency_key as approval_idempotency_key,
          ar.requested_at as approval_requested_at,
          ar.decided_at as approval_decided_at,
          ar.created_at as approval_created_at,
          ar.updated_at as approval_updated_at
        from notification_drafts d
        left join lateral (
          select *
          from notification_approval_requests
          where clinic_id = d.clinic_id and draft_id = d.id
          order by created_at desc, id desc
          limit 1
        ) ar on true
        where ${clauses.join(' and ')}
      ) drafts_with_approval
      order by created_at desc, id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map((row) => mapNotificationDraftRow(row)),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function getAdminNotificationDraft(context, draftId, client = getPool()) {
  assertAdminNotificationPreviewContext(context);
  const normalizedId = asPositiveInteger(draftId, null, 'draftId');
  const result = await client.query(
    `
      select
        d.*,
        ar.id as approval_request_id,
        ar.clinic_id as approval_clinic_id,
        ar.draft_id as approval_draft_id,
        ar.status as approval_status,
        ar.requested_by_user_id as approval_requested_by_user_id,
        ar.decided_by_user_id as approval_decided_by_user_id,
        ar.requested_note as approval_requested_note,
        ar.decision_note as approval_decision_note,
        ar.idempotency_key as approval_idempotency_key,
        ar.requested_at as approval_requested_at,
        ar.decided_at as approval_decided_at,
        ar.created_at as approval_created_at,
        ar.updated_at as approval_updated_at
      from notification_drafts d
      left join lateral (
        select *
        from notification_approval_requests
        where clinic_id = d.clinic_id and draft_id = d.id
        order by created_at desc, id desc
        limit 1
      ) ar on true
      where d.clinic_id = $1 and d.id = $2
      limit 1
    `,
    [context.currentClinic.id, normalizedId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'NOTIFICATION_DRAFT_NOT_FOUND', 'Notification draft not found.');
  }

  return mapNotificationDraftRow(result.rows[0]);
}

module.exports = {
  SUPPORTED_EVENT_TYPES,
  assertAdminNotificationPreviewContext,
  buildNotificationDraft,
  buildIdempotencyKey,
  createNotificationDraft,
  createNotificationDraftForEvent,
  listAdminNotificationDrafts,
  getAdminNotificationDraft,
  channelForContactMethod,
  isValidNotificationEmail,
  sanitizeMetadata
};
