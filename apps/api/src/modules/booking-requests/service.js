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
const VALID_BOOKING_STATUSES = new Set(['new', 'contacted', 'confirmed', 'cancelled', 'closed']);
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

function rejectAdminClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_PAYLOAD', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden for booking requests.');
  }
}

function rejectAdminClinicOverrideQuery(searchParams) {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden in the query string.');
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

function asPositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function asNonNegativeInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function normalizeBookingStatus(value) {
  const normalized = trimString(value, 40);
  if (!normalized || !VALID_BOOKING_STATUSES.has(normalized)) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_STATUS', 'status is invalid.');
  }
  return normalized;
}

function normalizeDateBoundary(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a date or timestamp.`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
      throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a valid date.`);
    }
    if (options.endExclusive) {
      parsed.setUTCDate(parsed.getUTCDate() + 1);
    }
    return parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a valid date or timestamp.`);
  }
  return parsed.toISOString();
}

function normalizeAdminFilters(searchParams) {
  rejectAdminClinicOverrideQuery(searchParams);

  const requestType = trimString(searchParams.get('requestType'), 40);
  if (requestType && !VALID_REQUEST_TYPES.has(requestType)) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_PAYLOAD', 'requestType is invalid.');
  }

  const interestType = trimString(searchParams.get('interestType'), 40);
  if (interestType && !VALID_INTEREST_TYPES.has(interestType)) {
    throw new AppError(400, 'INVALID_BOOKING_INTEREST', 'interestType is invalid.');
  }

  const status = trimString(searchParams.get('status'), 40);
  if (status && !VALID_BOOKING_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_STATUS', 'status is invalid.');
  }

  return {
    status,
    requestType,
    interestType,
    dateFrom: normalizeDateBoundary(searchParams.get('dateFrom'), 'dateFrom'),
    dateTo: normalizeDateBoundary(searchParams.get('dateTo'), 'dateTo', { endExclusive: true }),
    q: trimString(searchParams.get('q'), 120),
    limit: Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapBookingRequestRow(row, options = {}) {
  const lead = row.lead_id
    ? {
        id: Number(row.lead_id),
        name: row.lead_full_name || null,
        fullName: row.lead_full_name || null,
        phone: row.lead_phone || null,
        email: row.lead_email || null,
        status: row.lead_status || null,
        stage: row.lead_stage || null,
        ownerUserId: row.lead_owner_user_id || null,
        ownerName: row.lead_owner_name || null
      }
    : null;

  return {
    id: Number(row.id),
    leadId: row.lead_id ? Number(row.lead_id) : null,
    lead,
    requestType: row.request_type,
    interestType: row.interest_type,
    interestId: row.interest_id ? Number(row.interest_id) : null,
    preferredDate: formatDateOnly(row.preferred_date),
    preferredTimeWindow: row.preferred_time_window || null,
    preferredContactMethod: row.preferred_contact_method || null,
    customerName: row.customer_name || null,
    phone: row.phone || null,
    email: row.email || null,
    lineId: row.line_id || null,
    message: options.includeMessage ? row.message || null : undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: options.notes || undefined
  };
}

function assertAdminContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function normalizeBookingNotePayload(body) {
  rejectAdminClinicOverride(body);
  if (typeof body.note !== 'string') {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_NOTE', 'note is required.');
  }

  const note = body.note.trim();
  if (!note || note.length > 1000) {
    throw new AppError(400, 'INVALID_BOOKING_REQUEST_NOTE', 'note must be between 1 and 1000 characters.');
  }

  return { note };
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

async function listAdminBookingRequests(context, searchParams) {
  assertAdminContext(context);
  const filters = normalizeAdminFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['br.clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`br.status = $${values.length}`);
  }

  if (filters.requestType) {
    values.push(filters.requestType);
    clauses.push(`br.request_type = $${values.length}`);
  }

  if (filters.interestType) {
    values.push(filters.interestType);
    clauses.push(`br.interest_type = $${values.length}`);
  }

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    clauses.push(`br.created_at >= $${values.length}`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    clauses.push(`br.created_at < $${values.length}`);
  }

  if (filters.q) {
    values.push(`%${filters.q.toLowerCase()}%`);
    clauses.push(`(
      lower(coalesce(br.customer_name, '')) like $${values.length}
      or lower(coalesce(br.phone, '')) like $${values.length}
      or lower(coalesce(br.email, '')) like $${values.length}
      or lower(coalesce(br.line_id, '')) like $${values.length}
      or lower(coalesce(l.full_name, '')) like $${values.length}
    )`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await getPool().query(
    `
      select
        br.*,
        l.full_name as lead_full_name,
        l.phone as lead_phone,
        l.email as lead_email,
        l.status as lead_status,
        l.stage as lead_stage,
        l.owner_user_id as lead_owner_user_id,
        u.name as lead_owner_name,
        count(*) over()::int as total_count
      from clinic_booking_requests br
      left join leads l on l.clinic_id = br.clinic_id and l.id = br.lead_id
      left join users u on u.id = l.owner_user_id
      where ${clauses.join(' and ')}
      order by br.created_at desc, br.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map((row) => mapBookingRequestRow(row)),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function getAdminBookingRequestDetail(context, bookingRequestId, client = getPool()) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(bookingRequestId, 'bookingRequestId');
  const result = await client.query(
    `
      select
        br.*,
        l.full_name as lead_full_name,
        l.phone as lead_phone,
        l.email as lead_email,
        l.status as lead_status,
        l.stage as lead_stage,
        l.owner_user_id as lead_owner_user_id,
        u.name as lead_owner_name
      from clinic_booking_requests br
      left join leads l on l.clinic_id = br.clinic_id and l.id = br.lead_id
      left join users u on u.id = l.owner_user_id
      where br.clinic_id = $1 and br.id = $2
      limit 1
    `,
    [context.currentClinic.id, normalizedId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found.');
  }

  const row = result.rows[0];
  let notes = [];

  if (row.lead_id) {
    const notesResult = await client.query(
      `
        select
          ln.id,
          ln.note_type,
          ln.content,
          ln.created_at,
          ln.updated_at,
          u.id as author_user_id,
          u.name as author_name
        from lead_notes ln
        left join users u on u.id = ln.author_user_id
        where ln.clinic_id = $1
          and ln.lead_id = $2
          and ln.note_type = 'booking_request_internal'
        order by ln.created_at asc, ln.id asc
      `,
      [context.currentClinic.id, row.lead_id]
    );

    notes = notesResult.rows.map((noteRow) => ({
      id: Number(noteRow.id),
      noteType: noteRow.note_type,
      content: noteRow.content,
      authorUserId: noteRow.author_user_id || null,
      authorName: noteRow.author_name || null,
      createdAt: noteRow.created_at,
      updatedAt: noteRow.updated_at
    }));
  }

  return mapBookingRequestRow(row, { includeMessage: true, notes });
}

