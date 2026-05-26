const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { closePool } = require('../apps/api/src/db');
const {
  HITL_MESSAGE_STATUSES,
  createPendingAiApprovalMessage,
  approveOrOverrideMessage,
  rejectAiMessage,
  queueApprovedMessageForOutbound,
  handleInboundMessage
} = require('../apps/api/src/modules/ai-agent/conversation-service');

function buildAuthRequest(token) {
  return {
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `HITL Contract Clinic ${uniqueId}`,
    ownerName: 'HITL Contract Owner',
    email: `hitl-contract-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } finally {
      await pool.end();
    }
  });

  const leadResult = await pool.query(
    `
      insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage, line_user_id)
      values ($1, $2, $3, 'line', $4, 'new', 'inquiry', $5)
      returning id
    `,
    [
      ownerContext.currentClinic.id,
      ownerContext.currentOrganization.id,
      ownerContext.currentWorkspace.id,
      `HITL Lead ${uniqueId}`,
      `line-user-${uniqueId}`
    ]
  );
  const leadId = Number(leadResult.rows[0].id);

  const channelResult = await pool.query(
    `
      insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
      values ($1, 'line', $2, 'active', true, '{}'::jsonb)
      returning id
    `,
    [ownerContext.currentClinic.id, `HITL LINE ${uniqueId}`]
  );
  const channelId = Number(channelResult.rows[0].id);

  await pool.query(
    `
      insert into contact_identities (clinic_id, entity_type, entity_id, channel_type, external_id, is_primary)
      values ($1, 'lead', $2, 'line', $3, true)
    `,
    [ownerContext.currentClinic.id, leadId, `line-user-${uniqueId}`]
  );

  return {
    pool,
    ownerContext,
    leadId,
    channelId
  };
}

async function createPendingMessage(fixture, text = 'สวัสดีค่ะ สนใจให้เจ้าหน้าที่ช่วยดูข้อมูลเพิ่มเติมไหมคะ') {
  return createPendingAiApprovalMessage({
    clinicId: fixture.ownerContext.currentClinic.id,
    workspaceId: fixture.ownerContext.currentWorkspace.id,
    leadId: fixture.leadId,
    inboundText: 'Lead asked for a follow-up.',
    replyText: text,
    confidenceScore: 0.82,
    agentType: 'phase6_test',
    actorUserId: fixture.ownerContext.currentUser.id
  });
}

test('HITL contract exposes the required AI suggestion statuses', () => {
  assert.deepEqual(HITL_MESSAGE_STATUSES, [
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'modified',
    'sent',
    'failed'
  ]);
});

test('AI suggestion cannot move to outbound before approval', async (t) => {
  const fixture = await createFixture(t);
  const message = await createPendingMessage(fixture);

  await assert.rejects(
    () => queueApprovedMessageForOutbound(fixture.ownerContext, Number(message.id), { channelId: fixture.channelId }),
    { code: 'AI_MESSAGE_NOT_APPROVED' }
  );
});

test('rejected AI suggestion cannot move to outbound', async (t) => {
  const fixture = await createFixture(t);
  const message = await createPendingMessage(fixture);
  const rejected = await rejectAiMessage(
    fixture.ownerContext.currentClinic.id,
    Number(message.id),
    {
      actorUserId: fixture.ownerContext.currentUser.id,
      workspaceId: fixture.ownerContext.currentWorkspace.id,
      rejectionReason: 'Unsafe wording'
    }
  );

  assert.equal(rejected.status, 'rejected');

  await assert.rejects(
    () => queueApprovedMessageForOutbound(fixture.ownerContext, Number(message.id), { channelId: fixture.channelId }),
    { code: 'AI_MESSAGE_REJECTED' }
  );
});

test('approved AI suggestion can move to outbound queue only after approval', async (t) => {
  const fixture = await createFixture(t);
  const message = await createPendingMessage(fixture);
  const approved = await approveOrOverrideMessage(
    fixture.ownerContext.currentClinic.id,
    Number(message.id),
    null,
    {
      actorUserId: fixture.ownerContext.currentUser.id,
      workspaceId: fixture.ownerContext.currentWorkspace.id
    }
  );

  assert.equal(approved.status, 'approved');

  const queued = await queueApprovedMessageForOutbound(
    fixture.ownerContext,
    Number(message.id),
    { channelId: fixture.channelId }
  );

  assert.equal(queued.outboundMessage.status, 'pending');
  assert.equal(queued.outboundMessage.contentRendered, approved.message_text);

  const queueRows = await fixture.pool.query(
    `
      select outbound_message_id, reviewed_by, workspace_id, risk_label
      from ai_hitl_approval_queue
      where clinic_id = $1 and ai_message_id = $2
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, message.id]
  );

  assert.equal(queueRows.rowCount, 1);
  assert.equal(Number(queueRows.rows[0].outbound_message_id), Number(queued.outboundMessage.id));
  assert.equal(Number(queueRows.rows[0].reviewed_by), Number(fixture.ownerContext.currentUser.id));
  assert.equal(Number(queueRows.rows[0].workspace_id), Number(fixture.ownerContext.currentWorkspace.id));
  assert.equal(queueRows.rows[0].risk_label, 'low');

  const auditRows = await fixture.pool.query(
    `
      select action_type
      from audit_logs
      where clinic_id = $1
        and entity_type = 'ai_message'
        and entity_id = $2
        and action_type in ('ai.hitl_approved', 'ai.hitl_outbound_queued')
    `,
    [fixture.ownerContext.currentClinic.id, message.id]
  );

  assert.equal(auditRows.rowCount, 2);
});

