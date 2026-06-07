'use strict';

const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { createNotificationDraftForEvent } = require('../notifications/service');
const { resolvePublicClinicBySlug } = require('../public-content/clinic-resolver');
const {
  listPublicMemberPackagesForMember,
  listPublicPaymentRecordsForMember
} = require('../package-payments/service');

const GENERIC_REQUEST_MESSAGE = 'หากพบข้อมูลสมาชิก ระบบจะส่งลิงก์เข้าใช้งานให้ตามช่องทางที่ระบุ';
const VALID_CHANNELS = new Set(['email', 'phone', 'line']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_SLOT_OFFER_STATUSES = new Set(['ready_to_send', 'sent', 'accepted', 'declined']);
const RESPONDABLE_SLOT_OFFER_STATUSES = new Set(['ready_to_send', 'sent']);
const VALID_SLOT_OFFER_RESPONSES = new Set(['accepted', 'declined']);
const PUBLIC_CONFIRMED_APPOINTMENT_STATUSES = new Set(['scheduled', 'cancelled', 'completed', 'no_show']);
const CONSENT_KEYS = ['communication', 'marketing', 'appointment_reminder', 'data_processing'];
const VALID_CONSENT_KEYS = new Set(CONSENT_KEYS);
const VALID_CONSENT_STATUSES = new Set(['granted', 'revoked']);
const bangkokDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const bangkokTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function trimString(value, maxLength, code = 'INVALID_MEMBER_ACCESS_PAYLOAD') {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, code, 'Expected string field.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AppError(400, code, 'String field is too long.');
  }
  return trimmed;
}

function trimHoneypot(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'Expected string field.');
  }
  return value.trim() || null;
}

function rejectClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'clinicId cannot be supplied for public member access.');
  }
}

function rejectSlotOfferClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_SLOT_OFFER_RESPONSE', 'Request body must be a JSON object.');
  }
  if (
    body.clinicId !== undefined ||
    body.clinic_id !== undefined ||
    body.memberId !== undefined ||
    body.member_id !== undefined ||
    body.leadId !== undefined ||
    body.lead_id !== undefined
  ) {
    throw new AppError(400, 'INVALID_SLOT_OFFER_RESPONSE', 'Tenant, member, and lead identifiers cannot be supplied for public slot offer response.');
  }
}

function rejectMemberConsentOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Request body must be a JSON object.');
  }
  if (
    body.clinicId !== undefined ||
    body.clinic_id !== undefined ||
    body.memberId !== undefined ||
    body.member_id !== undefined ||
    body.leadId !== undefined ||
    body.lead_id !== undefined
  ) {
    throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Tenant, member, and lead identifiers cannot be supplied for public member consent updates.');
  }
}

function rejectClinicOverrideQuery(searchParams) {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_PAYLOAD', 'clinicId cannot be supplied for public member access.');
  }
}

function normalizeRequestPayload(body) {
  rejectClinicOverride(body);
  const honeypot = trimHoneypot(body.honeypot);
  if (honeypot) {
    return { isBot: true };
  }

  const contact = trimString(body.contact, 160, 'INVALID_MEMBER_ACCESS_PAYLOAD');
  const channel = trimString(body.channel, 40, 'INVALID_MEMBER_ACCESS_CHANNEL');

  if (!contact) {
    throw new AppError(400, 'MEMBER_ACCESS_CONTACT_REQUIRED', 'contact is required.');
  }
  if (!channel || !VALID_CHANNELS.has(channel)) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_CHANNEL', 'channel is invalid.');
  }
  if (channel === 'email' && !EMAIL_PATTERN.test(contact.toLowerCase())) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_EMAIL', 'Invalid email format.');
  }

  return {
    isBot: false,
    contact: channel === 'email' ? contact.toLowerCase() : contact,
    channel
  };
}

function normalizeToken(value) {
  const token = trimString(value, 300, 'INVALID_MEMBER_ACCESS_TOKEN');
  if (!token) {
    throw new AppError(400, 'INVALID_MEMBER_ACCESS_TOKEN', 'token is required.');
  }
  return token;
}

function safeSuccess(extra = {}) {
  return {
    success: true,
    message: GENERIC_REQUEST_MESSAGE,
    ...extra
  };
}

function createAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashWithSecret(value, secret = loadConfig().memberAccessTokenSecret) {
  if (!secret) {
    throw new AppError(500, 'MEMBER_ACCESS_FORBIDDEN', 'Member access token secret is not configured.');
  }
  return crypto.createHash('sha256').update(`${value}${secret}`).digest('hex');
}

function hashAccessToken(token) {
  return hashWithSecret(token);
}

function hashRequestMetaValue(value) {
  if (!value) return null;
  return hashWithSecret(String(value));
}

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = String(email).split('@');
  if (!local || !domain) return null;
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const value = String(phone);
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

function maskLineId(lineId) {
  if (!lineId) return null;
  const value = String(lineId);
  if (value.length <= 3) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, 3)}***`;
}

function displayNameForPublic(member) {
  const rawName = member.display_name || 'Member';
  const normalized = String(rawName).trim();
  if (!normalized) return 'Member';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1].slice(0, 1)}.`;
  }
  if (normalized.length <= 2) return normalized;
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.min(3, normalized.length - 2))}`;
}

function mapMemberPublicProfile(member) {
  return {
    displayName: displayNameForPublic(member),
    contact: {
      emailMasked: maskEmail(member.email),
      phoneMasked: maskPhone(member.phone),
      lineIdMasked: maskLineId(member.line_id)
    }
  };
}

function mapPublicBookingRequest(row) {
  return {
    id: Number(row.id),
    status: row.status,
    requestType: row.request_type,
    interestType: row.interest_type,
    preferredDate: formatDateOnly(row.preferred_date),
    preferredTimeWindow: row.preferred_time_window || null,
    createdAt: row.created_at
  };
}

function mapPublicSlotOffer(row, options = {}) {
  const base = {
    id: Number(row.id),
    bookingRequestId: Number(row.booking_request_id),
    offeredDate: formatDateOnly(row.offered_date),
    offeredTimeWindow: row.offered_time_window,
    offeredStartTime: row.offered_start_time || null,
    durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
    offerStatus: row.offer_status,
    customerResponse: row.customer_response || null,
    customerRespondedAt: row.customer_responded_at || null,
    createdAt: row.created_at
  };

  if (options.responseOnly) {
    return {
      id: base.id,
      bookingRequestId: base.bookingRequestId,
      offerStatus: base.offerStatus,
      customerResponse: base.customerResponse,
      customerRespondedAt: base.customerRespondedAt
    };
  }

  return base;
}

function mapPublicConfirmedAppointment(row) {
  return {
    id: Number(row.id),
    bookingRequestId: row.booking_request_id ? Number(row.booking_request_id) : null,
    slotOfferId: row.slot_offer_id ? Number(row.slot_offer_id) : null,
    appointmentDate: formatDateOnly(row.appointment_date),
    startTime: row.start_time,
    endTime: row.end_time || null,
    durationMinutes: Number(row.duration_minutes),
    timezone: row.timezone,
    visitType: row.visit_type || null,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeAppointmentTime(value) {
  if (typeof value !== 'string') return null;
  const [hourPart, minutePart, secondPart = '00'] = value.split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  const second = Number.parseInt(secondPart, 10);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return [
    String(hour).padStart(2, '0'),
    String(minute).padStart(2, '0'),
    String(second).padStart(2, '0')
  ].join(':');
}

function appointmentStartsAt(appointment) {
  if (
    !appointment ||
    appointment.status !== 'scheduled' ||
    !appointment.appointmentDate ||
    !appointment.startTime
  ) {
    return null;
  }

  const normalizedTime = normalizeAppointmentTime(appointment.startTime);
  if (!normalizedTime) return null;

  const timestamp = new Date(`${appointment.appointmentDate}T${normalizedTime}+07:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function findNextScheduledAppointment(confirmedAppointments) {
  const now = Date.now();
  return confirmedAppointments
    .map((appointment) => ({ appointment, startsAt: appointmentStartsAt(appointment) }))
    .filter((item) => item.startsAt !== null && item.startsAt >= now)
    .sort((a, b) => a.startsAt - b.startsAt || a.appointment.id - b.appointment.id)[0]?.appointment || null;
}

function getBangkokNowParts(now = new Date()) {
  const timeParts = Object.fromEntries(
    bangkokTimeFormatter.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    date: bangkokDateFormatter.format(now),
    time: `${timeParts.hour || '00'}:${timeParts.minute || '00'}`
  };
}

