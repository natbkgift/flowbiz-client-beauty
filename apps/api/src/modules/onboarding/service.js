const crypto = require('node:crypto');
const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { toSlug } = require('../../common/slug');
const { hashPassword } = require('../auth/password');
const { createSessionToken } = require('../auth/token');
const { toPublicUser } = require('../users/user-entity');
const { toPublicClinic } = require('../clinics/clinic-entity');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');
const { getLifecycleFlowPresets } = require('../automation/flow-presets');
const { recordAuditLog } = require('../audit/service');
const { normalizeClinicSlug, assertValidClinicSlug } = require('../clinics/validation');

const config = loadConfig();

const DEFAULT_TEMPLATES = [
  {
    channelType: 'line',
    name: 'lead_welcome',
    category: 'followup',
    content: 'สวัสดีค่ะ {{lead.fullName}} ขอบคุณที่สนใจ {{clinic.name}} ทีมงานจะติดต่อกลับเร็วที่สุด',
    variablesJson: { 'lead.fullName': 'string', 'clinic.name': 'string' }
  },
  {
    channelType: 'line',
    name: 'missed_response_follow_up',
    category: 'followup',
    content: 'สวัสดีค่ะ {{lead.fullName}} ทีมงานยังพร้อมช่วยดูแล หากสะดวกสามารถตอบกลับข้อความนี้ได้เลย',
    variablesJson: { 'lead.fullName': 'string' }
  },
  {
    channelType: 'line',
    name: 'viewing_reminder',
    category: 'reminder',
    content: 'เตือนนัด viewing ของคุณ {{lead.fullName}} อีก 2 ชั่วโมงค่ะ หากต้องการเลื่อนนัดแจ้งทีมงานได้ทันที',
    variablesJson: { 'lead.fullName': 'string', viewingAt: 'string' }
  },
  {
    channelType: 'line',
    name: 'post_viewing_follow_up',
    category: 'followup',
    content: 'ขอบคุณที่เข้าชมค่ะ {{lead.fullName}} หากต้องการข้อมูลเพิ่มเติม ทีมงานพร้อมช่วยต่อทันที',
    variablesJson: { 'lead.fullName': 'string' }
  },
  {
    channelType: 'line',
    name: 'dormant_lead_reactivation',
    category: 'reactivation',
    content: 'สวัสดีค่ะ {{lead.fullName}} หากยังสนใจอยู่ ทีมงานมีข้อเสนอใหม่พร้อมอัปเดตให้ค่ะ',
    variablesJson: { 'lead.fullName': 'string' }
  },
  {
    channelType: 'line',
    name: 'negotiation_nurture',
    category: 'followup',
    content: 'ทีมงานเตรียมข้อมูลประกอบการตัดสินใจเพิ่มเติมไว้แล้ว หากต้องการคำแนะนำเพิ่มแจ้งได้เลยค่ะ',
    variablesJson: {}
  },
  {
    channelType: 'line',
    name: 'lost_lead_recovery',
    category: 'reactivation',
    content: 'สวัสดีค่ะ {{lead.fullName}} หากพร้อมกลับมาคุยกันอีกครั้ง ทีมงานมีทางเลือกใหม่ให้พิจารณาค่ะ',
    variablesJson: { 'lead.fullName': 'string' }
  }
];

function createRandomSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

async function ensureUniqueSlug(client, tableName, columnName, preferredSlug) {
  let slug = preferredSlug;
  let counter = 0;

  while (counter < 20) {
    const result = await client.query(`select 1 from ${tableName} where ${columnName} = $1 limit 1`, [slug]);

    if (result.rowCount === 0) {
      return slug;
    }

    counter += 1;
    slug = `${preferredSlug}-${counter}`;
  }

  return `${preferredSlug}-${createRandomSuffix()}`;
}

async function ensureUniqueClinicSlug(client, preferredSlug) {
  let slug = preferredSlug;
  let counter = 0;

  while (counter < 20) {
    const result = await client.query('select 1 from clinics where slug = $1 limit 1', [slug]);

    if (result.rowCount === 0) {
      assertValidClinicSlug(slug);
      return slug;
    }

    counter += 1;
    slug = `${preferredSlug}-${counter}`;
  }

  const finalSlug = `${preferredSlug}-${createRandomSuffix()}`;
  assertValidClinicSlug(finalSlug);
  return finalSlug;
}

function validateSignupPayload(payload) {
  const clinicName = typeof payload.clinicName === 'string' ? payload.clinicName.trim() : '';
  const ownerName = typeof payload.ownerName === 'string' ? payload.ownerName.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const workspaceName = typeof payload.workspaceName === 'string' && payload.workspaceName.trim() ? payload.workspaceName.trim() : 'Main Workspace';

  if (!clinicName || !ownerName || !email || !password) {
    throw new AppError(400, 'INVALID_SIGNUP_PAYLOAD', 'clinicName, ownerName, email and password are required.');
  }

  if (password.length < 8) {
    throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters long.');
  }

  return {
    clinicName,
    ownerName,
    email,
    password,
    workspaceName
  };
}

