'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

const VALID_MEMBER_STATUSES = new Set(['active', 'inactive', 'blocked', 'merged']);
const VALID_MEMBER_SOURCES = new Set(['public_lead_capture', 'public_booking_request', 'admin_import', 'manual']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimString(value, maxLength, code = 'INVALID_MEMBER_PAYLOAD') {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, code, 'Expected string field.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
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

function assertPlainObject(value, code, fieldName) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, code, `${fieldName} must be a JSON object.`);
  }
  return value;
}

function assertAdminContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function rejectClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'clinicId cannot be overridden for members.');
  }
}

function rejectClinicOverrideQuery(searchParams) {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'clinicId cannot be overridden in the query string.');
  }
}

function escapeLikePattern(value) {
  return value.replace(/[%_\\]/g, '\\$&');
}

function normalizePublicMemberPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'Member payload must be a JSON object.');
  }

  const clinicId = Number.parseInt(input.clinicId, 10);
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'clinicId is required.');
  }

  const displayName = trimString(input.name ?? input.displayName, 160);
  const phone = trimString(input.phone, 40);
  const email = trimString(input.email, 160)?.toLowerCase() || null;
  const lineId = trimString(input.lineId, 80);
  const source = trimString(input.source, 80) || 'public_lead_capture';
  const consentSummary = assertPlainObject(input.consentSummary, 'INVALID_MEMBER_PAYLOAD', 'consentSummary');

  if (!phone && !email && !lineId) {
    throw new AppError(400, 'MEMBER_CONTACT_REQUIRED', 'At least one member contact method is required.');
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'INVALID_MEMBER_EMAIL', 'Invalid email format.');
  }

  if (!VALID_MEMBER_SOURCES.has(source)) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'Invalid member source.');
  }

  return {
    clinicId,
    customerId: input.customerId ? asPositiveInteger(input.customerId, 'customerId') : null,
    leadId: input.leadId ? asPositiveInteger(input.leadId, 'leadId') : null,
    bookingRequestId: input.bookingRequestId ? asPositiveInteger(input.bookingRequestId, 'bookingRequestId') : null,
    displayName,
    phone,
    email,
    lineId,
    source,
    consentSummary
  };
}

function normalizeAdminFilters(searchParams) {
  rejectClinicOverrideQuery(searchParams);
  const status = trimString(searchParams.get('status'), 40);
  if (status && !VALID_MEMBER_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_MEMBER_STATUS', 'status is invalid.');
  }

  return {
    q: trimString(searchParams.get('q'), 120),
    status,
    limit: Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function normalizeAdminUpdatePayload(body) {
  rejectClinicOverride(body);

  for (const forbiddenField of ['phone', 'email', 'lineId', 'line_id']) {
    if (body[forbiddenField] !== undefined) {
      throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'Member contact fields cannot be updated in this PR.');
    }
  }

  const normalized = {};
  if (body.displayName !== undefined) {
    normalized.displayName = trimString(body.displayName, 160, 'INVALID_MEMBER_PAYLOAD');
  }
  if (body.status !== undefined) {
    const status = trimString(body.status, 40, 'INVALID_MEMBER_STATUS');
    if (!status || !VALID_MEMBER_STATUSES.has(status)) {
      throw new AppError(400, 'INVALID_MEMBER_STATUS', 'status is invalid.');
    }
    normalized.status = status;
  }
  if (body.profileJson !== undefined) {
    normalized.profileJson = assertPlainObject(body.profileJson, 'INVALID_MEMBER_PROFILE', 'profileJson');
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'No supported member fields supplied.');
  }

  return normalized;
}

