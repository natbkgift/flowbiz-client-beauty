const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const {
  inviteWorkspaceMember,
  acceptInvite,
  listWorkspaceMembers,
  changeWorkspaceMemberRole,
  deactivateWorkspaceMember,
  hashInviteToken
} = require('../apps/api/src/modules/memberships/service');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createOwnerFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const ownerSession = await signup({
    clinicName: `Membership Clinic ${uniqueId}`,
    ownerName: 'Membership Owner',
    email: `membership-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const cleanupUserIds = new Set([ownerSession.user.id]);

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [ownerSession.currentClinic.id]);

    if (cleanupUserIds.size > 0) {
      await pool.query('delete from users where id = any($1::bigint[])', [[...cleanupUserIds].map((id) => Number(id))]);
    }

    await pool.end();
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(ownerSession.token));

  return {
    pool,
    ownerSession,
    ownerContext,
    registerUser(userId) {
      cleanupUserIds.add(userId);
    }
  };
}

test('invite user creates pending membership and lists it in workspace members', async (t) => {
  const fixture = await createOwnerFixture(t);
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email: `member-${Date.now()}@example.com`,
    role: 'viewer'
  });

  assert.equal(inviteResult.membership.status, 'invited');
  assert.equal(inviteResult.invite.role, 'viewer');
  assert.equal(typeof inviteResult.invite.token, 'string');

  const members = await listWorkspaceMembers(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id);
  const invitedMember = members.items.find((item) => item.id === inviteResult.membership.id);

  assert.ok(invitedMember);
  assert.equal(invitedMember.status, 'invited');
  assert.equal(invitedMember.user.email, inviteResult.invite.email);
});

test('accept invite activates membership and creates authenticated session', async (t) => {
  const fixture = await createOwnerFixture(t);
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email: `accept-${Date.now()}@example.com`,
    role: 'operator'
  });

  const acceptedSession = await acceptInvite({
    token: inviteResult.invite.token,
    name: 'Accepted User',
    password: 'StrongPass123!'
  });
  fixture.registerUser(acceptedSession.user.id);

  assert.equal(acceptedSession.currentMembership.status, 'active');
  assert.equal(acceptedSession.currentMembership.role, 'operator');
  assert.equal(acceptedSession.currentWorkspace.id, fixture.ownerContext.currentWorkspace.id);

  const acceptedContext = await authenticateRequest(buildAuthRequest(acceptedSession.token));

  assert.equal(acceptedContext.currentMembership.status, 'active');
  assert.equal(acceptedContext.currentMembership.workspaceId, fixture.ownerContext.currentWorkspace.id);
});

test('expired invite token is rejected and marked expired', async (t) => {
  const fixture = await createOwnerFixture(t);
  const inviteEmail = `expired-${Date.now()}@example.com`;
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email: inviteEmail,
    role: 'viewer'
  });

  await fixture.pool.query(
    `
      update invite_tokens
      set expires_at = now() - interval '1 hour', updated_at = now()
      where token_hash = $1
    `,
    [hashInviteToken(inviteResult.invite.token)]
  );

  await assert.rejects(
    () => acceptInvite({ token: inviteResult.invite.token, name: 'Expired User', password: 'StrongPass123!' }),
    { code: 'INVITE_EXPIRED' }
  );

  const inviteRow = await fixture.pool.query('select status from invite_tokens where token_hash = $1', [hashInviteToken(inviteResult.invite.token)]);
  assert.equal(inviteRow.rows[0].status, 'expired');
});

test('duplicate active membership invite is prevented', async (t) => {
  const fixture = await createOwnerFixture(t);
  const email = `duplicate-${Date.now()}@example.com`;
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email,
    role: 'viewer'
  });
  const acceptedSession = await acceptInvite({
    token: inviteResult.invite.token,
    name: 'Duplicate User',
    password: 'StrongPass123!'
  });
  fixture.registerUser(acceptedSession.user.id);

  await assert.rejects(
    () =>
      inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
        email,
        role: 'admin'
      }),
    { code: 'MEMBERSHIP_EXISTS' }
  );
});

test('role change writes membership role audit log', async (t) => {
  const fixture = await createOwnerFixture(t);
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email: `role-change-${Date.now()}@example.com`,
    role: 'operator'
  });
  const acceptedSession = await acceptInvite({
    token: inviteResult.invite.token,
    name: 'Role Change User',
    password: 'StrongPass123!'
  });
  fixture.registerUser(acceptedSession.user.id);

  const updatedMembership = await changeWorkspaceMemberRole(
    fixture.ownerContext,
    fixture.ownerContext.currentWorkspace.id,
    inviteResult.membership.id,
    { role: 'viewer' }
  );

  assert.equal(updatedMembership.role, 'viewer');

  const auditRow = await fixture.pool.query(
    `
      select action_type, context_json
      from audit_logs
      where clinic_id = $1 and entity_type = 'workspace_membership' and entity_id = $2 and action_type = 'membership.role_changed'
      order by id desc
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, inviteResult.membership.id]
  );

  assert.equal(auditRow.rowCount, 1);
  assert.equal(auditRow.rows[0].context_json.role_before, 'operator');
  assert.equal(auditRow.rows[0].context_json.role_after, 'viewer');
});

test('deactivated membership loses access', async (t) => {
  const fixture = await createOwnerFixture(t);
  const inviteResult = await inviteWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, {
    email: `deactivate-${Date.now()}@example.com`,
    role: 'viewer'
  });
  const acceptedSession = await acceptInvite({
    token: inviteResult.invite.token,
    name: 'Deactivate User',
    password: 'StrongPass123!'
  });
  fixture.registerUser(acceptedSession.user.id);

  await deactivateWorkspaceMember(fixture.ownerContext, fixture.ownerContext.currentWorkspace.id, inviteResult.membership.id);

  await assert.rejects(async () => {
    await authenticateRequest(buildAuthRequest(acceptedSession.token));
  });
});

test('workspace isolation blocks membership management outside current workspace', async (t) => {
  const fixture = await createOwnerFixture(t);
  const secondWorkspace = await fixture.pool.query(
    `
      insert into workspaces (clinic_id, organization_id, name, slug, status)
      values ($1, $2, $3, $4, 'active')
      returning id
    `,
    [
      fixture.ownerContext.currentClinic.id,
      fixture.ownerContext.currentOrganization.id,
      'Second Workspace',
      `second-workspace-${Date.now()}`
    ]
  );

  await assert.rejects(
    () =>
      inviteWorkspaceMember(fixture.ownerContext, secondWorkspace.rows[0].id, {
        email: `isolated-${Date.now()}@example.com`,
        role: 'viewer'
      }),
    { code: 'WORKSPACE_ACCESS_DENIED' }
  );

  await assert.rejects(
    () => listWorkspaceMembers(fixture.ownerContext, secondWorkspace.rows[0].id),
    { code: 'WORKSPACE_ACCESS_DENIED' }
  );
});