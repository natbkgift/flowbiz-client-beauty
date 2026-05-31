'use strict';

const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { resolvePublicClinicBySlug } = require('../public-content/clinic-resolver');

const GENERIC_REQUEST_MESSAGE = 'หากพบข้อมูลสมาชิก ระบบจะส่งลิงก์เข้าใช้งานให้ตามช่องทางที่ระบุ';
const VALID_CHANNELS = new Set(['email', 'phone', 'line']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_SLOT_OFFER_STATUSES = new Set(['ready_to_send', 'sent', 'accepted', 'declined']);
const RESPONDABLE_SLOT_OFFER_STATUSES = new Set(['ready_to_send', 'sent']);
const VALID_SLOT_OFFER_RESPONSES = new Set(['accepted', 'declined']);

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

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
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

async function verifyMemberMagicToken(slug, token, requestMeta = {}) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const session = await resolveMemberSessionByToken(slug, token, requestMeta, { client });
    const slotOffers = await listPublicSlotOffersForMember(client, session.clinic.id, Number(session.memberRow.id));
    await client.query('commit');

    return {
      success: true,
      member: session.member,
      bookingRequests: session.bookingRequests,
      slotOffers
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
  resolveMemberSessionByToken
};