test('modified approval stores original text, modified text, approver, workspace, risk label, and timestamp', async (t) => {
  const fixture = await createFixture(t);
  const originalText = 'คนไข้แพ้ยาและถามว่าฉีดโบท็อกซ์ได้ไหมคะ';
  const modifiedText = 'ขอบคุณที่แจ้งข้อมูลค่ะ เนื่องจากมีประวัติแพ้ยา ขอให้เจ้าหน้าที่และแพทย์ตรวจสอบก่อนให้คำแนะนำเพิ่มเติมนะคะ';
  const message = await createPendingMessage(fixture, originalText);
  const modified = await approveOrOverrideMessage(
    fixture.ownerContext.currentClinic.id,
    Number(message.id),
    modifiedText,
    {
      actorUserId: fixture.ownerContext.currentUser.id,
      workspaceId: fixture.ownerContext.currentWorkspace.id
    }
  );

  assert.equal(modified.status, 'modified');

  const queueRows = await fixture.pool.query(
    `
      select original_text, modified_text, reviewed_by, workspace_id, risk_label, reviewed_at
      from ai_hitl_approval_queue
      where clinic_id = $1 and ai_message_id = $2
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, message.id]
  );

  assert.equal(queueRows.rowCount, 1);
  assert.equal(queueRows.rows[0].original_text, originalText);
  assert.equal(queueRows.rows[0].modified_text, modifiedText);
  assert.equal(Number(queueRows.rows[0].reviewed_by), Number(fixture.ownerContext.currentUser.id));
  assert.equal(Number(queueRows.rows[0].workspace_id), Number(fixture.ownerContext.currentWorkspace.id));
  assert.equal(queueRows.rows[0].risk_label, 'high');
  assert.ok(queueRows.rows[0].reviewed_at);

  const auditRows = await fixture.pool.query(
    `
      select context_json
      from audit_logs
      where clinic_id = $1
        and entity_type = 'ai_message'
        and entity_id = $2
        and action_type = 'ai.hitl_modified'
      order by id desc
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, message.id]
  );

  assert.equal(auditRows.rowCount, 1);
  assert.equal(auditRows.rows[0].context_json.overrideApplied, true);
  assert.equal(auditRows.rows[0].context_json.riskLabel, 'high');
});

test('medical high-risk inbound content remains pending approval and receives high risk label', async (t) => {
  const fixture = await createFixture(t);
  const message = await handleInboundMessage(
    fixture.ownerContext.currentClinic.id,
    fixture.leadId,
    'ตั้งครรภ์และมีโรคหัวใจ ถ้าฉีดโบท็อกซ์จะปลอดภัยไหมคะ',
    { actorUserId: fixture.ownerContext.currentUser.id }
  );

  assert.equal(message.status, 'pending_approval');
  assert.equal(Number(message.confidence_score) <= 0.72, true);

  const queueRows = await fixture.pool.query(
    `
      select risk_label, reviewed_by, reviewed_at
      from ai_hitl_approval_queue
      where clinic_id = $1 and ai_message_id = $2
      limit 1
    `,
    [fixture.ownerContext.currentClinic.id, message.id]
  );

  assert.equal(queueRows.rowCount, 1);
  assert.equal(queueRows.rows[0].risk_label, 'high');
  assert.equal(queueRows.rows[0].reviewed_by, null);
  assert.equal(queueRows.rows[0].reviewed_at, null);
});

test.after(async () => {
  await closePool();
});
