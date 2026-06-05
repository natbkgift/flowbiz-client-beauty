'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

const VALID_APPOINTMENT_STATUSES = new Set(['scheduled', 'cancelled', 'completed', 'no_show']);
const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const bangkokDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function trimString(value, maxLength, code = 'INVALID_REQUEST', fieldName = 'value') {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, code, `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AppError(400, code, `${fieldName} must be ${maxLength} characters or less.`);
  }
  return trimmed;
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

function rejectAdminClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden for confirmed appointments.');
  }
}

function rejectAdminClinicOverrideQuery(searchParams) {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, 'INVALID_REQUEST', 'clinicId cannot be overridden in the query string.');
  }
}

function assertAdminContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function normalizeAppointmentStatus(value) {
  const normalized = trimString(value, 40, 'INVALID_CONFIRMED_APPOINTMENT_STATUS', 'status');
  if (!normalized || !VALID_APPOINTMENT_STATUSES.has(normalized)) {
    throw new AppError(400, 'INVALID_CONFIRMED_APPOINTMENT_STATUS', 'status is invalid.');
  }
  return normalized;
}

function normalizeCancellationReason(value) {
  return trimString(value, 500, 'INVALID_REQUEST', 'cancellationReason');
}

function normalizeStatusPayload(body) {
  rejectAdminClinicOverride(body);
  return {
    status: normalizeAppointmentStatus(body.status),
    cancellationReason: normalizeCancellationReason(body.cancellationReason)
  };
}

function normalizeListFilters(searchParams) {
  rejectAdminClinicOverrideQuery(searchParams);
  const status = trimString(searchParams.get('status'), 40, 'INVALID_CONFIRMED_APPOINTMENT_STATUS', 'status');
  if (status && !VALID_APPOINTMENT_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_CONFIRMED_APPOINTMENT_STATUS', 'status is invalid.');
  }

  return {
    status,
    limit: Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return bangkokDateFormatter.format(value);
  return String(value).slice(0, 10);
}

function normalizeConcreteStartTime(value) {
  const normalized = trimString(value, 10, 'APPOINTMENT_START_TIME_REQUIRED', 'offeredStartTime');
  if (!normalized || !START_TIME_PATTERN.test(normalized)) {
    throw new AppError(400, 'APPOINTMENT_START_TIME_REQUIRED', 'A concrete offered start time is required.');
  }
  return normalized;
}

function normalizeConcreteDuration(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 480) {
    throw new AppError(400, 'APPOINTMENT_DURATION_REQUIRED', 'A valid appointment duration is required.');
  }
  return parsed;
}

function calculateEndTime(startTime, durationMinutes) {
  if (!START_TIME_PATTERN.test(startTime)) return null;
  const [hour, minute] = startTime.split(':').map((part) => Number.parseInt(part, 10));
  const total = hour * 60 + minute + durationMinutes;
  if (total >= 24 * 60) return null;
  const endHour = String(Math.floor(total / 60)).padStart(2, '0');
  const endMinute = String(total % 60).padStart(2, '0');
  return `${endHour}:${endMinute}`;
}

function mapAppointmentRow(row) {
  return {
    id: Number(row.id),
    bookingRequestId: row.booking_request_id ? Number(row.booking_request_id) : null,
    slotOfferId: row.slot_offer_id ? Number(row.slot_offer_id) : null,
    leadId: row.lead_id ? Number(row.lead_id) : null,
    memberId: row.member_id ? Number(row.member_id) : null,
    appointmentDate: formatDateOnly(row.appointment_date),
    startTime: row.start_time,
    endTime: row.end_time || null,
    durationMinutes: Number(row.duration_minutes),
    timezone: row.timezone,
    visitType: row.visit_type || null,
    status: row.status,
    source: row.source,
    confirmedByUserId: row.confirmed_by_user_id ? Number(row.confirmed_by_user_id) : null,
    cancelledByUserId: row.cancelled_by_user_id ? Number(row.cancelled_by_user_id) : null,
    cancelledAt: row.cancelled_at || null,
    cancellationReasonProvided: Boolean(row.cancellation_reason),
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getAppointmentBySlotOffer(client, clinicId, slotOfferId) {
  const result = await client.query(
    `
      select *
      from clinic_confirmed_appointments
      where clinic_id = $1 and slot_offer_id = $2
      limit 1
    `,
    [clinicId, slotOfferId]
  );
  return result.rows[0] ? mapAppointmentRow(result.rows[0]) : null;
}

async function recordAppointmentLeadActivity(client, clinicId, leadId, eventType, summary) {
  if (!leadId) return;
  await client.query(
    `
      insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
      values ($1, $2, $3, $4::jsonb)
    `,
    [clinicId, leadId, eventType, JSON.stringify({ summary })]
  );
}

async function confirmAppointmentFromAcceptedSlotOffer(context, bookingRequestId, offerId) {
  assertAdminContext(context);
  const normalizedBookingId = asPositiveInteger(bookingRequestId, 'bookingRequestId');
  const normalizedOfferId = asPositiveInteger(offerId, 'offerId');
  const clinicId = context.currentClinic.id;
  const client = await getPool().connect();
  let committed = false;
  let appointment = null;
  let idempotent = false;

  try {
    await client.query('begin');
    const offerResult = await client.query(
      `
        select
          o.*,
          br.lead_id as booking_lead_id,
          br.member_id as booking_member_id,
          br.visit_type as booking_visit_type
        from clinic_booking_slot_offers o
        inner join clinic_booking_requests br
          on br.clinic_id = o.clinic_id
          and br.id = o.booking_request_id
        where o.clinic_id = $1
          and o.booking_request_id = $2
          and o.id = $3
        for update
      `,
      [clinicId, normalizedBookingId, normalizedOfferId]
    );

    if (offerResult.rowCount === 0) {
      throw new AppError(404, 'APPOINTMENT_SLOT_OFFER_NOT_FOUND', 'Slot offer not found for appointment confirmation.');
    }

    const offer = offerResult.rows[0];
    if (offer.offer_status !== 'accepted' && offer.customer_response !== 'accepted') {
      throw new AppError(409, 'APPOINTMENT_SLOT_OFFER_NOT_ACCEPTED', 'Slot offer must be accepted before appointment confirmation.');
    }

    const startTime = normalizeConcreteStartTime(offer.offered_start_time);
    const durationMinutes = normalizeConcreteDuration(offer.duration_minutes);
    const appointmentDate = formatDateOnly(offer.offered_date);
    const endTime = calculateEndTime(startTime, durationMinutes);

    const existingAppointment = await getAppointmentBySlotOffer(client, clinicId, normalizedOfferId);
    if (existingAppointment) {
      appointment = existingAppointment;
      idempotent = true;
      await client.query('commit');
      committed = true;
      return { success: true, idempotent, appointment };
    }

    const insertResult = await client.query(
      `
        insert into clinic_confirmed_appointments (
          clinic_id,
          booking_request_id,
          slot_offer_id,
          lead_id,
          member_id,
          appointment_date,
          start_time,
          end_time,
          duration_minutes,
          timezone,
          visit_type,
          status,
          source,
          confirmed_by_user_id,
          metadata_json
        )
        values (
          $1, $2, $3, $4, $5, $6::date, $7, $8, $9,
          'Asia/Bangkok', $10, 'scheduled', 'slot_offer', $11, $12::jsonb
        )
        on conflict (clinic_id, slot_offer_id) where slot_offer_id is not null do nothing
        returning *
      `,
      [
        clinicId,
        normalizedBookingId,
        normalizedOfferId,
        offer.booking_lead_id || offer.lead_id || null,
        offer.booking_member_id || offer.member_id || null,
        appointmentDate,
        startTime,
        endTime,
        durationMinutes,
        offer.booking_visit_type || null,
        context.currentUser?.id || null,
        JSON.stringify({ source: 'admin_confirm_from_slot_offer' })
      ]
    );

    if (insertResult.rowCount === 0) {
      appointment = await getAppointmentBySlotOffer(client, clinicId, normalizedOfferId);
      idempotent = true;
      await client.query('commit');
      committed = true;
      return { success: true, idempotent, appointment };
    }

    appointment = mapAppointmentRow(insertResult.rows[0]);
    const summary = {
      source: 'admin_confirm_from_slot_offer',
      appointmentId: appointment.id,
      bookingRequestId: normalizedBookingId,
      slotOfferId: normalizedOfferId,
      leadId: appointment.leadId,
      memberId: appointment.memberId,
      appointmentDate,
      startTimeProvided: true,
      durationMinutes,
      status: appointment.status
    };

    await client.query(
      `
        update clinic_booking_requests
        set status = 'confirmed',
            slot_status = 'accepted',
            updated_at = now()
        where clinic_id = $1 and id = $2
      `,
      [clinicId, normalizedBookingId]
    );

    await recordAppointmentLeadActivity(client, clinicId, appointment.leadId, 'booking_request.appointment_confirmed', summary);
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_confirmed_appointment',
        entityId: appointment.id,
        actionType: 'clinic_confirmed_appointment.created',
        actorUserId: context.currentUser?.id || null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    committed = true;
    return { success: true, idempotent, appointment };
  } catch (error) {
    if (!committed) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listConfirmedAppointments(context, searchParams = new URLSearchParams()) {
  assertAdminContext(context);
  const filters = normalizeListFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await getPool().query(
    `
      select *, count(*) over() as total_count
      from clinic_confirmed_appointments
      where ${clauses.join(' and ')}
      order by appointment_date asc, start_time asc, id asc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map(mapAppointmentRow),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function getConfirmedAppointmentDetail(context, appointmentId, client = getPool()) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(appointmentId, 'appointmentId');
  const result = await client.query(
    `
      select *
      from clinic_confirmed_appointments
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [context.currentClinic.id, normalizedId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'CONFIRMED_APPOINTMENT_NOT_FOUND', 'Confirmed appointment not found.');
  }

  return mapAppointmentRow(result.rows[0]);
}

async function updateConfirmedAppointmentStatus(context, appointmentId, body) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(appointmentId, 'appointmentId');
  const normalized = normalizeStatusPayload(body);
  const clinicId = context.currentClinic.id;
  const client = await getPool().connect();
  let committed = false;
  let appointment = null;

  try {
    await client.query('begin');
    const existingResult = await client.query(
      `
        select *
        from clinic_confirmed_appointments
        where clinic_id = $1 and id = $2
        for update
      `,
      [clinicId, normalizedId]
    );

    if (existingResult.rowCount === 0) {
      throw new AppError(404, 'CONFIRMED_APPOINTMENT_NOT_FOUND', 'Confirmed appointment not found.');
    }

    const existing = existingResult.rows[0];
    if (existing.status === 'cancelled' && normalized.status === 'scheduled') {
      throw new AppError(409, 'INVALID_CONFIRMED_APPOINTMENT_STATUS', 'Cancelled appointments cannot be rescheduled in this foundation flow.');
    }

    if (existing.status === normalized.status && normalized.status !== 'cancelled') {
      appointment = mapAppointmentRow(existing);
      await client.query('commit');
      committed = true;
      return { success: true, changed: false, appointment };
    }

    const updateResult = await client.query(
      `
        update clinic_confirmed_appointments
        set status = $3,
            cancelled_at = case when $3::varchar = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
            cancelled_by_user_id = case when $3::varchar = 'cancelled' then $4 else cancelled_by_user_id end,
            cancellation_reason = case when $3::varchar = 'cancelled' then $5 else cancellation_reason end,
            updated_at = now()
        where clinic_id = $1 and id = $2
        returning *
      `,
      [
        clinicId,
        normalizedId,
        normalized.status,
        context.currentUser?.id || null,
        normalized.status === 'cancelled' ? normalized.cancellationReason : null
      ]
    );

    appointment = mapAppointmentRow(updateResult.rows[0]);
    const summary = {
      source: 'admin_confirmed_appointments',
      appointmentId: appointment.id,
      bookingRequestId: appointment.bookingRequestId,
      slotOfferId: appointment.slotOfferId,
      leadId: appointment.leadId,
      memberId: appointment.memberId,
      fromStatus: existing.status,
      toStatus: appointment.status,
      cancellationReasonProvided: Boolean(normalized.cancellationReason),
      changedFields: ['status']
    };
    const cancelled = normalized.status === 'cancelled';

    await recordAppointmentLeadActivity(
      client,
      clinicId,
      appointment.leadId,
      cancelled ? 'booking_request.appointment_cancelled' : 'booking_request.appointment_status_changed',
      summary
    );
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_confirmed_appointment',
        entityId: appointment.id,
        actionType: cancelled ? 'clinic_confirmed_appointment.cancelled' : 'clinic_confirmed_appointment.status_changed',
        actorUserId: context.currentUser?.id || null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    committed = true;
    return { success: true, changed: existing.status !== appointment.status, appointment };
  } catch (error) {
    if (!committed) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  confirmAppointmentFromAcceptedSlotOffer,
  listConfirmedAppointments,
  getConfirmedAppointmentDetail,
  updateConfirmedAppointmentStatus,
  mapAppointmentRow,
  normalizeAppointmentStatus,
  normalizeCancellationReason,
  asPositiveInteger,
  formatDateOnly
};
