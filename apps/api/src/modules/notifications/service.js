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

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((metadata, [key, entryValue]) => {
    if (UNSAFE_METADATA_KEYS.has(key)) {
      return metadata;
    }

    if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
      metadata[key] = sanitizeMetadata(entryValue);
      return metadata;
    }

    if (Array.isArray(entryValue)) {
      metadata[key] = entryValue.map((item) => (
        item && typeof item === 'object' && !Array.isArray(item) ? sanitizeMetadata(item) : item
      ));
      return metadata;
    }

    metadata[key] = entryValue;
    return metadata;
  }, {});
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
        br.preferred_contact_method,
        br.status as booking_status
      from clinic_booking_slot_offers o
      inner join clinic_booking_requests br
        on br.clinic_id = o.clinic_id
        and br.id = o.booking_request_id
      where o.clinic_id = $1 and o.id = $2
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
      where clinic_id = $1 and id = $2
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
    const recipient = customerRecipientFromRow(row);
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
        offeredDate: row.offered_date ? String(row.offered_date).slice(0, 10) : null,
        offeredTimeWindow: row.offered_time_window,
        offeredStartTimeProvided: Boolean(row.offered_start_time),
        durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes)
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

module.exports = {
  SUPPORTED_EVENT_TYPES,
  buildNotificationDraft,
  buildIdempotencyKey,
  createNotificationDraft,
  createNotificationDraftForEvent,
  channelForContactMethod,
  sanitizeMetadata
};
