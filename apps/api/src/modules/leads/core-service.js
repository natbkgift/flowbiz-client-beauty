const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { normalizeRoleKey } = require('../rbac/service');
const { getMembershipsByUserId, resolveMembership } = require('../tenancy/service');
const {
  LEAD_STAGES,
  LEAD_STAGE_TRANSITIONS,
  LEGACY_LEAD_STATUS_ALIASES
} = require('./constants');
const {
  validateLeadPayload,
  validateLeadNotePayload,
  validateLeadTagPayload,
  validateLeadOwnerPayload,
  validateLeadStageStatusPayload,
  validateLeadStageTransitionPayload,
  parseLeadListFilters
} = require('./validation');
const { toLeadSummary, toLeadDetail } = require('./lead-entity');
const { recordAuditLog } = require('../audit/service');
const { publishDomainEvent } = require('../event-bus/publisher');

function normalizeLegacyStatus(status) {
  return LEGACY_LEAD_STATUS_ALIASES[status] || status;
}

async function ensureDefaultLeadScope(client, clinicContext) {
  const clinicUserResult = await client.query(
    `
      select cu.role, cu.role_id, cu.organization_id, cu.workspace_id, c.name as clinic_name, c.slug as clinic_slug
      from clinic_users cu
      inner join clinics c on c.id = cu.clinic_id
      where cu.clinic_id = $1 and cu.user_id = $2 and cu.status = 'active'
      limit 1
    `,
    [clinicContext.currentClinic.id, clinicContext.currentUser.id]
  );

  if (clinicUserResult.rowCount === 0) {
    throw new AppError(403, 'WORKSPACE_SCOPE_REQUIRED', 'Lead actions require an active workspace membership.');
  }

  const clinicUser = clinicUserResult.rows[0];
  let organizationId = clinicUser.organization_id;
  let workspaceId = clinicUser.workspace_id;
  let roleId = clinicUser.role_id;

  if (!organizationId) {
    const organizationResult = await client.query(
      `
        insert into organizations (clinic_id, name, slug, status)
        values ($1, $2, $3, 'active')
        on conflict (clinic_id)
        do update set name = excluded.name, updated_at = now()
        returning id
      `,
      [
        clinicContext.currentClinic.id,
        `${clinicUser.clinic_name} Organization`,
        `${clinicUser.clinic_slug}-organization-${clinicContext.currentClinic.id}`
      ]
    );
    organizationId = organizationResult.rows[0].id;
  }

  if (!workspaceId) {
    const workspaceResult = await client.query(
      `
        insert into workspaces (clinic_id, organization_id, name, slug, status)
        values ($1, $2, 'Main Workspace', 'main-workspace', 'active')
        on conflict (clinic_id, slug)
        do update set organization_id = excluded.organization_id, updated_at = now()
        returning id
      `,
      [clinicContext.currentClinic.id, organizationId]
    );
    workspaceId = workspaceResult.rows[0].id;
  }

  if (!roleId) {
    const roleResult = await client.query('select id from roles where key = $1 limit 1', [normalizeRoleKey(clinicUser.role)]);
    roleId = roleResult.rows[0]?.id || null;
  }

  await client.query(
    `
      update clinic_users
      set organization_id = $3,
          workspace_id = $4,
          role_id = coalesce($5, role_id),
          updated_at = now()
      where clinic_id = $1 and user_id = $2
    `,
    [clinicContext.currentClinic.id, clinicContext.currentUser.id, organizationId, workspaceId, roleId]
  );

  if (roleId) {
    const membershipResult = await client.query(
      `
        update workspace_memberships
        set organization_id = $2,
            role_id = $5,
            status = 'active',
            updated_at = now()
        where clinic_id = $1 and workspace_id = $3 and user_id = $4
        returning id
      `,
      [clinicContext.currentClinic.id, organizationId, workspaceId, clinicContext.currentUser.id, roleId]
    );

    if (membershipResult.rowCount === 0) {
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
        [clinicContext.currentClinic.id, organizationId, workspaceId, clinicContext.currentUser.id, roleId]
      );
    }
  }

  return {
    organizationId,
    workspaceId
  };
}