function buildMemberPortalSummary({
  bookingRequests = [],
  slotOffers = [],
  confirmedAppointments = [],
  nextScheduledAppointment = null
}) {
  return {
    bookingRequestCount: bookingRequests.length,
    pendingSlotOfferCount: slotOffers.filter((offer) => (
      !offer.customerResponse && (offer.offerStatus === 'ready_to_send' || offer.offerStatus === 'sent')
    )).length,
    acceptedSlotOfferCount: slotOffers.filter((offer) => (
      offer.customerResponse === 'accepted' || offer.offerStatus === 'accepted'
    )).length,
    declinedSlotOfferCount: slotOffers.filter((offer) => (
      offer.customerResponse === 'declined' || offer.offerStatus === 'declined'
    )).length,
    scheduledAppointmentCount: confirmedAppointments.filter((appointment) => appointment.status === 'scheduled').length,
    completedAppointmentCount: confirmedAppointments.filter((appointment) => appointment.status === 'completed').length,
    cancelledAppointmentCount: confirmedAppointments.filter((appointment) => appointment.status === 'cancelled').length,
    nextScheduledAppointment
  };
}

function normalizePositiveInteger(value, fieldName, code = 'INVALID_SLOT_OFFER_RESPONSE') {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, code, `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeSlotOfferResponsePayload(body) {
  rejectSlotOfferClinicOverride(body);
  const honeypot = trimHoneypot(body.honeypot);
  if (honeypot) {
    return { isBot: true };
  }

  const response = trimString(body.response, 40, 'INVALID_SLOT_OFFER_RESPONSE');
  if (!response || !VALID_SLOT_OFFER_RESPONSES.has(response)) {
    throw new AppError(400, 'INVALID_SLOT_OFFER_RESPONSE', 'response must be accepted or declined.');
  }

  const note = trimString(body.note, 500, 'INVALID_SLOT_OFFER_RESPONSE');
  const token = normalizeToken(body.token);

  return {
    isBot: false,
    token,
    response,
    note
  };
}

function normalizeConsentUpdatePayload(body) {
  rejectMemberConsentOverride(body);
  const token = normalizeToken(body.token);
  if (body.consents !== undefined && !Array.isArray(body.consents)) {
    throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'consents must be an array.');
  }
  const rawConsents = Array.isArray(body.consents)
    ? body.consents
    : body.consent !== undefined
      ? [body.consent]
      : null;

  if (!rawConsents || rawConsents.length === 0) {
    throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'At least one consent update is required.');
  }
  if (rawConsents.length > CONSENT_KEYS.length) {
    throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Too many consent updates.');
  }

  const seenKeys = new Set();
  const updates = rawConsents.map((rawConsent) => {
    if (!rawConsent || typeof rawConsent !== 'object' || Array.isArray(rawConsent)) {
      throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Consent update must be a JSON object.');
    }

    const key = trimString(rawConsent.key, 80, 'INVALID_MEMBER_CONSENT');
    if (!key || !VALID_CONSENT_KEYS.has(key)) {
      throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Consent key is invalid.');
    }
    if (seenKeys.has(key)) {
      throw new AppError(400, 'INVALID_MEMBER_CONSENT', 'Consent key cannot be duplicated in one request.');
    }
    seenKeys.add(key);

    const status = trimString(rawConsent.status, 20, 'INVALID_MEMBER_CONSENT_STATUS');
    if (!status || !VALID_CONSENT_STATUSES.has(status)) {
      throw new AppError(400, 'INVALID_MEMBER_CONSENT_STATUS', 'Consent status must be granted or revoked.');
    }

    const versionProvided = rawConsent.version !== undefined && rawConsent.version !== null && String(rawConsent.version).trim() !== '';
    const version = trimString(rawConsent.version, 80, 'INVALID_MEMBER_CONSENT') || 'v1';

    return {
      key,
      status,
      version,
      versionProvided
    };
  });

  return {
    token,
    updates,
    versionProvided: updates.some((update) => update.versionProvided)
  };
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return bangkokDateFormatter.format(value);
  }
  return String(value).slice(0, 10);
}

function formatTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

function defaultMemberConsent(key) {
  return {
    key,
    status: 'unknown',
    source: 'member_portal',
    version: 'v1',
    grantedAt: null,
    revokedAt: null,
    lastUpdatedAt: null,
    updatedAt: null
  };
}

function mapPublicMemberConsent(rowOrDefault) {
  const key = rowOrDefault.consent_key || rowOrDefault.key;
  return {
    key,
    status: rowOrDefault.consent_status || rowOrDefault.status || 'unknown',
    source: rowOrDefault.consent_source || rowOrDefault.source || 'member_portal',
    version: rowOrDefault.consent_version || rowOrDefault.version || 'v1',
    grantedAt: formatTimestamp(rowOrDefault.granted_at || rowOrDefault.grantedAt),
    revokedAt: formatTimestamp(rowOrDefault.revoked_at || rowOrDefault.revokedAt),
    lastUpdatedAt: formatTimestamp(rowOrDefault.last_updated_at || rowOrDefault.lastUpdatedAt),
    updatedAt: formatTimestamp(rowOrDefault.updated_at || rowOrDefault.updatedAt)
  };
}

async function resolveActiveClinicForRequest(slug) {
  const clinic = await resolvePublicClinicBySlug(slug);
  if (!clinic || clinic.status !== 'active') {
    return null;
  }
  return {
    id: Number(clinic.id),
    slug: clinic.slug
  };
}

async function resolveActiveClinicOrThrow(slug) {
  const clinic = await resolveActiveClinicForRequest(slug);
  if (!clinic) {
    throw new AppError(404, 'INVALID_MEMBER_ACCESS_TOKEN', 'Invalid member access token.');
  }
  return clinic;
}

async function findMemberByContact(client, clinicId, channel, contact) {
  let query;
  if (channel === 'email') {
    query = `
      select *
      from clinic_members
      where clinic_id = $1
        and lower(email) = lower($2)
        and status = 'active'
      order by updated_at desc, id desc
      limit 1
    `;
  } else if (channel === 'phone') {
    query = `
      select *
      from clinic_members
      where clinic_id = $1
        and phone = $2
        and status = 'active'
      order by updated_at desc, id desc
      limit 1
    `;
  } else if (channel === 'line') {
    query = `
      select *
      from clinic_members
      where clinic_id = $1
        and line_id = $2
        and status = 'active'
      order by updated_at desc, id desc
      limit 1
    `;
  } else {
    return null;
  }

  const result = await client.query(query, [clinicId, contact]);

  return result.rows[0] || null;
}

async function recordMemberAccessEvent(client, clinicId, member, eventType, summary) {
  await client.query(
    `
      insert into clinic_member_events (
        clinic_id,
        member_id,
        event_type,
        event_summary_json
      )
      values ($1, $2, $3, $4::jsonb)
    `,
    [clinicId, member.id, eventType, JSON.stringify({ summary })]
  );
}

async function auditMemberAccess(client, clinicId, memberId, actionType, summary) {
  await recordAuditLog(
    {
      clinicId,
      entityType: 'clinic_member',
      entityId: memberId,
      actionType,
      actorUserId: null,
      contextJson: { summary }
    },
    client
  );
}

function buildAccessSummary(member, channel, extra = {}) {
  return {
    source: 'member_magic_link',
    memberId: Number(member.id),
    channel,
    hasEmail: Boolean(member.email),
    hasPhone: Boolean(member.phone),
    hasLineId: Boolean(member.line_id),
    ...extra
  };
}

function getRequestMeta(requestMeta = {}) {
  return {
    requestIpHash: hashRequestMetaValue(requestMeta.ip || requestMeta.remoteAddress || null),
    userAgentHash: hashRequestMetaValue(requestMeta.userAgent || null)
  };
}

async function requestMemberMagicLink(slug, body, requestMeta = {}) {
  const normalized = normalizeRequestPayload(body);
  if (normalized.isBot) {
    return safeSuccess();
  }

  const clinic = await resolveActiveClinicForRequest(slug);
  if (!clinic) {
    return safeSuccess();
  }

  const client = await getPool().connect();
  try {
    await client.query('begin');
    const member = await findMemberByContact(client, clinic.id, normalized.channel, normalized.contact);
    if (!member) {
      await client.query('commit');
      return safeSuccess();
    }

    const config = loadConfig();
    const rawToken = createAccessToken();
    const tokenHash = hashAccessToken(rawToken);
    const ttlMinutes = config.memberMagicLinkTtlMinutes;
    const meta = getRequestMeta(requestMeta);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const tokenResult = await client.query(
      `
        insert into clinic_member_access_tokens (
          clinic_id,
          member_id,
          token_hash,
          purpose,
          delivery_channel,
          contact_hint,
          expires_at,
          request_ip_hash,
          user_agent_hash,
          metadata_json
        )
        values ($1, $2, $3, 'member_access', $4, $5, $6, $7, $8, $9::jsonb)
        returning id
      `,
      [
        clinic.id,
        member.id,
        tokenHash,
        normalized.channel,
        normalized.channel,
        expiresAt,
        meta.requestIpHash,
        meta.userAgentHash,
        JSON.stringify({ source: 'member_magic_link_request' })
      ]
    );

    const summary = buildAccessSummary(member, normalized.channel, {
      tokenCreated: true,
      accessTokenId: Number(tokenResult.rows[0].id)
    });
    await recordMemberAccessEvent(client, clinic.id, member, 'member_access.requested', summary);
    await auditMemberAccess(client, clinic.id, Number(member.id), 'member_access.requested', summary);
    await client.query('commit');

    const devExtras = config.appEnv !== 'production' && config.memberMagicLinkDevTokenEnabled
      ? { devToken: rawToken }
      : {};
    return safeSuccess(devExtras);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function resolveMemberSessionByToken(slug, token, requestMeta = {}, options = {}) {
  const normalizedToken = normalizeToken(token);
  const clinic = await resolveActiveClinicOrThrow(slug);
  const tokenHash = hashAccessToken(normalizedToken);
  const client = options.client || await getPool().connect();
  const shouldManageTransaction = !options.client;

  try {
    if (shouldManageTransaction) {
      await client.query('begin');
    }
    const result = await client.query(
      `
        select
          t.id as token_id,
          t.delivery_channel,
          t.expires_at,
          t.revoked_at,
          m.*
        from clinic_member_access_tokens t
        inner join clinic_members m on m.clinic_id = t.clinic_id and m.id = t.member_id
        where t.clinic_id = $1
          and t.token_hash = $2
          and t.purpose = 'member_access'
        limit 1
      `,
      [clinic.id, tokenHash]
    );

    if (result.rowCount === 0 || result.rows[0].revoked_at) {
      throw new AppError(404, 'INVALID_MEMBER_ACCESS_TOKEN', 'Invalid member access token.');
    }

    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AppError(401, 'MEMBER_ACCESS_TOKEN_EXPIRED', 'Member access token expired.');
    }
    if (row.status !== 'active') {
      throw new AppError(403, 'MEMBER_ACCESS_FORBIDDEN', 'Member access is forbidden.');
    }

    const bookingsResult = await client.query(
      `
        select id, status, request_type, interest_type, preferred_date, preferred_time_window, created_at
        from clinic_booking_requests
        where clinic_id = $1 and member_id = $2
        order by created_at desc, id desc
        limit 20
      `,
      [clinic.id, row.id]
    );

    const meta = getRequestMeta(requestMeta);
    await client.query(
      `
        update clinic_members
        set last_seen_at = now(), updated_at = now()
        where clinic_id = $1 and id = $2
      `,
      [clinic.id, row.id]
    );
    await client.query(
      `
        update clinic_member_access_tokens
        set metadata_json = metadata_json || $3::jsonb
        where clinic_id = $1 and id = $2
      `,
      [
        clinic.id,
        row.token_id,
        JSON.stringify({
          lastVerifiedAt: new Date().toISOString(),
          lastRequestIpHash: meta.requestIpHash,
          lastUserAgentHash: meta.userAgentHash
        })
      ]
    );

    const summary = buildAccessSummary(row, row.delivery_channel || 'unknown', {
      tokenVerified: true,
      accessTokenId: Number(row.token_id)
    });
    await recordMemberAccessEvent(client, clinic.id, row, 'member_access.verified', summary);
    await auditMemberAccess(client, clinic.id, Number(row.id), 'member_access.verified', summary);
    if (shouldManageTransaction) {
      await client.query('commit');
    }

    return {
      clinic,
      memberRow: row,
      success: true,
      member: mapMemberPublicProfile(row),
      bookingRequests: bookingsResult.rows.map(mapPublicBookingRequest)
    };
  } catch (error) {
    if (shouldManageTransaction) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    if (shouldManageTransaction) {
      client.release();
    }
  }
}

async function listPublicSlotOffersForMember(client, clinicId, memberId) {
  const result = await client.query(
    `
      select
        o.id,
        o.booking_request_id,
        o.offered_date,
        o.offered_time_window,
        o.offered_start_time,
        o.duration_minutes,
        o.offer_status,
        o.customer_response,
        o.customer_responded_at,
        o.created_at
      from clinic_booking_slot_offers o
      inner join clinic_booking_requests br
        on br.clinic_id = o.clinic_id
        and br.id = o.booking_request_id
        and br.member_id = $2
      where o.clinic_id = $1
        and o.member_id = $2
        and o.offer_status = any($3::varchar[])
      order by o.created_at desc, o.id desc
      limit 20
    `,
    [clinicId, memberId, Array.from(PUBLIC_SLOT_OFFER_STATUSES)]
  );

  return result.rows.map(mapPublicSlotOffer);
}

async function listPublicConfirmedAppointmentsForMember(client, clinicId, memberId) {
  const result = await client.query(
    `
      select
        id,
        booking_request_id,
        slot_offer_id,
        appointment_date,
        start_time,
        end_time,
        duration_minutes,
        timezone,
        visit_type,
        status,
        source,
        created_at,
        updated_at
      from clinic_confirmed_appointments
      where clinic_id = $1
        and member_id = $2
        and status = any($3::varchar[])
      order by appointment_date desc, start_time desc, id desc
      limit 20
    `,
    [clinicId, memberId, Array.from(PUBLIC_CONFIRMED_APPOINTMENT_STATUSES)]
  );

  return result.rows.map(mapPublicConfirmedAppointment);
}

async function getNextScheduledAppointmentForMember(client, clinicId, memberId) {
  const now = getBangkokNowParts();
  const result = await client.query(
    `
      select
        id,
        booking_request_id,
        slot_offer_id,
        appointment_date,
        start_time,
        end_time,
        duration_minutes,
        timezone,
        visit_type,
        status,
        source,
        created_at,
        updated_at
      from clinic_confirmed_appointments
      where clinic_id = $1
        and member_id = $2
        and status = 'scheduled'
        and (
          appointment_date > $3::date
          or (
            appointment_date = $3::date
            and left(start_time, 5) >= $4
          )
        )
      order by appointment_date asc, start_time asc, id asc
      limit 20
    `,
    [clinicId, memberId, now.date, now.time]
  );

  return findNextScheduledAppointment(result.rows.map(mapPublicConfirmedAppointment));
}

async function listMemberConsentsForPortal(client, clinicId, memberId) {
  const result = await client.query(
    `
      select
        consent_key,
        consent_status,
        consent_source,
        consent_version,
        granted_at,
        revoked_at,
        last_updated_at,
        updated_at
      from clinic_member_consents
      where clinic_id = $1
        and member_id = $2
        and consent_key = any($3::varchar[])
    `,
    [clinicId, memberId, CONSENT_KEYS]
  );

  const rowsByKey = new Map(result.rows.map((row) => [row.consent_key, row]));
  return CONSENT_KEYS.map((key) => mapPublicMemberConsent(rowsByKey.get(key) || defaultMemberConsent(key)));
}

async function upsertMemberConsent(client, clinicId, memberId, update, metadata) {
  const result = await client.query(
    `
      insert into clinic_member_consents (
        clinic_id,
        member_id,
        consent_key,
        consent_status,
        consent_source,
        consent_version,
        granted_at,
        revoked_at,
        last_updated_at,
        metadata_json,
        updated_at
      )
      values (
        $1,
        $2,
        $3,
        $4::varchar,
        'member_portal',
        $5,
        case when $4::varchar = 'granted' then now() else null end,
        case when $4::varchar = 'revoked' then now() else null end,
        now(),
        $6::jsonb,
        now()
      )
      on conflict (clinic_id, member_id, consent_key)
      do update set
        consent_status = excluded.consent_status,
        consent_source = 'member_portal',
        consent_version = excluded.consent_version,
        granted_at = case
          when excluded.consent_status = 'granted' then now()
          else clinic_member_consents.granted_at
        end,
        revoked_at = case
          when excluded.consent_status = 'revoked' then now()
          else null
        end,
        last_updated_at = now(),
        metadata_json = excluded.metadata_json,
        updated_at = now()
      returning
        consent_key,
        consent_status,
        consent_source,
        consent_version,
        granted_at,
        revoked_at,
        last_updated_at,
        updated_at
    `,
    [
      clinicId,
      memberId,
      update.key,
      update.status,
      update.version,
      JSON.stringify(metadata)
    ]
  );

  return mapPublicMemberConsent(result.rows[0]);
}

async function verifyMemberMagicToken(slug, token, requestMeta = {}) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const session = await resolveMemberSessionByToken(slug, token, requestMeta, { client });
    const slotOffers = await listPublicSlotOffersForMember(client, session.clinic.id, Number(session.memberRow.id));
    const confirmedAppointments = await listPublicConfirmedAppointmentsForMember(
      client,
      session.clinic.id,
      Number(session.memberRow.id)
    );
    const nextScheduledAppointment = await getNextScheduledAppointmentForMember(
      client,
      session.clinic.id,
      Number(session.memberRow.id)
    );
    const consents = await listMemberConsentsForPortal(client, session.clinic.id, Number(session.memberRow.id));
    const packages = await listPublicMemberPackagesForMember(client, session.clinic.id, Number(session.memberRow.id));
    const payments = await listPublicPaymentRecordsForMember(client, session.clinic.id, Number(session.memberRow.id));
    const summary = buildMemberPortalSummary({
      bookingRequests: session.bookingRequests,
      slotOffers,
      confirmedAppointments,
      nextScheduledAppointment
    });
    const portal = {
      profile: session.member,
      summary,
      bookingRequests: session.bookingRequests,
      slotOffers,
      confirmedAppointments,
      consents,
      packages,
      payments
    };
    await client.query('commit');

    return {
      success: true,
      member: session.member,
      portal,
      bookingRequests: session.bookingRequests,
      slotOffers,
      confirmedAppointments,
      consents,
      packages,
      payments
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateMemberConsents(slug, body, requestMeta = {}) {
  const normalized = normalizeConsentUpdatePayload(body);
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const session = await resolveMemberSessionByToken(slug, normalized.token, requestMeta, { client });
    const clinicId = session.clinic.id;
    const memberId = Number(session.memberRow.id);
    const meta = getRequestMeta(requestMeta);
    const metadata = {
      requestIpHash: meta.requestIpHash,
      userAgentHash: meta.userAgentHash,
      updatedVia: 'member_portal'
    };

    for (const update of normalized.updates) {
      await upsertMemberConsent(client, clinicId, memberId, update, metadata);
    }

    const summary = {
      source: 'member_portal_consent',
      memberId,
      updatedKeys: normalized.updates.map((update) => update.key),
      statuses: Object.fromEntries(normalized.updates.map((update) => [update.key, update.status])),
      versionProvided: normalized.versionProvided
    };

    await recordMemberAccessEvent(client, clinicId, session.memberRow, 'member_consent.updated', summary);
    await auditMemberAccess(client, clinicId, memberId, 'member_consent.updated', summary);

    const consents = await listMemberConsentsForPortal(client, clinicId, memberId);
    await client.query('commit');

    return {
      success: true,
      consents
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function respondToMemberSlotOffer(slug, offerId, body, requestMeta = {}) {
  const normalizedOfferId = normalizePositiveInteger(offerId, 'offerId');
  const normalized = normalizeSlotOfferResponsePayload(body);
  if (normalized.isBot) {
    return { success: true, botAccepted: true };
  }

  const client = await getPool().connect();
  try {
    await client.query('begin');
    const session = await resolveMemberSessionByToken(slug, normalized.token, requestMeta, { client });
    const clinicId = session.clinic.id;
    const memberId = Number(session.memberRow.id);

    const existingResult = await client.query(
      `
        select
          o.*,
          br.lead_id as booking_lead_id,
          br.member_id as booking_member_id
        from clinic_booking_slot_offers o
        inner join clinic_booking_requests br
          on br.clinic_id = o.clinic_id
          and br.id = o.booking_request_id
          and br.member_id = $3
        where o.clinic_id = $1
          and o.id = $2
          and o.member_id = $3
        for update
      `,
      [clinicId, normalizedOfferId, memberId]
    );

    if (existingResult.rowCount === 0) {
      throw new AppError(404, 'SLOT_OFFER_NOT_FOUND', 'Slot offer not found.');
    }

    const existing = existingResult.rows[0];
    if (existing.customer_response || existing.offer_status === 'accepted' || existing.offer_status === 'declined') {
      const alreadySameResponse = existing.customer_response === normalized.response && existing.offer_status === normalized.response;
      if (!alreadySameResponse) {
        throw new AppError(409, 'SLOT_OFFER_ALREADY_RESPONDED', 'Slot offer has already been responded to.');
      }

      await client.query('commit');
      return {
        success: true,
        offer: mapPublicSlotOffer(existing, { responseOnly: true })
      };
    }

    if (!RESPONDABLE_SLOT_OFFER_STATUSES.has(existing.offer_status)) {
      throw new AppError(409, 'SLOT_OFFER_RESPONSE_NOT_ALLOWED', 'Slot offer response is not allowed for the current status.');
    }

    const nextSlotStatus = normalized.response === 'accepted' ? 'accepted' : 'rejected';
    const updateResult = await client.query(
      `
        update clinic_booking_slot_offers
        set offer_status = $4,
            customer_response = $4,
            customer_response_note = $5,
            customer_responded_at = now(),
            updated_at = now()
        where clinic_id = $1
          and id = $2
          and member_id = $3
        returning
          id,
          booking_request_id,
          offered_date,
          offered_time_window,
          offered_start_time,
          duration_minutes,
          offer_status,
          customer_response,
          customer_responded_at,
          created_at
      `,
      [clinicId, normalizedOfferId, memberId, normalized.response, normalized.note]
    );

    await client.query(
      `
        update clinic_booking_requests
        set slot_status = $4,
            updated_at = now()
        where clinic_id = $1
          and id = $2
          and member_id = $3
      `,
      [clinicId, existing.booking_request_id, memberId, nextSlotStatus]
    );

    const summary = {
      source: 'member_magic_link_slot_offer_response',
      bookingRequestId: Number(existing.booking_request_id),
      offerId: normalizedOfferId,
      memberId,
      leadId: existing.booking_lead_id ? Number(existing.booking_lead_id) : null,
      response: normalized.response,
      noteProvided: Boolean(normalized.note)
    };

    if (existing.booking_lead_id) {
      await client.query(
        `
          insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
          values ($1, $2, $3, $4::jsonb)
        `,
        [
          clinicId,
          existing.booking_lead_id,
          normalized.response === 'accepted'
            ? 'booking_request.slot_offer_customer_accepted'
            : 'booking_request.slot_offer_customer_declined',
          JSON.stringify({ summary })
        ]
      );
    }

    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_booking_slot_offer',
        entityId: normalizedOfferId,
        actionType: normalized.response === 'accepted'
          ? 'clinic_booking_slot_offer.customer_accepted'
          : 'clinic_booking_slot_offer.customer_declined',
        actorUserId: null,
        contextJson: { summary }
      },
      client
    );

    await createNotificationDraftForEvent(
      {
        tenantId: clinicId,
        eventType: normalized.response === 'accepted' ? 'slot_offer.accepted' : 'slot_offer.declined',
        sourceId: normalizedOfferId
      },
      client
    );

    await client.query('commit');

    return {
      success: true,
      offer: mapPublicSlotOffer(updateResult.rows[0], { responseOnly: true })
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  requestMemberMagicLink,
  verifyMemberMagicToken,
  updateMemberConsents,
  respondToMemberSlotOffer,
  mapMemberPublicProfile,
  maskEmail,
  maskPhone,
  maskLineId,
  hashAccessToken,
  createAccessToken,
  findMemberByContact,
  mapPublicBookingRequest,
  mapPublicSlotOffer,
  mapPublicConfirmedAppointment,
  listPublicConfirmedAppointmentsForMember,
  getNextScheduledAppointmentForMember,
  listMemberConsentsForPortal,
  defaultMemberConsent,
  mapPublicMemberConsent,
  normalizeConsentUpdatePayload,
  VALID_CONSENT_KEYS,
  VALID_CONSENT_STATUSES,
  buildMemberPortalSummary,
  resolveMemberSessionByToken
};
