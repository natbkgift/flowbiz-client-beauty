'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { resolvePublicClinicBySlug } = require('../public-content/clinic-resolver');

const VALID_REQUEST_TYPES = new Set(['consultation', 'booking_request', 'follow_up']);
const VALID_INTEREST_TYPES = new Set(['service', 'promotion', 'package', 'general']);
const VALID_TIME_WINDOWS = new Set(['morning', 'afternoon', 'evening', 'anytime']);
const VALID_CONTACT_METHODS = new Set(['phone', 'line', 'email', 'any']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimString(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_PAYLOAD', 'Expected string field.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function rejectClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_PAYLOAD', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_PAYLOAD', 'clinicId cannot be supplied for public booking requests.');
  }
}

function normalizeEnum(value, allowed, fallback, code, fieldName) {
  const normalized = trimString(value, 40) || fallback;
  if (!allowed.has(normalized)) {
    throw new AppError(400, code, `${fieldName} is invalid.`);
  }
  return normalized;
}

function normalizeInterestId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_BOOKING_INTEREST', 'interestId must be a positive integer.');
  }
  return parsed;
}

function todayDateString() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizePreferredDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_BOOKING_DATE', 'preferredDate must be a valid date.');
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new AppError(400, 'INVALID_BOOKING_DATE', 'preferredDate must be YYYY-MM-DD.');
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new AppError(400, 'INVALID_BOOKING_DATE', 'preferredDate must be a valid date.');
  }
  if (trimmed < todayDateString()) {
    throw new AppError(400, 'INVALID_BOOKING_DATE', 'preferredDate cannot be in the past.');
  }
  return trimmed;
}

function validateBookingRequestPayload(body) {
  rejectClinicOverride(body);

  const honeypot = trimString(body.honeypot, 200);
  if (honeypot) {
    return { isBot: true };
  }

  if (body.consentAccepted !== true) {
    throw new AppError(400, 'BOOKING_CONSENT_REQUIRED', 'consentAccepted must be true.');
  }

  const name = trimString(body.name, 120);
  const phone = trimString(body.phone, 40);
  const email = trimString(body.email, 160);
  const lineId = trimString(body.lineId, 80);
  const message = trimString(body.message, 1000);

  if (!phone && !email && !lineId) {
    throw new AppError(400, 'BOOKING_CONTACT_REQUIRED', 'At least one contact method is required.');
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'INVALID_BOOKING_EMAIL', 'Invalid email format.');
  }

  return {
    isBot: false,
    name,
    phone,
    email,
    lineId,
    message,
    requestType: normalizeEnum(body.requestType, VALID_REQUEST_TYPES, 'consultation', 'INVALID_BOOKING_REQUEST_PAYLOAD', 'requestType'),
    interestType: normalizeEnum(body.interestType, VALID_INTEREST_TYPES, 'general', 'INVALID_BOOKING_INTEREST', 'interestType'),
    interestId: normalizeInterestId(body.interestId),
    preferredDate: normalizePreferredDate(body.preferredDate),
    preferredTimeWindow: body.preferredTimeWindow === undefined || body.preferredTimeWindow === null || body.preferredTimeWindow === ''
      ? null
      : normalizeEnum(body.preferredTimeWindow, VALID_TIME_WINDOWS, null, 'INVALID_BOOKING_TIME_WINDOW', 'preferredTimeWindow'),
    preferredContactMethod: body.preferredContactMethod === undefined || body.preferredContactMethod === null || body.preferredContactMethod === ''
      ? null
      : normalizeEnum(body.preferredContactMethod, VALID_CONTACT_METHODS, null, 'INVALID_BOOKING_CONTACT_METHOD', 'preferredContactMethod')
  };
}

async function resolveActivePublicClinic(slug) {
  const clinic = await resolvePublicClinicBySlug(slug);
  if (!clinic || clinic.status !== 'active') {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }
  return {
    id: Number(clinic.id),
    name: clinic.name,
    slug: clinic.slug
  };
}