async function resolveLeadScope(client, clinicContext) {
  if (!clinicContext?.currentClinic?.id || !clinicContext?.currentUser?.id) {
    throw new AppError(400, 'INVALID_CONTEXT', 'Lead actions require clinic and user context.');
  }

  if (clinicContext.currentWorkspace?.id && clinicContext.currentOrganization?.id) {
    return {
      clinicId: clinicContext.currentClinic.id,
      organizationId: clinicContext.currentOrganization.id,
      workspaceId: clinicContext.currentWorkspace.id
    };
  }

  const memberships = await getMembershipsByUserId(clinicContext.currentUser.id);
  const currentMembership = memberships.length > 0
    ? resolveMembership(memberships, { clinicId: clinicContext.currentClinic.id })
    : null;

  if (currentMembership?.workspaceId && currentMembership?.organizationId) {
    return {
      clinicId: clinicContext.currentClinic.id,
      organizationId: currentMembership.organizationId,
      workspaceId: currentMembership.workspaceId
    };
  }

  const ensuredScope = await ensureDefaultLeadScope(client, clinicContext);

  return {
    clinicId: clinicContext.currentClinic.id,
    organizationId: ensuredScope.organizationId,
    workspaceId: ensuredScope.workspaceId
  };
}

async function resolveLeadScopeOrClinic(client, scopeOrClinic) {
  if (typeof scopeOrClinic === 'number') {
    const workspaceResult = await client.query(
      `
        select w.id as workspace_id, w.organization_id
        from workspaces w
        where w.clinic_id = $1
        order by w.id asc
        limit 1
      `,
      [scopeOrClinic]
    );

    return {
      clinicId: scopeOrClinic,
      organizationId: workspaceResult.rows[0]?.organization_id || null,
      workspaceId: workspaceResult.rows[0]?.workspace_id || null
    };
  }

  return resolveLeadScope(client, scopeOrClinic);
}

async function assertAssignableUser(client, scope, userId) {
  if (!userId) {
    return null;
  }

  const result = await client.query(
    `
      select u.id, u.name
      from users u
      where u.id = $2
        and u.status = 'active'
        and (
          exists (
            select 1
            from workspace_memberships wm
            where wm.clinic_id = $1
              and wm.workspace_id = $3
              and wm.user_id = $2
              and wm.status = 'active'
          )
          or exists (
            select 1
            from clinic_users cu
            where cu.clinic_id = $1
              and cu.workspace_id = $3
              and cu.user_id = $2
              and cu.status = 'active'
          )
        )
      limit 1
    `,
    [scope.clinicId, userId, scope.workspaceId]
  );

  if (result.rowCount === 0) {
    throw new AppError(400, 'INVALID_OWNER', 'ownerUserId must belong to the current workspace.');
  }

  return result.rows[0];
}

async function findLeadRow(client, scope, leadId) {
  const values = [scope.clinicId, leadId];
  const clauses = ['l.clinic_id = $1', 'l.id = $2'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`l.workspace_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select
        l.*, u.name as owner_name
      from leads l
      left join users u on u.id = l.owner_user_id
      where ${clauses.join(' and ')}
      limit 1
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  return result.rows[0];
}

async function syncLeadInterests(client, clinicId, leadId, interests) {
  if (interests === undefined) {
    return;
  }

  await client.query('delete from lead_interests where clinic_id = $1 and lead_id = $2', [clinicId, leadId]);

  for (const interest of interests) {
    await client.query(
      `
        insert into lead_interests (
          clinic_id,
          lead_id,
          interest_type,
          interest_name,
          priority,
          budget_min,
          budget_max,
          urgency
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        clinicId,
        leadId,
        interest.interestType,
        interest.interestName,
        interest.priority,
        interest.budgetMin,
        interest.budgetMax,
        interest.urgency
      ]
    );
  }
}

