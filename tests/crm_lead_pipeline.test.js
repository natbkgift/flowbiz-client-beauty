const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { authorize } = require('../apps/api/src/modules/rbac/service');
const {
  createLead,
  listLeads,
  getLeadDetail,
  updateLead,
  addLeadNote,
  addLeadTag,
  transitionLeadStage,
  getLeadPipeline
} = require('../apps/api/src/modules/leads/service');
const { listAuditLogsByEntity } = require('../apps/api/src/modules/audit/service');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `CRM Clinic ${uniqueId}`,
    ownerName: 'CRM Owner',
    email: `crm-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const cleanupUserIds = new Set([session.user.id]);

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);

    if (cleanupUserIds.size > 0) {
      await pool.query('delete from users where id = any($1::bigint[])', [[...cleanupUserIds].map((id) => Number(id))]);
    }

    await pool.end();
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    ownerContext,
    registerUser(userId) {
      cleanupUserIds.add(userId);
    }
  };
}

async function attachOwnerToSecondWorkspace(fixture, workspaceSlug) {
  const ownerRoleResult = await fixture.pool.query(`select id from roles where key = 'owner' limit 1`);
  const workspaceResult = await fixture.pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id, slug
    `,
    [
      fixture.ownerContext.currentClinic.id,
      fixture.ownerContext.currentOrganization.id,
      'Second CRM Workspace',
      workspaceSlug
    ]
  );

  await fixture.pool.query(
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
    [
      fixture.ownerContext.currentClinic.id,
      fixture.ownerContext.currentOrganization.id,
      workspaceResult.rows[0].id,
      fixture.ownerContext.currentUser.id,
      ownerRoleResult.rows[0].id
    ]
  );

  return authenticateRequest(
    buildAuthRequest(fixture.session.token, {
      'x-workspace-slug': workspaceResult.rows[0].slug
    })
  );
}

test('CRM lead pipeline tracks tags, notes, activity, audit, events, and pipeline counts', async (t) => {
  const fixture = await createFixture(t);
  const uniqueId = Date.now();
  const lead = await createLead(fixture.ownerContext, {
    fullName: `CRM Lead ${uniqueId}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    phone: `081${String(uniqueId).slice(-7)}`,
    email: `crm-lead-${uniqueId}@example.com`,
    tags: ['VIP'],
    initialNote: 'Lead came from front desk referral.'
  });

  await addLeadNote(fixture.ownerContext, lead.id, {
    noteType: 'follow_up',
    content: 'Called and confirmed service interest.'
  });
  await addLeadTag(fixture.ownerContext, lead.id, {
    name: 'botox-interest',
    color: '#A66B3D'
  });
  await updateLead(fixture.ownerContext, lead.id, {
    intentScore: 92,
    notesSummary: 'High intent lead ready for consult booking.'
  });
  await transitionLeadStage(fixture.ownerContext, lead.id, {
    stage: 'qualified',
    lastContactedAt: '2026-03-16T09:00:00Z'
  });
  const detail = await transitionLeadStage(fixture.ownerContext, lead.id, {
    stage: 'consult_booked',
    nextFollowupAt: '2026-03-17T09:00:00Z'
  });

  assert.equal(detail.stage, 'consult_booked');
  assert.equal(detail.status, 'active');
  assert.equal(detail.workspaceId, fixture.ownerContext.currentWorkspace.id);
  assert.equal(detail.organizationId, fixture.ownerContext.currentOrganization.id);
  assert.ok(detail.tags.some((tag) => tag.name === 'VIP'));
  assert.ok(detail.tags.some((tag) => tag.name === 'botox-interest'));
  assert.ok(detail.notes.some((note) => note.content === 'Lead came from front desk referral.'));
  assert.ok(detail.notes.some((note) => note.content === 'Called and confirmed service interest.'));
  assert.ok(detail.activityTimeline.some((item) => item.eventType === 'lead.created'));
  assert.ok(detail.activityTimeline.some((item) => item.eventType === 'lead.note_added'));
  assert.ok(detail.activityTimeline.some((item) => item.eventType === 'lead.tag_added'));
  assert.ok(detail.activityTimeline.some((item) => item.eventType === 'lead.stage_changed'));

  const filtered = await listLeads(
    fixture.ownerContext,
    new URLSearchParams({
      stage: 'consult_booked',
      owner_user_id: String(fixture.ownerContext.currentUser.id),
      tag: 'VIP',
      created_from: '2020-01-01T00:00:00Z',
      created_to: '2100-01-01T00:00:00Z'
    })
  );

  assert.ok(filtered.items.some((item) => item.id === lead.id));

  const pipeline = await getLeadPipeline(fixture.ownerContext);
  const consultBookedBucket = pipeline.items.find((item) => item.stage === 'consult_booked');
  assert.ok(consultBookedBucket);
  assert.ok(consultBookedBucket.count >= 1);

  const auditLogs = await listAuditLogsByEntity(fixture.ownerContext.currentClinic.id, 'lead', lead.id);
  assert.ok(auditLogs.items.some((item) => item.actionType === 'lead.created'));
  assert.ok(auditLogs.items.some((item) => item.actionType === 'lead.note_added'));
  assert.ok(auditLogs.items.some((item) => item.actionType === 'lead.tag_added'));
  assert.ok(auditLogs.items.some((item) => item.actionType === 'lead.stage_changed'));
  assert.ok(auditLogs.items.some((item) => item.actionType === 'lead.create'));

  const eventRows = await fixture.pool.query(
    `
      select event_type
      from event_store
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2
      order by id asc
    `,
    [fixture.ownerContext.currentClinic.id, lead.id]
  );
  const eventTypes = eventRows.rows.map((row) => row.event_type);

  assert.ok(eventTypes.includes('lead.created'));
  assert.ok(eventTypes.includes('lead.note_added'));
  assert.ok(eventTypes.includes('lead.tag_added'));
  assert.ok(eventTypes.includes('lead.updated'));
  assert.ok(eventTypes.includes('lead.stage_changed'));
});

test('CRM lead pipeline rejects invalid stage transitions', async (t) => {
  const fixture = await createFixture(t);
  const lead = await createLead(fixture.ownerContext, {
    fullName: `Invalid Stage Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    phone: `082${String(Date.now()).slice(-7)}`,
    email: `invalid-stage-${Date.now()}@example.com`
  });

  await assert.rejects(
    () =>
      transitionLeadStage(fixture.ownerContext, lead.id, {
        stage: 'booked'
      }),
    { code: 'INVALID_STAGE_TRANSITION' }
  );

  const detail = await getLeadDetail(fixture.ownerContext, lead.id);
  assert.equal(detail.stage, 'inquiry');
  assert.equal(detail.status, 'new');
});