async function updateAdminBookingRequestStatus(context, bookingRequestId, body) {
  assertAdminContext(context);
  rejectAdminClinicOverride(body);
  const normalizedId = asPositiveInteger(bookingRequestId, 'bookingRequestId');
  const nextStatus = normalizeBookingStatus(body.status);
  const client = await getPool().connect();
  let committed = false;

  try {
    await client.query('begin');
    const existingResult = await client.query(
      `
        select id, clinic_id, lead_id, status
        from clinic_booking_requests
        where clinic_id = $1 and id = $2
        for update
      `,
      [context.currentClinic.id, normalizedId]
    );

    if (existingResult.rowCount === 0) {
      throw new AppError(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found.');
    }

    const existing = existingResult.rows[0];
    const updateResult = await client.query(
      `
        update clinic_booking_requests
        set status = $3,
            updated_at = now()
        where clinic_id = $1 and id = $2
        returning id, lead_id, status
      `,
      [context.currentClinic.id, normalizedId, nextStatus]
    );

    if (updateResult.rowCount === 0) {
      throw new AppError(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found.');
    }

    const summary = {
      source: 'admin_booking_request_queue',
      bookingRequestId: normalizedId,
      leadId: existing.lead_id ? Number(existing.lead_id) : null,
      fromStatus: existing.status,
      toStatus: nextStatus,
      changedFields: ['status']
    };

    if (existing.lead_id) {
      await client.query(
        `
          insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
          values ($1, $2, 'booking_request.status_changed', $3::jsonb)
        `,
        [context.currentClinic.id, existing.lead_id, JSON.stringify({ summary })]
      );
    }

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'clinic_booking_request',
        entityId: normalizedId,
        actionType: 'clinic_booking_request.status_changed',
        actorUserId: context.currentUser?.id || null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    committed = true;
  } catch (error) {
    if (!committed) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }

  return {
    success: true,
    item: await getAdminBookingRequestDetail(context, normalizedId)
  };
}

async function addAdminBookingRequestNote(context, bookingRequestId, body) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(bookingRequestId, 'bookingRequestId');
  const normalized = normalizeBookingNotePayload(body);
  const client = await getPool().connect();
  let committed = false;
  let noteId = null;

  try {
    await client.query('begin');
    const existingResult = await client.query(
      `
        select id, lead_id
        from clinic_booking_requests
        where clinic_id = $1 and id = $2
        for update
      `,
      [context.currentClinic.id, normalizedId]
    );

    if (existingResult.rowCount === 0) {
      throw new AppError(404, 'BOOKING_REQUEST_NOT_FOUND', 'Booking request not found.');
    }

    const existing = existingResult.rows[0];
    if (!existing.lead_id) {
      throw new AppError(400, 'INVALID_BOOKING_REQUEST_NOTE', 'Booking request is not linked to a lead.');
    }

    const noteResult = await client.query(
      `
        insert into lead_notes (clinic_id, lead_id, author_user_id, note_type, content)
        values ($1, $2, $3, 'booking_request_internal', $4)
        returning id
      `,
      [context.currentClinic.id, existing.lead_id, context.currentUser?.id || null, normalized.note]
    );
    noteId = Number(noteResult.rows[0].id);

    await client.query(
      `
        insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
        values ($1, 'lead', $2, $3, 'booking_request_internal', $4)
      `,
      [context.currentClinic.id, existing.lead_id, context.currentUser?.id || null, normalized.note]
    );

    const summary = {
      source: 'admin_booking_request_queue',
      bookingRequestId: normalizedId,
      leadId: Number(existing.lead_id),
      noteProvided: true
    };

    await client.query(
      `
        insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
        values ($1, $2, 'booking_request.note_added', $3::jsonb)
      `,
      [context.currentClinic.id, existing.lead_id, JSON.stringify({ summary })]
    );

    await recordAuditLog(
      {
        clinicId: context.currentClinic.id,
        entityType: 'clinic_booking_request',
        entityId: normalizedId,
        actionType: 'clinic_booking_request.note_added',
        actorUserId: context.currentUser?.id || null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    committed = true;
  } catch (error) {
    if (!committed) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }

  return {
    success: true,
    noteId,
    item: await getAdminBookingRequestDetail(context, normalizedId)
  };
}

module.exports = {
  createPublicBookingRequest,
  validateBookingRequestPayload,
  listAdminBookingRequests,
  getAdminBookingRequestDetail,
  updateAdminBookingRequestStatus,
  addAdminBookingRequestNote,
  normalizeAdminFilters,
  normalizeBookingNotePayload
};