async function ensureLeadTag(client, clinicId, tagName, color = '#C8B27D') {
  const leadTagResult = await client.query(
    `
      insert into lead_tags (clinic_id, name, color)
      values ($1, $2, $3)
      on conflict (clinic_id, name)
      do update set color = excluded.color, updated_at = now()
      returning id, name, color
    `,
    [clinicId, tagName, color]
  );

  const legacyTagResult = await client.query(
    `
      insert into tags (clinic_id, name, color)
      values ($1, $2, $3)
      on conflict (clinic_id, name)
      do update set color = excluded.color, updated_at = now()
      returning id
    `,
    [clinicId, tagName, color]
  );

  return {
    leadTagId: leadTagResult.rows[0].id,
    legacyTagId: legacyTagResult.rows[0].id,
    name: leadTagResult.rows[0].name,
    color: leadTagResult.rows[0].color
  };
}

async function linkLeadTag(client, clinicId, leadId, tagIds) {
  const leadLinkResult = await client.query(
    `
      insert into lead_tag_links (clinic_id, lead_id, tag_id)
      values ($1, $2, $3)
      on conflict (clinic_id, lead_id, tag_id)
      do nothing
      returning id
    `,
    [clinicId, leadId, tagIds.leadTagId]
  );

  await client.query(
    `
      insert into entity_tags (clinic_id, tag_id, entity_type, entity_id)
      values ($1, $2, 'lead', $3)
      on conflict (clinic_id, tag_id, entity_type, entity_id)
      do nothing
    `,
    [clinicId, tagIds.legacyTagId, leadId]
  );

  return leadLinkResult.rowCount > 0;
}

async function syncLeadTags(client, clinicId, leadId, tagNames) {
  if (tagNames === undefined) {
    return;
  }

  await client.query('delete from lead_tag_links where clinic_id = $1 and lead_id = $2', [clinicId, leadId]);
  await client.query(
    `
      delete from entity_tags
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2
    `,
    [clinicId, leadId]
  );

  for (const tagName of tagNames) {
    const tagIds = await ensureLeadTag(client, clinicId, tagName);
    await linkLeadTag(client, clinicId, leadId, tagIds);
  }
}

