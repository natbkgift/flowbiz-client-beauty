'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { resolvePublicClinicBySlug } = require('../public-content/clinic-resolver');

const VALID_INTEREST_TYPES = new Set(['service', 'promotion', 'package', 'general']);
const VALID_PUBLIC_SOURCES = new Set(['clinic_public_website']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimString(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_PUBLIC_LEAD_PAYLOAD', 'Expected string field.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function rejectClinicOverride(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_PUBLIC_LEAD_PAYLOAD', 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, 'INVALID_PUBLIC_LEAD_PAYLOAD', 'clinicId cannot be supplied for public lead capture.');
  }
}

function normalizeInterestId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_INTEREST', 'interestId must be a positive integer.');
  }
  return parsed;
}

function validatePublicLeadPayload(body) {
  rejectClinicOverride(body);

  const honeypot = trimString(body.honeypot, 200);
  if (honeypot) {
    return { isBot: true };
  }

  if (body.consentAccepted !== true) {
    throw new AppError(400, 'CONSENT_REQUIRED', 'consentAccepted must be true.');
  }

  const name = trimString(body.name, 120);
  const phone = trimString(body.phone, 40);
  const email = trimString(body.email, 160);
  const lineId = trimString(body.lineId, 80);
  const message = trimString(body.message, 1000);

  if (!phone && !email && !lineId) {
    throw new AppError(400, 'CONTACT_REQUIRED', 'At least one contact method is required.');
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'INVALID_PUBLIC_LEAD_EMAIL', 'Invalid email format.');
  }

  const interestType = trimString(body.interestType, 40) || 'general';
  if (!VALID_INTEREST_TYPES.has(interestType)) {
    throw new AppError(400, 'INVALID_INTEREST', 'Invalid interestType.');
  }

  const source = trimString(body.source, 80) || 'clinic_public_website';
  if (!VALID_PUBLIC_SOURCES.has(source)) {
    throw new AppError(400, 'INVALID_PUBLIC_LEAD_PAYLOAD', 'Invalid public lead source.');
  }

  return {
    isBot: false,
    name,
    phone,
    email,
    lineId,
    interestType,
    interestId: normalizeInterestId(body.interestId),
    message,
    source
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
    [
      clinic.id,
      `${clinic.name} Organization`,
      `${clinic.slug}-organization-${clinic.id}`
    ]
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
      interestName: `${payload.interestType} inquiry`
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
    throw new AppError(400, 'INVALID_INTEREST', 'Interest item is not available for this clinic.');
  }

  return {
    interestType: payload.interestType,
    interestId: payload.interestId,
    interestName: result.rows[0].name
  };
}

function buildNotesSummary(payload, interest) {
  const parts = [
    'Public clinic website lead',
    `interest=${interest.interestType}${interest.interestId ? `:${interest.interestId}` : ''}`
  ];
  if (payload.message) {
    parts.push(`message=${payload.message}`);
  }
  return parts.join('\n').slice(0, 2000);
}

async function createPublicClinicLead(slug, body) {
  const normalized = validatePublicLeadPayload(body);
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
    const sourceRef = `public:${Date.now()}:${randomUUID()}`;
    const displayName = normalized.name || 'ไม่ระบุชื่อ';

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
        normalized.phone,
        normalized.lineId,
        normalized.email,
        buildNotesSummary(normalized, interest)
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

    if (normalized.message) {
      await client.query(
        `
          insert into lead_notes (clinic_id, lead_id, author_user_id, note_type, content)
          values ($1, $2, null, 'public_lead_message', $3)
        `,
        [scope.clinicId, leadId, normalized.message]
      );
      await client.query(
        `
          insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
          values ($1, 'lead', $2, null, 'public_lead_message', $3)
        `,
        [scope.clinicId, leadId, normalized.message]
      );
    }

    const summary = {
      source: 'public_lead_capture',
      publicSource: normalized.source,
      clinicId: scope.clinicId,
      leadId,
      interestType: interest.interestType,
      interestId: interest.interestId,
      hasPhone: Boolean(normalized.phone),
      hasEmail: Boolean(normalized.email),
      hasLineId: Boolean(normalized.lineId)
    };

    await client.query(
      `
        insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
        values ($1, $2, 'lead.created', $3::jsonb)
      `,
      [scope.clinicId, leadId, JSON.stringify({ summary })]
    );

    await recordAuditLog(
      {
        clinicId: scope.clinicId,
        entityType: 'lead',
        entityId: leadId,
        actionType: 'public_lead.created',
        actorUserId: null,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');

    return {
      success: true,
      leadId,
      message: 'ขอบคุณค่ะ ทีมงานจะติดต่อกลับโดยเร็วที่สุด'
    };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createPublicClinicLead,
  validatePublicLeadPayload
};