async function ensureEmailAvailable(client, email) {
  const result = await client.query('select 1 from users where lower(email) = lower($1) limit 1', [email]);

  if (result.rowCount > 0) {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'This email is already registered.');
  }
}

async function createSession(client, userId, clinicId) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.authTokenTtlHours * 60 * 60 * 1000);

  await client.query(
    `
      insert into auth_sessions (id, user_id, clinic_id, expires_at)
      values ($1, $2, $3, $4)
    `,
    [sessionId, userId, clinicId, expiresAt.toISOString()]
  );

  return {
    sessionId,
    expiresAt
  };
}

async function createDefaultTemplates(client, clinicId) {
  const templatesByName = new Map();

  for (const template of DEFAULT_TEMPLATES) {
    const result = await client.query(
      `
        insert into message_templates (clinic_id, channel_type, name, category, language, content, variables_json, approval_status)
        values ($1, $2, $3, $4, 'th', $5, $6::jsonb, 'approved')
        on conflict (clinic_id, channel_type, name)
        do update set
          category = excluded.category,
          content = excluded.content,
          variables_json = excluded.variables_json,
          approval_status = excluded.approval_status,
          updated_at = now()
        returning id, name
      `,
      [clinicId, template.channelType, template.name, template.category, template.content, JSON.stringify(template.variablesJson)]
    );

    templatesByName.set(result.rows[0].name, result.rows[0].id);
  }

  return templatesByName;
}