async function addLeadNoteRecord(client, clinicId, leadId, authorUserId, notePayload) {
  const leadNoteResult = await client.query(
    `
      insert into lead_notes (clinic_id, lead_id, author_user_id, note_type, content)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [clinicId, leadId, authorUserId, notePayload.noteType, notePayload.content]
  );

  await client.query(
    `
      insert into notes (clinic_id, entity_type, entity_id, author_user_id, note_type, content)
      values ($1, 'lead', $2, $3, $4, $5)
    `,
    [clinicId, leadId, authorUserId, notePayload.noteType, notePayload.content]
  );

  return leadNoteResult.rows[0];
}

async function recordLeadActivity(client, clinicId, leadId, eventType, eventDataJson) {
  const result = await client.query(
    `
      insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
      values ($1, $2, $3, $4::jsonb)
      returning *
    `,
    [clinicId, leadId, eventType, JSON.stringify(eventDataJson || {})]
  );

  return {
    id: result.rows[0].id,
    clinicId: result.rows[0].clinic_id,
    leadId: result.rows[0].lead_id,
    eventType: result.rows[0].event_type,
    eventDataJson: result.rows[0].event_data_json,
    createdAt: result.rows[0].created_at
  };
}

async function getLeadRelatedData(client, clinicId, leadId) {
  const [interestsResult, notesResult, tagsResult, activityResult] = await Promise.all([
    client.query(
      `
        select id, interest_type, interest_name, priority, budget_min, budget_max, urgency, created_at, updated_at
        from lead_interests
        where clinic_id = $1 and lead_id = $2
        order by id asc
      `,
      [clinicId, leadId]
    ),
    client.query(
      `
        select ln.id, ln.note_type, ln.content, ln.created_at, ln.updated_at, u.id as author_user_id, u.name as author_name
        from lead_notes ln
        left join users u on u.id = ln.author_user_id
        where ln.clinic_id = $1 and ln.lead_id = $2
        order by ln.id asc
      `,
      [clinicId, leadId]
    ),
    client.query(
      `
        select lt.id, lt.name, lt.color
        from lead_tag_links ltl
        inner join lead_tags lt on lt.id = ltl.tag_id
        where ltl.clinic_id = $1 and ltl.lead_id = $2
        order by lt.name asc
      `,
      [clinicId, leadId]
    ),
    client.query(
      `
        select id, event_type, event_data_json, created_at
        from lead_activity
        where clinic_id = $1 and lead_id = $2
        order by created_at desc, id desc
      `,
      [clinicId, leadId]
    )
  ]);

  return {
    interests: interestsResult.rows.map((row) => ({
      id: row.id,
      interestType: row.interest_type,
      interestName: row.interest_name,
      priority: row.priority,
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      urgency: row.urgency,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    notes: notesResult.rows.map((row) => ({
      id: row.id,
      noteType: row.note_type,
      content: row.content,
      authorUserId: row.author_user_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    tags: tagsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color
    })),
    activityTimeline: activityResult.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      eventDataJson: row.event_data_json,
      createdAt: row.created_at
    }))
  };
}

function buildAuditContext(scope, actorUserId, entityId, extra = {}) {
  return {
    clinic_id: scope.clinicId,
    organization_id: scope.organizationId,
    workspace_id: scope.workspaceId,
    actor_user_id: actorUserId,
    entity_id: entityId,
    timestamp: new Date().toISOString(),
    ...extra
  };
}

async function recordLeadAuditAction(client, scope, leadId, actionType, actorUserId, extra, legacyActionType) {
  await recordAuditLog(
    {
      clinicId: scope.clinicId,
      entityType: 'lead',
      entityId: leadId,
      actionType,
      actorUserId,
      contextJson: buildAuditContext(scope, actorUserId, leadId, extra)
    },
    client
  );

  if (legacyActionType) {
    await recordAuditLog(
      {
        clinicId: scope.clinicId,
        entityType: 'lead',
        entityId: leadId,
        actionType: legacyActionType,
        actorUserId,
        contextJson: buildAuditContext(scope, actorUserId, leadId, extra)
      },
      client
    );
  }
}

async function publishLeadEventSafe(scope, eventType, leadId, payloadJson) {
  try {
    await publishDomainEvent({
      clinicId: scope.clinicId,
      eventType,
      entityType: 'lead',
      entityId: leadId,
      payloadJson
    });
  } catch (error) {
    console.error(`Event bus ${eventType} publish failed:`, error.message);
  }
}

function deriveLeadStatus(previousStatus, nextStage, explicitStatus) {
  if (explicitStatus) {
    return normalizeLegacyStatus(explicitStatus);
  }

  if (nextStage === 'converted') {
    return 'converted';
  }

  if (nextStage === 'lost') {
    return 'lost';
  }

  const currentStatus = normalizeLegacyStatus(previousStatus);

  if (currentStatus === 'converted' || currentStatus === 'lost') {
    return 'active';
  }

  if (currentStatus === 'new' && nextStage !== 'inquiry') {
    return 'active';
  }

  return currentStatus || 'new';
}

function assertStageTransition(currentStage, nextStage) {
  if (currentStage === nextStage) {
    return;
  }

  const allowed = LEAD_STAGE_TRANSITIONS[currentStage] || [];

  if (!allowed.includes(nextStage)) {
    throw new AppError(400, 'INVALID_STAGE_TRANSITION', `Cannot move lead from ${currentStage} to ${nextStage}.`);
  }
}

async function createLead(clinicContext, payload) {
  const client = await getPool().connect();
  let clientReleased = false;
  const normalized = validateLeadPayload(payload, { partial: false });

  await client.query('begin');

  try {
    const scope = await resolveLeadScope(client, clinicContext);
    await assertAssignableUser(client, scope, normalized.ownerUserId);

    const result = await client.query(
      `
        insert into leads (
          clinic_id,
          organization_id,
          workspace_id,
          source,
          source_ref,
          full_name,
          nickname,
          phone,
          line_user_id,
          email,
          gender,
          birth_date,
          status,
          stage,
          owner_user_id,
          last_contacted_at,
          next_followup_at,
          intent_score,
          budget_range,
          preferred_branch,
          notes_summary
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        returning *
      `,
      [
        scope.clinicId,
        scope.organizationId,
        scope.workspaceId,
        normalized.source,
        normalized.sourceRef,
        normalized.fullName,
        normalized.nickname,
        normalized.phone,
        normalized.lineUserId,
        normalized.email,
        normalized.gender,
        normalized.birthDate,
        normalized.status,
        normalized.stage,
        normalized.ownerUserId,
        normalized.lastContactedAt,
        normalized.nextFollowupAt,
        normalized.intentScore,
        normalized.budgetRange,
        normalized.preferredBranch,
        normalized.notesSummary
      ]
    );

    const lead = result.rows[0];
    await syncLeadInterests(client, scope.clinicId, lead.id, normalized.interests || []);
    await syncLeadTags(client, scope.clinicId, lead.id, normalized.tagNames || []);
    await recordLeadActivity(client, scope.clinicId, lead.id, 'lead.created', {
      source: lead.source,
      status: normalizeLegacyStatus(lead.status),
      stage: lead.stage,
      actorUserId: clinicContext.currentUser.id
    });

    if (normalized.initialNote) {
      await addLeadNoteRecord(client, scope.clinicId, lead.id, clinicContext.currentUser.id, {
        noteType: 'general',
        content: normalized.initialNote
      });
      await recordLeadActivity(client, scope.clinicId, lead.id, 'lead.note_added', {
        actorUserId: clinicContext.currentUser.id,
        content: normalized.initialNote
      });
    }

    await recordLeadAuditAction(
      client,
      scope,
      lead.id,
      'lead.created',
      clinicContext.currentUser.id,
      {
        source: lead.source,
        status: normalizeLegacyStatus(lead.status),
        stage: lead.stage
      },
      'lead.create'
    );

    await client.query('commit');
    client.release();
    clientReleased = true;

    await publishLeadEventSafe(scope, 'lead.created', lead.id, {
      source: lead.source,
      status: normalizeLegacyStatus(lead.status),
      stage: lead.stage,
      actorUserId: clinicContext.currentUser.id,
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId
    });

    return getLeadDetail(clinicContext, lead.id);
  } catch (error) {
    if (!clientReleased) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

async function listLeads(scopeOrClinic, searchParams) {
  const client = getPool();
  const scope = await resolveLeadScopeOrClinic(client, scopeOrClinic);
  const filters = parseLeadListFilters(searchParams);
  const clauses = ['l.clinic_id = $1'];
  const values = [scope.clinicId];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`l.workspace_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`l.status = $${values.length}`);
  }

  if (filters.stage) {
    values.push(filters.stage);
    clauses.push(`l.stage = $${values.length}`);
  }

  if (filters.ownerUserId) {
    values.push(filters.ownerUserId);
    clauses.push(`l.owner_user_id = $${values.length}`);
  }

  if (filters.tag) {
    values.push(filters.tag.toLowerCase());
    clauses.push(
      `exists (
        select 1
        from lead_tag_links ltl
        inner join lead_tags lt on lt.id = ltl.tag_id
        where ltl.clinic_id = l.clinic_id
          and ltl.lead_id = l.id
          and lower(lt.name) = $${values.length}
      )`
    );
  }

  if (filters.createdFrom) {
    values.push(filters.createdFrom);
    clauses.push(`l.created_at >= $${values.length}`);
  }

  if (filters.createdTo) {
    values.push(filters.createdTo);
    clauses.push(`l.created_at <= $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search.toLowerCase()}%`);
    clauses.push(`(lower(l.full_name) like $${values.length} or lower(coalesce(l.phone, '')) like $${values.length} or lower(coalesce(l.email, '')) like $${values.length})`);
  }

  values.push(filters.limit);

  const result = await client.query(
    `
      select l.*, u.name as owner_name
      from leads l
      left join users u on u.id = l.owner_user_id
      where ${clauses.join(' and ')}
      order by l.updated_at desc, l.id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(toLeadSummary),
    filters
  };
}

async function getLeadDetail(scopeOrClinic, leadId) {
  const client = getPool();
  const scope = await resolveLeadScopeOrClinic(client, scopeOrClinic);
  const leadRow = await findLeadRow(client, scope, leadId);
  const related = await getLeadRelatedData(client, scope.clinicId, leadId);
  return toLeadDetail(leadRow, related);
}

async function updateLead(clinicContext, leadId, payload) {
  const client = await getPool().connect();
  let clientReleased = false;
  const normalized = validateLeadPayload(payload, { partial: true });

  await client.query('begin');

  try {
    const scope = await resolveLeadScope(client, clinicContext);
    const existingLead = await findLeadRow(client, scope, leadId);
    await assertAssignableUser(client, scope, normalized.ownerUserId);

    const setClauses = [];
    const values = [scope.clinicId, leadId, scope.workspaceId];
    const mappings = [
      ['source', 'source'],
      ['source_ref', 'sourceRef'],
      ['full_name', 'fullName'],
      ['nickname', 'nickname'],
      ['phone', 'phone'],
      ['line_user_id', 'lineUserId'],
      ['email', 'email'],
      ['gender', 'gender'],
      ['birth_date', 'birthDate'],
      ['status', 'status'],
      ['stage', 'stage'],
      ['owner_user_id', 'ownerUserId'],
      ['last_contacted_at', 'lastContactedAt'],
      ['next_followup_at', 'nextFollowupAt'],
      ['intent_score', 'intentScore'],
      ['budget_range', 'budgetRange'],
      ['preferred_branch', 'preferredBranch'],
      ['notes_summary', 'notesSummary']
    ];

    for (const [columnName, payloadKey] of mappings) {
      if (Object.prototype.hasOwnProperty.call(normalized, payloadKey)) {
        values.push(normalized[payloadKey]);
        setClauses.push(`${columnName} = $${values.length}`);
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = now()');
      await client.query(
        `
          update leads
          set ${setClauses.join(', ')}
          where clinic_id = $1 and id = $2 and workspace_id = $3
        `,
        values
      );
    }

    await syncLeadInterests(client, scope.clinicId, leadId, normalized.interests);
    await syncLeadTags(client, scope.clinicId, leadId, normalized.tagNames);

    if (Object.prototype.hasOwnProperty.call(normalized, 'ownerUserId') && normalized.ownerUserId !== existingLead.owner_user_id) {
      await recordLeadActivity(client, scope.clinicId, leadId, 'lead.assigned', {
        previousOwnerUserId: existingLead.owner_user_id,
        nextOwnerUserId: normalized.ownerUserId,
        actorUserId: clinicContext.currentUser.id
      });

      await publishLeadEventSafe(scope, 'lead.assigned', leadId, {
        previousOwnerUserId: existingLead.owner_user_id,
        nextOwnerUserId: normalized.ownerUserId,
        actorUserId: clinicContext.currentUser.id,
        workspaceId: scope.workspaceId,
        organizationId: scope.organizationId
      });
    }

    await recordLeadAuditAction(client, scope, leadId, 'lead.updated', clinicContext.currentUser.id, {
      updatedFields: Object.keys(normalized)
    });

    await client.query('commit');
    client.release();
    clientReleased = true;

    await publishLeadEventSafe(scope, 'lead.updated', leadId, {
      updatedFields: Object.keys(normalized),
      actorUserId: clinicContext.currentUser.id,
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId
    });

    return getLeadDetail(clinicContext, leadId);
  } catch (error) {
    if (!clientReleased) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

async function addLeadNote(clinicContext, leadId, payload) {
  const client = await getPool().connect();
  const notePayload = validateLeadNotePayload(payload);

  await client.query('begin');

  try {
    const scope = await resolveLeadScope(client, clinicContext);
    await findLeadRow(client, scope, leadId);
    await addLeadNoteRecord(client, scope.clinicId, leadId, clinicContext.currentUser.id, notePayload);
    await recordLeadActivity(client, scope.clinicId, leadId, 'lead.note_added', {
      content: notePayload.content,
      noteType: notePayload.noteType,
      actorUserId: clinicContext.currentUser.id
    });
    await recordLeadAuditAction(client, scope, leadId, 'lead.note_added', clinicContext.currentUser.id, {
      noteType: notePayload.noteType
    });
    await client.query('commit');

    await publishLeadEventSafe(scope, 'lead.note_added', leadId, {
      content: notePayload.content,
      noteType: notePayload.noteType,
      actorUserId: clinicContext.currentUser.id,
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId
    });

    return getLeadDetail(clinicContext, leadId);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function addLeadTag(clinicContext, leadId, payload) {
  const client = await getPool().connect();
  const tagPayload = validateLeadTagPayload(payload);

  await client.query('begin');

  try {
    const scope = await resolveLeadScope(client, clinicContext);
    await findLeadRow(client, scope, leadId);
    const tagIds = await ensureLeadTag(client, scope.clinicId, tagPayload.name, tagPayload.color);
    const inserted = await linkLeadTag(client, scope.clinicId, leadId, tagIds);

    if (inserted) {
      await recordLeadActivity(client, scope.clinicId, leadId, 'lead.tag_added', {
        tagName: tagPayload.name,
        color: tagPayload.color,
        actorUserId: clinicContext.currentUser.id
      });
      await recordLeadAuditAction(client, scope, leadId, 'lead.tag_added', clinicContext.currentUser.id, {
        tagName: tagPayload.name,
        color: tagPayload.color
      });
    }

    await client.query('commit');

    if (inserted) {
      await publishLeadEventSafe(scope, 'lead.tag_added', leadId, {
        tagName: tagPayload.name,
        color: tagPayload.color,
        actorUserId: clinicContext.currentUser.id,
        workspaceId: scope.workspaceId,
        organizationId: scope.organizationId
      });
    }

    return getLeadDetail(clinicContext, leadId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function assignLeadOwner(clinicContext, leadId, payload) {
  const normalized = validateLeadOwnerPayload(payload);
  return updateLead(clinicContext, leadId, { ownerUserId: normalized.ownerUserId });
}

async function transitionLeadStage(clinicContext, leadId, payload, options = {}) {
  const client = await getPool().connect();
  let clientReleased = false;
  const stagePayload = options.allowStatusOverride
    ? validateLeadStageStatusPayload(payload)
    : validateLeadStageTransitionPayload(payload);

  await client.query('begin');

  try {
    const scope = await resolveLeadScope(client, clinicContext);
    const existingLead = await findLeadRow(client, scope, leadId);
    assertStageTransition(existingLead.stage, stagePayload.stage);
    const nextStatus = deriveLeadStatus(existingLead.status, stagePayload.stage, stagePayload.status);

    if (existingLead.stage === stagePayload.stage && normalizeLegacyStatus(existingLead.status) === nextStatus) {
      await client.query('commit');
      client.release();
      clientReleased = true;
      return getLeadDetail(clinicContext, leadId);
    }

    await client.query(
      `
        update leads
        set stage = $4,
            status = $5,
            next_followup_at = coalesce($6, next_followup_at),
            last_contacted_at = coalesce($7, last_contacted_at),
            updated_at = now()
        where clinic_id = $1 and id = $2 and workspace_id = $3
      `,
      [
        scope.clinicId,
        leadId,
        scope.workspaceId,
        stagePayload.stage,
        nextStatus,
        stagePayload.nextFollowupAt || null,
        stagePayload.lastContactedAt || null
      ]
    );

    await recordLeadActivity(client, scope.clinicId, leadId, 'lead.stage_changed', {
      previousStage: existingLead.stage,
      nextStage: stagePayload.stage,
      previousStatus: normalizeLegacyStatus(existingLead.status),
      nextStatus,
      actorUserId: clinicContext.currentUser.id
    });
    await recordLeadAuditAction(client, scope, leadId, 'lead.stage_changed', clinicContext.currentUser.id, {
      previousStage: existingLead.stage,
      nextStage: stagePayload.stage,
      previousStatus: normalizeLegacyStatus(existingLead.status),
      nextStatus
    }, 'lead.change_stage');
    await client.query('commit');
    client.release();
    clientReleased = true;

    await publishLeadEventSafe(scope, 'lead.updated', leadId, {
      previousStatus: normalizeLegacyStatus(existingLead.status),
      nextStatus,
      previousStage: existingLead.stage,
      nextStage: stagePayload.stage,
      actorUserId: clinicContext.currentUser.id,
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId
    });
    await publishLeadEventSafe(scope, 'lead.stage_changed', leadId, {
      previousStage: existingLead.stage,
      stage: stagePayload.stage,
      previousStatus: normalizeLegacyStatus(existingLead.status),
      status: nextStatus,
      actorUserId: clinicContext.currentUser.id,
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId
    });

    if (nextStatus === 'converted') {
      await publishLeadEventSafe(scope, 'lead.converted', leadId, {
        previousStatus: normalizeLegacyStatus(existingLead.status),
        status: nextStatus,
        previousStage: existingLead.stage,
        stage: stagePayload.stage,
        actorUserId: clinicContext.currentUser.id,
        workspaceId: scope.workspaceId,
        organizationId: scope.organizationId
      });
    }

    if (nextStatus === 'lost') {
      await publishLeadEventSafe(scope, 'lead.lost', leadId, {
        previousStatus: normalizeLegacyStatus(existingLead.status),
        status: nextStatus,
        previousStage: existingLead.stage,
        stage: stagePayload.stage,
        actorUserId: clinicContext.currentUser.id,
        workspaceId: scope.workspaceId,
        organizationId: scope.organizationId
      });
    }

    return getLeadDetail(clinicContext, leadId);
  } catch (error) {
    if (!clientReleased) {
      await client.query('rollback').catch(() => {});
    }
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

async function updateLeadStageStatus(clinicContext, leadId, payload) {
  return transitionLeadStage(clinicContext, leadId, payload, { allowStatusOverride: true });
}

async function getLeadPipeline(scopeOrClinic) {
  const client = getPool();
  const scope = await resolveLeadScopeOrClinic(client, scopeOrClinic);
  const values = [scope.clinicId];
  const clauses = ['clinic_id = $1'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`workspace_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select stage, count(*)::int as lead_count
      from leads
      where ${clauses.join(' and ')}
      group by stage
    `,
    values
  );

  const counts = new Map(result.rows.map((row) => [row.stage, row.lead_count]));

  return {
    items: LEAD_STAGES.map((stage) => ({
      stage,
      count: counts.get(stage) || 0
    }))
  };
}

module.exports = {
  createLead,
  listLeads,
  getLeadDetail,
  updateLead,
  addLeadNote,
  addLeadTag,
  assignLeadOwner,
  transitionLeadStage,
  updateLeadStageStatus,
  getLeadPipeline
};