test('CRM lead pipeline enforces workspace boundaries', async (t) => {
  const fixture = await createFixture(t);
  const secondWorkspaceContext = await attachOwnerToSecondWorkspace(fixture, `crm-second-${Date.now()}`);
  const primaryLead = await createLead(fixture.ownerContext, {
    fullName: `Primary Workspace Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: fixture.ownerContext.currentUser.id,
    phone: `083${String(Date.now()).slice(-7)}`,
    email: `primary-workspace-${Date.now()}@example.com`
  });

  await assert.rejects(() => getLeadDetail(secondWorkspaceContext, primaryLead.id), { code: 'LEAD_NOT_FOUND' });

  const secondPipeline = await getLeadPipeline(secondWorkspaceContext);
  assert.ok(secondPipeline.items.every((item) => item.count === 0));

  const secondaryLead = await createLead(secondWorkspaceContext, {
    fullName: `Secondary Workspace Lead ${Date.now()}`,
    source: 'manual',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: secondWorkspaceContext.currentUser.id,
    phone: `084${String(Date.now()).slice(-7)}`,
    email: `secondary-workspace-${Date.now()}@example.com`
  });

  const primaryList = await listLeads(fixture.ownerContext, new URLSearchParams());
  const secondList = await listLeads(secondWorkspaceContext, new URLSearchParams());

  assert.ok(primaryList.items.some((item) => item.id === primaryLead.id));
  assert.ok(!primaryList.items.some((item) => item.id === secondaryLead.id));
  assert.ok(secondList.items.some((item) => item.id === secondaryLead.id));
  assert.ok(!secondList.items.some((item) => item.id === primaryLead.id));
});

test('CRM lead permissions allow read and block write for viewers', async (t) => {
  const fixture = await createFixture(t);
  const viewerRoleResult = await fixture.pool.query(`select id from roles where key = 'viewer' limit 1`);

  await fixture.pool.query(
    `
      update clinic_users
      set role = 'viewer', role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3
    `,
    [viewerRoleResult.rows[0].id, fixture.session.currentClinic.id, fixture.session.user.id]
  );

  await fixture.pool.query(
    `
      update workspace_memberships
      set role_id = $1, updated_at = now()
      where clinic_id = $2 and user_id = $3 and workspace_id = $4
    `,
    [viewerRoleResult.rows[0].id, fixture.session.currentClinic.id, fixture.session.user.id, fixture.session.currentWorkspace.id]
  );

  const viewerContext = await authenticateRequest(buildAuthRequest(fixture.session.token));

  assert.doesNotThrow(() => authorize(viewerContext, 'lead', 'read'));
  assert.throws(() => authorize(viewerContext, 'lead', 'write'), /Missing permission lead.write/);
});