function mapMemberRow(row) {
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    customerId: row.customer_id ? Number(row.customer_id) : null,
    leadId: row.lead_id ? Number(row.lead_id) : null,
    displayName: row.display_name || null,
    phone: row.phone || null,
    email: row.email || null,
    lineId: row.line_id || null,
    status: row.status,
    source: row.source,
    profileJson: row.profile_json || {},
    consentJson: row.consent_json || {},
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildSummary(payload, memberId, changedFields = []) {
  return {
    source: 'member_profile_foundation',
    memberId,
    leadId: payload.leadId || null,
    bookingRequestId: payload.bookingRequestId || null,
    changedFields,
    hasPhone: Boolean(payload.phone),
    hasEmail: Boolean(payload.email),
    hasLineId: Boolean(payload.lineId)
  };
}

async function recordMemberEvent(client, clinicId, memberId, eventType, payload) {
  const summary = buildSummary(payload, memberId, payload.changedFields || []);
  await client.query(
    `
      insert into clinic_member_events (
        clinic_id,
        member_id,
        lead_id,
        booking_request_id,
        event_type,
        event_summary_json
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      clinicId,
      memberId,
      payload.leadId || null,
      payload.bookingRequestId || null,
      eventType,
      JSON.stringify({ summary })
    ]
  );
  return summary;
}

async function auditMemberMutation(client, clinicId, memberId, actionType, actorUserId, summary) {
  await recordAuditLog(
    {
      clinicId,
      entityType: 'clinic_member',
      entityId: memberId,
      actionType,
      actorUserId: actorUserId || null,
      contextJson: { summary }
    },
    client
  );
}

async function findMatchingMember(client, payload) {
  const matchers = [
    payload.email
      ? {
          clause: 'lower(email) = lower($2)',
          value: payload.email
        }
      : null,
    payload.phone
      ? {
          clause: 'phone = $2',
          value: payload.phone
        }
      : null,
    payload.lineId
      ? {
          clause: 'line_id = $2',
          value: payload.lineId
        }
      : null
  ].filter(Boolean);

  for (const matcher of matchers) {
    const result = await client.query(
      `
        select *
        from clinic_members
        where clinic_id = $1 and ${matcher.clause}
        order by updated_at desc, id desc
        limit 1
      `,
      [payload.clinicId, matcher.value]
    );
    if (result.rowCount > 0) {
      return result.rows[0];
    }
  }

  return null;
}

async function assertIntakeReferences(client, payload) {
  const checks = [
    payload.customerId
      ? {
          tableName: 'customers',
          id: payload.customerId,
          code: 'MEMBER_NOT_FOUND',
          label: 'Customer'
        }
      : null,
    payload.leadId
      ? {
          tableName: 'leads',
          id: payload.leadId,
          code: 'MEMBER_NOT_FOUND',
          label: 'Lead'
        }
      : null,
    payload.bookingRequestId
      ? {
          tableName: 'clinic_booking_requests',
          id: payload.bookingRequestId,
          code: 'MEMBER_NOT_FOUND',
          label: 'Booking request'
        }
      : null
  ].filter(Boolean);

  for (const check of checks) {
    const result = await client.query(
      `select id from ${check.tableName} where clinic_id = $1 and id = $2 limit 1`,
      [payload.clinicId, check.id]
    );
    if (result.rowCount === 0) {
      throw new AppError(404, check.code, `${check.label} not found.`);
    }
  }
}

async function contactValueAvailable(client, clinicId, fieldName, value, currentMemberId) {
  if (!value) return false;
  const columnExpression = fieldName === 'email' ? 'lower(email) = lower($2)' : `${fieldName} = $2`;
  const result = await client.query(
    `
      select id
      from clinic_members
      where clinic_id = $1
        and ${columnExpression}
        and id <> $3
      limit 1
    `,
    [clinicId, value, currentMemberId]
  );
  return result.rowCount === 0;
}

async function updateExistingMember(client, existing, payload) {
  const assignments = [];
  const values = [payload.clinicId, existing.id];
  const changedFields = [];

  const addAssignment = (columnName, value, publicName = columnName) => {
    values.push(value);
    assignments.push(`${columnName} = $${values.length}`);
    changedFields.push(publicName);
  };

  if (!existing.display_name && payload.displayName) {
    addAssignment('display_name', payload.displayName, 'displayName');
  }
  if (!existing.phone && payload.phone && await contactValueAvailable(client, payload.clinicId, 'phone', payload.phone, existing.id)) {
    addAssignment('phone', payload.phone);
  }
  if (!existing.email && payload.email && await contactValueAvailable(client, payload.clinicId, 'email', payload.email, existing.id)) {
    addAssignment('email', payload.email);
  }
  if (!existing.line_id && payload.lineId && await contactValueAvailable(client, payload.clinicId, 'line_id', payload.lineId, existing.id)) {
    addAssignment('line_id', payload.lineId, 'lineId');
  }
  if (!existing.customer_id && payload.customerId) {
    addAssignment('customer_id', payload.customerId, 'customerId');
  }
  if (!existing.lead_id && payload.leadId) {
    addAssignment('lead_id', payload.leadId, 'leadId');
  }

  if (assignments.length === 0) {
    return {
      member: mapMemberRow(existing),
      created: false,
      changedFields
    };
  }

  values.push(JSON.stringify(payload.consentSummary));
  assignments.push(`consent_json = clinic_members.consent_json || $${values.length}::jsonb`);
  assignments.push('last_seen_at = now()');
  assignments.push('updated_at = now()');

  const result = await client.query(
    `
      update clinic_members
      set ${assignments.join(', ')}
      where clinic_id = $1 and id = $2
      returning *
    `,
    values
  );

  return {
    member: mapMemberRow(result.rows[0]),
    created: false,
    changedFields
  };
}

async function findOrCreateMemberForPublicIntake(input, client = getPool()) {
  const payload = normalizePublicMemberPayload(input);
  await assertIntakeReferences(client, payload);
  const existing = await findMatchingMember(client, payload);

  if (existing) {
    const updated = await updateExistingMember(client, existing, payload);
    if (updated.changedFields.length > 0) {
      const summary = await recordMemberEvent(client, payload.clinicId, updated.member.id, 'member.profile.updated', {
        ...payload,
        changedFields: updated.changedFields
      });
      await auditMemberMutation(client, payload.clinicId, updated.member.id, 'clinic_member.updated', null, summary);
    }
    return updated;
  }

  const result = await client.query(
    `
      insert into clinic_members (
        clinic_id,
        customer_id,
        lead_id,
        display_name,
        phone,
        email,
        line_id,
        source,
        consent_json,
        last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
      returning *
    `,
    [
      payload.clinicId,
      payload.customerId,
      payload.leadId,
      payload.displayName,
      payload.phone,
      payload.email,
      payload.lineId,
      payload.source,
      JSON.stringify(payload.consentSummary)
    ]
  );

  const member = mapMemberRow(result.rows[0]);
  const summary = await recordMemberEvent(client, payload.clinicId, member.id, 'member.created', {
    ...payload,
    changedFields: ['member']
  });
  await auditMemberMutation(client, payload.clinicId, member.id, 'clinic_member.created', null, summary);

  return {
    member,
    created: true,
    changedFields: ['member']
  };
}

async function linkLeadToMember(input, client = getPool()) {
  const clinicId = asPositiveInteger(input.clinicId, 'clinicId');
  const leadId = asPositiveInteger(input.leadId, 'leadId');
  const memberId = asPositiveInteger(input.memberId, 'memberId');

  const linkResult = await client.query(
    `
      select
        m.id as member_id,
        m.lead_id as existing_lead_id,
        m.phone,
        m.email,
        m.line_id,
        l.id as lead_id
      from clinic_members m
      inner join leads l on l.clinic_id = m.clinic_id and l.id = $3
      where m.clinic_id = $1 and m.id = $2
      limit 1
    `,
    [clinicId, memberId, leadId]
  );

  if (linkResult.rowCount === 0) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member or lead not found.');
  }

  const row = linkResult.rows[0];
  if (!row.existing_lead_id || Number(row.existing_lead_id) === leadId) {
    await client.query(
      `
        update clinic_members
        set lead_id = $3,
            updated_at = now()
        where clinic_id = $1 and id = $2
      `,
      [clinicId, memberId, leadId]
    );
  }

  const summary = await recordMemberEvent(client, clinicId, memberId, 'member.linked_to_lead', {
    leadId,
    phone: row.phone,
    email: row.email,
    lineId: row.line_id,
    changedFields: ['leadId']
  });
  await auditMemberMutation(client, clinicId, memberId, 'clinic_member.linked_to_lead', input.actorUserId || null, summary);

  return { success: true, memberId, leadId };
}

async function linkBookingRequestToMember(input, client = getPool()) {
  const clinicId = asPositiveInteger(input.clinicId, 'clinicId');
  const bookingRequestId = asPositiveInteger(input.bookingRequestId, 'bookingRequestId');
  const memberId = asPositiveInteger(input.memberId, 'memberId');

  const linkResult = await client.query(
    `
      select
        m.id as member_id,
        m.phone,
        m.email,
        m.line_id,
        br.id as booking_request_id,
        br.member_id as existing_member_id,
        br.lead_id
      from clinic_members m
      inner join clinic_booking_requests br on br.clinic_id = m.clinic_id and br.id = $3
      where m.clinic_id = $1 and m.id = $2
      limit 1
    `,
    [clinicId, memberId, bookingRequestId]
  );

  if (linkResult.rowCount === 0) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member or booking request not found.');
  }

  const row = linkResult.rows[0];
  if (row.existing_member_id && Number(row.existing_member_id) !== memberId) {
    throw new AppError(400, 'INVALID_MEMBER_PAYLOAD', 'Booking request is already linked to another member.');
  }

  await client.query(
    `
      update clinic_booking_requests
      set member_id = $3,
          updated_at = now()
      where clinic_id = $1 and id = $2
    `,
    [clinicId, bookingRequestId, memberId]
  );

  const summary = await recordMemberEvent(client, clinicId, memberId, 'member.linked_to_booking_request', {
    leadId: row.lead_id ? Number(row.lead_id) : null,
    bookingRequestId,
    phone: row.phone,
    email: row.email,
    lineId: row.line_id,
    changedFields: ['bookingRequestId']
  });
  await auditMemberMutation(
    client,
    clinicId,
    memberId,
    'clinic_member.linked_to_booking_request',
    input.actorUserId || null,
    summary
  );

  return { success: true, memberId, bookingRequestId };
}

async function listMembersForAdmin(context, searchParams) {
  assertAdminContext(context);
  const filters = normalizeAdminFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['m.clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`m.status = $${values.length}`);
  }

  if (filters.q) {
    values.push(`%${escapeLikePattern(filters.q.toLowerCase())}%`);
    clauses.push(`(
      lower(coalesce(m.display_name, '')) like $${values.length} escape '\\'
      or lower(coalesce(m.phone, '')) like $${values.length} escape '\\'
      or lower(coalesce(m.email, '')) like $${values.length} escape '\\'
      or lower(coalesce(m.line_id, '')) like $${values.length} escape '\\'
    )`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await getPool().query(
    `
      select m.*, count(*) over()::int as total_count
      from clinic_members m
      where ${clauses.join(' and ')}
      order by m.updated_at desc, m.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map(mapMemberRow),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function getMemberProfileForAdmin(context, memberId) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(memberId, 'memberId');
  const client = getPool();
  const result = await client.query(
    `
      select
        m.*,
        l.full_name as lead_full_name,
        l.status as lead_status,
        l.stage as lead_stage,
        c.full_name as customer_full_name,
        c.status as customer_status
      from clinic_members m
      left join leads l on l.clinic_id = m.clinic_id and l.id = m.lead_id
      left join customers c on c.clinic_id = m.clinic_id and c.id = m.customer_id
      where m.clinic_id = $1 and m.id = $2
      limit 1
    `,
    [context.currentClinic.id, normalizedId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
  }

  const eventResult = await client.query(
    `
      select id, event_type, event_summary_json, lead_id, booking_request_id, created_at
      from clinic_member_events
      where clinic_id = $1 and member_id = $2
      order by created_at desc, id desc
      limit 50
    `,
    [context.currentClinic.id, normalizedId]
  );

  const bookingResult = await client.query(
    `
      select id, lead_id, request_type, interest_type, status, preferred_date, created_at
      from clinic_booking_requests
      where clinic_id = $1 and member_id = $2
      order by created_at desc, id desc
      limit 20
    `,
    [context.currentClinic.id, normalizedId]
  );

  const row = result.rows[0];
  return {
    ...mapMemberRow(row),
    lead: row.lead_id
      ? {
          id: Number(row.lead_id),
          fullName: row.lead_full_name || null,
          status: row.lead_status || null,
          stage: row.lead_stage || null
        }
      : null,
    customer: row.customer_id
      ? {
          id: Number(row.customer_id),
          fullName: row.customer_full_name || null,
          status: row.customer_status || null
        }
      : null,
    bookingRequests: bookingResult.rows.map((booking) => ({
      id: Number(booking.id),
      leadId: booking.lead_id ? Number(booking.lead_id) : null,
      requestType: booking.request_type,
      interestType: booking.interest_type,
      status: booking.status,
      preferredDate: booking.preferred_date ? String(booking.preferred_date).slice(0, 10) : null,
      createdAt: booking.created_at
    })),
    events: eventResult.rows.map((event) => ({
      id: Number(event.id),
      eventType: event.event_type,
      summary: event.event_summary_json?.summary || event.event_summary_json || {},
      leadId: event.lead_id ? Number(event.lead_id) : null,
      bookingRequestId: event.booking_request_id ? Number(event.booking_request_id) : null,
      createdAt: event.created_at
    }))
  };
}

async function updateMemberProfileForAdmin(context, memberId, body) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(memberId, 'memberId');
  const normalized = normalizeAdminUpdatePayload(body);
  const client = await getPool().connect();
  let committed = false;

  try {
    await client.query('begin');
    const existing = await client.query(
      'select * from clinic_members where clinic_id = $1 and id = $2 for update',
      [context.currentClinic.id, normalizedId]
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
    }

    const values = [context.currentClinic.id, normalizedId];
    const assignments = [];
    const changedFields = [];

    if (Object.prototype.hasOwnProperty.call(normalized, 'displayName')) {
      values.push(normalized.displayName);
      assignments.push(`display_name = $${values.length}`);
      changedFields.push('displayName');
    }
    if (normalized.status) {
      values.push(normalized.status);
      assignments.push(`status = $${values.length}`);
      changedFields.push('status');
    }
    if (normalized.profileJson) {
      values.push(JSON.stringify(normalized.profileJson));
      assignments.push(`profile_json = $${values.length}::jsonb`);
      changedFields.push('profileJson');
    }

    assignments.push('updated_at = now()');
    await client.query(
      `
        update clinic_members
        set ${assignments.join(', ')}
        where clinic_id = $1 and id = $2
      `,
      values
    );

    const summary = await recordMemberEvent(client, context.currentClinic.id, normalizedId, 'member.profile.updated', {
      changedFields,
      phone: existing.rows[0].phone,
      email: existing.rows[0].email,
      lineId: existing.rows[0].line_id
    });
    await auditMemberMutation(
      client,
      context.currentClinic.id,
      normalizedId,
      'clinic_member.updated',
      context.currentUser?.id || null,
      summary
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
    item: await getMemberProfileForAdmin(context, normalizedId)
  };
}

module.exports = {
  findOrCreateMemberForPublicIntake,
  linkLeadToMember,
  linkBookingRequestToMember,
  getMemberProfileForAdmin,
  listMembersForAdmin,
  updateMemberProfileForAdmin,
  normalizeAdminFilters,
  normalizeAdminUpdatePayload,
  escapeLikePattern
};