async function createDefaultFlows(client, clinicId, workspaceId, ownerUserId, templatesByName) {
  for (const preset of getLifecycleFlowPresets()) {
    const flowResult = await client.query(
      `
        insert into automation_flows (
          clinic_id,
          workspace_id,
          name,
          flow_type,
          trigger_type,
          status,
          trigger_event,
          version,
          entry_rule_json,
          definition_json,
          created_by
        )
        values ($1, $2, $3, 'lifecycle', 'event', 'active', $4, 1, $5::jsonb, $6::jsonb, $7)
        on conflict do nothing
        returning id
      `,
      [
        clinicId,
        workspaceId,
        preset.name,
        preset.triggerEvent,
        JSON.stringify({
          presetKey: preset.key,
          eventName: preset.triggerEvent,
          entityType: preset.entityType,
          guardConditions: preset.guardConditions,
          rateLimits: preset.rateLimits
        }),
        JSON.stringify({
          trigger: preset.triggerEvent,
          entityType: preset.entityType,
          conditions: preset.guardConditions,
          rateLimits: preset.rateLimits,
          steps: preset.steps.map((step) => ({
            type: step.engineStepType === 'wait' ? 'delay' : 'action',
            action: step.engineStepType === 'wait' ? undefined : step.engineStepType,
            minutes: step.delayMinutes || null,
            templateName: step.templateName || null,
            title: step.title || null,
            taskType: step.taskType || null,
            dueInMinutes: step.dueInMinutes || null,
            dueAtFromContextField: step.dueAtFromContextField || null,
            dueOffsetMinutes: step.dueOffsetMinutes || null,
            scheduledAfterMinutes: step.scheduledAfterMinutes || null,
            scheduledAtFromContextField: step.scheduledFromContextField || null,
            scheduledOffsetMinutes: step.scheduledOffsetMinutes || null,
            assignedUserField: step.assignedUserField || null,
            guardConditions: step.guardConditions || {},
            blocking: step.blocking === undefined ? true : step.blocking
          }))
        }),
        ownerUserId
      ]
    );

    let flowId = flowResult.rows[0]?.id;

    if (!flowId) {
      const existingFlow = await client.query(
        `
          select id
          from automation_flows
          where clinic_id = $1 and entry_rule_json->>'presetKey' = $2
          limit 1
        `,
        [clinicId, preset.key]
      );

      flowId = existingFlow.rows[0]?.id;
    }

    if (!flowId) {
      continue;
    }

    await client.query('delete from automation_steps where flow_id = $1', [flowId]);

    for (let index = 0; index < preset.steps.length; index += 1) {
      const step = preset.steps[index];
      await client.query(
        `
          insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
          values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          clinicId,
          flowId,
          index + 1,
          step.engineStepType,
          step.delayMinutes || null,
          JSON.stringify({
            logicalStepType: step.logicalStepType,
            templateId: step.templateName ? templatesByName.get(step.templateName) || null : null,
            title: step.title || null,
            description: step.description || null,
            taskType: step.taskType || null,
            dueInMinutes: step.dueInMinutes || null,
            dueAtFromContextField: step.dueAtFromContextField || null,
            dueOffsetMinutes: step.dueOffsetMinutes || null,
            scheduledAfterMinutes: step.scheduledAfterMinutes || null,
            scheduledAtFromContextField: step.scheduledFromContextField || null,
            scheduledOffsetMinutes: step.scheduledOffsetMinutes || null,
            assignedUserField: step.assignedUserField || null,
            guardConditions: step.guardConditions || {},
            blocking: step.blocking === undefined ? true : step.blocking
          })
        ]
      );
    }
  }
}

async function bootstrapTenantDefaults(client, clinicId, workspaceId, ownerUserId) {
  const templatesByName = await createDefaultTemplates(client, clinicId);
  await createDefaultFlows(client, clinicId, workspaceId, ownerUserId, templatesByName);
}

async function signup(payload) {
  const normalized = validateSignupPayload(payload);
  const client = await getPool().connect();

  await client.query('begin');

  try {
    await ensureEmailAvailable(client, normalized.email);

    const preferredClinicSlug = normalizeClinicSlug(normalized.clinicName) || 'tenant';
    assertValidClinicSlug(preferredClinicSlug);
    const clinicSlug = await ensureUniqueClinicSlug(client, preferredClinicSlug);
    const organizationSlug = await ensureUniqueSlug(client, 'organizations', 'slug', `${clinicSlug}-org`);
    const workspaceSlug = await ensureUniqueSlug(client, 'workspaces', 'slug', toSlug(normalized.workspaceName, 'main-workspace'));
    const passwordHash = hashPassword(normalized.password, crypto.randomBytes(16).toString('hex'));

    const clinicResult = await client.query(
      `
        insert into clinics (name, slug, plan, status, timezone)
        values ($1, $2, 'starter', 'active', 'Asia/Bangkok')
        returning *
      `,
      [normalized.clinicName, clinicSlug]
    );

    const clinic = clinicResult.rows[0];

    const organizationResult = await client.query(
      `
        insert into organizations (clinic_id, name, slug, status)
        values ($1, $2, $3, 'active')
        returning *
      `,
      [clinic.id, `${normalized.clinicName} Organization`, organizationSlug]
    );

    const workspaceResult = await client.query(
      `
        insert into workspaces (clinic_id, organization_id, name, slug, status)
        values ($1, $2, $3, $4, 'active')
        returning *
      `,
      [clinic.id, organizationResult.rows[0].id, normalized.workspaceName, workspaceSlug]
    );

    const userResult = await client.query(
      `
        insert into users (email, name, password_hash, status)
        values ($1, $2, $3, 'active')
        returning *
      `,
      [normalized.email, normalized.ownerName, passwordHash]
    );

    const roleResult = await client.query(`select id from roles where key = 'owner' limit 1`);
    const ownerRoleId = roleResult.rows[0]?.id;

    if (!ownerRoleId) {
      throw new AppError(500, 'RBAC_NOT_READY', 'Owner role is missing from RBAC setup.');
    }

    await client.query(
      `
        insert into clinic_users (clinic_id, user_id, organization_id, workspace_id, role, role_id, status)
        values ($1, $2, $3, $4, 'owner', $5, 'active')
      `,
      [clinic.id, userResult.rows[0].id, organizationResult.rows[0].id, workspaceResult.rows[0].id, ownerRoleId]
    );

    await client.query(
      `
        insert into workspace_memberships (
          clinic_id,
          organization_id,
          workspace_id,
          user_id,
          role_id,
          status,
          invited_by,
          invited_at,
          joined_at
        )
        values ($1, $2, $3, $4, $5, 'active', $4, now(), now())
      `,
      [clinic.id, organizationResult.rows[0].id, workspaceResult.rows[0].id, userResult.rows[0].id, ownerRoleId]
    );

    await bootstrapTenantDefaults(client, clinic.id, workspaceResult.rows[0].id, userResult.rows[0].id);

    await recordAuditLog(
      {
        clinicId: clinic.id,
        entityType: 'tenant',
        entityId: clinic.id,
        actionType: 'tenant.created',
        actorUserId: userResult.rows[0].id,
        contextJson: {
          clinicSlug,
          organizationId: organizationResult.rows[0].id,
          workspaceId: workspaceResult.rows[0].id,
          ownerEmail: normalized.email
        }
      },
      client
    );

    const session = await createSession(client, userResult.rows[0].id, clinic.id);
    await client.query('commit');

    const memberships = await getMembershipsByUserId(userResult.rows[0].id);
    const currentMembership = resolveMembership(memberships, { clinicId: clinic.id });
    const token = createSessionToken(
      {
        userId: userResult.rows[0].id,
        clinicId: clinic.id,
        sessionId: session.sessionId
      },
      config.authTokenSecret,
      config.authTokenTtlHours
    );

    return {
      token,
      user: toPublicUser(userResult.rows[0]),
      currentClinic: toPublicClinic(clinic),
      currentOrganization: currentMembership.organization,
      currentWorkspace: currentMembership.workspace,
      currentMembership: {
        clinicId: currentMembership.clinicId,
        organizationId: currentMembership.organizationId,
        workspaceId: currentMembership.workspaceId,
        role: currentMembership.role,
        status: currentMembership.status,
        permissions: currentMembership.permissions
      },
      memberships: memberships.map((membership) => ({
        clinicId: membership.clinicId,
        organizationId: membership.organizationId,
        workspaceId: membership.workspaceId,
        role: membership.role,
        status: membership.status,
        permissions: membership.permissions,
        clinic: membership.clinic,
        organization: membership.organization,
        workspace: membership.workspace
      }))
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  signup,
  validateSignupPayload,
  bootstrapTenantDefaults
};