async function ensurePublicLeadScope(client, clinic) {
  const organizationResult = await client.query(
    `
      insert into organizations (clinic_id, name, slug, status)
      values ($1, $2, $3, 'active')
      on conflict (clinic_id)
      do update set name = excluded.name, updated_at = now()
      returning id
    `,
    [clinic.id, `${clinic.name} Organization`, `${clinic.slug}-organization-${clinic.id}`]
  );

  const organizationId = Number(organizationResult.rows[0].id);
  const workspaceResult = await client.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, 'Main Workspace', 'main-workspace', 'active')
      on conflict (clinic_id, slug)
      do update set organization_id = excluded.organization_id, updated_at = now()
      returning id
    `,
    [clinic.id, organizationId]
  );

  return {
    clinicId: clinic.id,
    organizationId,
    workspaceId: Number(workspaceResult.rows[0].id)
  };
}

async function resolveInterest(client, clinicId, payload) {
  if (payload.interestType === 'general') {
    return {
      interestType: 'general',
      interestId: null,
      interestName: 'General consultation'
    };
  }

  if (!payload.interestId) {
    return {
      interestType: payload.interestType,
      interestId: null,
      interestName: `${payload.interestType} booking request`
    };
  }

  const tableByType = {
    service: { table: 'clinic_services', nameColumn: 'name' },
    promotion: { table: 'clinic_promotions', nameColumn: 'title' },
    package: { table: 'clinic_packages', nameColumn: 'name' }
  };
  const mapping = tableByType[payload.interestType];
  const result = await client.query(
    `
      select id, ${mapping.nameColumn} as name
      from ${mapping.table}
      where clinic_id = $1 and id = $2 and status = 'active'
      limit 1
    `,
    [clinicId, payload.interestId]
  );

  if (result.rowCount === 0) {
    throw new AppError(400, 'INVALID_BOOKING_INTEREST', 'Interest item is not available for this clinic.');
  }

  return {
    interestType: payload.interestType,
    interestId: payload.interestId,
    interestName: result.rows[0].name
  };
}

function buildNotesSummary(payload, interest) {
  const parts = [
    'Public clinic website booking request',
    `request_type=${payload.requestType}`,
    `interest=${interest.interestType}${interest.interestId ? `:${interest.interestId}` : ''}`
  ];
  if (payload.preferredDate) parts.push('preferred_date_provided=true');
  if (payload.preferredTimeWindow) parts.push(`preferred_time_window=${payload.preferredTimeWindow}`);
  if (payload.preferredContactMethod) parts.push(`preferred_contact_method=${payload.preferredContactMethod}`);
  if (payload.message) parts.push('message_provided=true');
  return parts.join('\n').slice(0, 2000);
}

async function findReusableLead(client, scope, payload) {
  const clauses = [];
  const values = [scope.clinicId, scope.workspaceId];

  for (const [columnName, value] of [
    ['email', payload.email],
    ['phone', payload.phone],
    ['line_user_id', payload.lineId]
  ]) {
    if (value) {
      values.push(value);
      clauses.push(`${columnName} = $${values.length}`);
    }
  }

  if (clauses.length === 0) return null;

  const result = await client.query(
    `
      select id
      from leads
      where clinic_id = $1
        and workspace_id = $2
        and (${clauses.join(' or ')})
      order by updated_at desc, id desc
      limit 1
    `,
    values
  );

  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function createLeadForBooking(client, scope, payload, interest) {
  const existingLeadId = await findReusableLead(client, scope, payload);
  if (existingLeadId) {
    await client.query(
      'update leads set updated_at = now(), notes_summary = $3 where clinic_id = $1 and id = $2',
      [scope.clinicId, existingLeadId, buildNotesSummary(payload, interest)]
    );
    await client.query(
      `
        insert into lead_interests (
          clinic_id,
          lead_id,
          interest_type,
          interest_name,
          priority,
          urgency
        )
        values ($1, $2, $3, $4, 1, 'new')
      `,
      [scope.clinicId, existingLeadId, interest.interestType, interest.interestName]
    );
    return { leadId: existingLeadId, created: false };
  }

  const displayName = payload.name || 'ไม่ระบุชื่อ';
  const sourceRef = `booking:${Date.now()}:${randomUUID()}`;
  const leadResult = await client.query(
    `
      insert into leads (
        clinic_id,
        organization_id,
        workspace_id,
        source,
        source_ref,
        full_name,
        phone,
        line_user_id,
        email,
        status,
        stage,
        notes_summary
      )
      values ($1, $2, $3, 'website', $4, $5, $6, $7, $8, 'new', 'inquiry', $9)
      returning id
    `,
    [
      scope.clinicId,
      scope.organizationId,
      scope.workspaceId,
      sourceRef,
      displayName,
      payload.phone,
      payload.lineId,
      payload.email,
      buildNotesSummary(payload, interest)
    ]
  );

  const leadId = Number(leadResult.rows[0].id);
  await client.query(
    `
      insert into lead_interests (
        clinic_id,
        lead_id,
        interest_type,
        interest_name,
        priority,
        urgency
      )
      values ($1, $2, $3, $4, 1, 'new')
    `,
    [scope.clinicId, leadId, interest.interestType, interest.interestName]
  );

  return { leadId, created: true };
}

async function createPublicBookingRequest(slug, body) {
  const normalized = validateBookingRequestPayload(body);
  if (normalized.isBot) {
    return {
      success: true,
      botAccepted: true,
      message: 'ขอบคุณค่ะ'
    };
  }

  const clinic = await resolveActivePublicClinic(slug);
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const scope = await ensurePublicLeadScope(client, clinic);
    const interest = await resolveInterest(client, scope.clinicId, normalized);
    const leadLink = await createLeadForBooking(client, scope, normalized, interest);

    if (normalized.message) {
      await client.query(
        `
          insert into lead_notes (clinic_id, lead_id, author_user_id, note_type, content)
          values ($1, $2, null, 'public_booking_request_message', $3)
        `,
        [scope.clinicId, leadLink.leadId, normalized.message]
      );
      await client.query(
        `
          insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
          values ($1, 'lead', $2, null, 'public_booking_request_message', $3)
        `,
        [scope.clinicId, leadLink.leadId, normalized.message]
      );
    }

    const requestResult = await client.query(
      `
        insert into clinic_booking_requests (
          clinic_id,
          lead_id,
          request_type,
          interest_type,
          interest_id,
          preferred_date,
          preferred_time_window,
          preferred_contact_method,
          customer_name,
          phone,
          email,
          line_id,
          message,
          metadata_json
        )
        values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
        returning id
      `,
      [
        scope.clinicId,
        leadLink.leadId,
        normalized.requestType,
        interest.interestType,
        interest.interestId,
        normalized.preferredDate,
        normalized.preferredTimeWindow,
        normalized.preferredContactMethod,
        normalized.name,
        normalized.phone,
        normalized.email,
        normalized.lineId,
        normalized.message,
        JSON.stringify({
          source: 'public_booking_request',
          leadCreated: leadLink.created
        })
      ]
    );

    const bookingRequestId = Number(requestResult.rows[0].id);
    const summary = {
      source: 'public_booking_request',
      clinicId: scope.clinicId,
      bookingRequestId,
      leadId: leadLink.leadId,
      leadCreated: leadLink.created,
      requestType: normalized.requestType,
      interestType: interest.interestType,
      interestId: interest.interestId,
      preferredDateProvided: Boolean(normalized.preferredDate),
      preferredTimeWindow: normalized.preferredTimeWindow,
      preferredContactMethod: normalized.preferredContactMethod,
      hasPhone: Boolean(normalized.phone),
      hasEmail: Boolean(normalized.email),
      hasLineId: Boolean(normalized.lineId),
      messageProvided: Boolean(normalized.message)
    };

    await client.query(
      `
        insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
        values ($1, $2, 'booking_request.created', $3::jsonb)
      `,
      [scope.clinicId, leadLink.leadId, JSON.stringify({ summary })]
    );

    await recordAuditLog(
      {
        clinicId: scope.clinicId,
        entityType: 'clinic_booking_request',
        entityId: bookingRequestId,
        actionType: 'clinic_booking_request.created',
        actorUserId: null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');

    return {
      success: true,
      bookingRequestId,
      leadId: leadLink.leadId,
      message: 'รับคำขอนัดหมายแล้วค่ะ ทีมงานจะติดต่อกลับเพื่อยืนยันเวลา'
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createPublicBookingRequest,
  validateBookingRequestPayload
};
