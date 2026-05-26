const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const {
  handleInboundMessage,
  getApprovalQueue,
  approveOrOverrideMessage,
  getAgentRules,
  updateAgentRule
} = require('../apps/api/src/modules/ai-agent/conversation-service');
const { handleAiAgentRoutes } = require('../apps/api/src/modules/ai-agent/routes');

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
    clinicName: `Agent Clinic ${uniqueId}`,
    ownerName: 'Agent Owner',
    email: `agent-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } catch (err) {
      // ignore constraint or cleanup errors
    } finally {
      await pool.end();
    }
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    ownerContext
  };
}

test('AI Agent Multi-Agent Orchestration, Memory Context and HITL Queue Logic', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  // 1. Create a lead to chat with
  const leadRes = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'line', 'AI Chat Customer', 'new', 'inquiry') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );
  const leadId = Number(leadRes.rows[0].id);

  // 2. Initial state: qualification
  // Send "สวัสดีค่ะ" -> Qualifies for default greeting, doesn't transition agent type
  const msg1 = await handleInboundMessage(clinicId, leadId, 'สวัสดีค่ะ');
  assert.ok(msg1);
  assert.equal(msg1.status, 'pending_approval');
  assert.ok(msg1.message_text.includes('FlowBiz Beauty Clinic'));

  const conv1 = await fixture.pool.query('select * from ai_agent_conversations where lead_id = $1', [leadId]);
  assert.equal(conv1.rows[0].current_agent, 'qualification');

  // 3. Contact info message: "สนใจโปรค่ะเบอร์ 0891234567"
  // Should transition current_agent to 'consult' and store qualified status
  const msg2 = await handleInboundMessage(clinicId, leadId, 'สนใจโปรค่ะเบอร์ 0891234567');
  assert.ok(msg2);
  assert.equal(msg2.status, 'pending_approval');
  assert.ok(msg2.message_text.includes('ขอบพระคุณสำหรับข้อมูลติดต่อ'));

  const conv2 = await fixture.pool.query('select * from ai_agent_conversations where lead_id = $1', [leadId]);
  assert.equal(conv2.rows[0].current_agent, 'consult');
  assert.equal(conv2.rows[0].memory_context.qualified, true);

  // 4. Clinical Consult message: "อยากจองโบท็อกซ์ริ้วรอย"
  // Should match BOTOX29 promo, keep agent as 'consult', set confidence score high
  const msg3 = await handleInboundMessage(clinicId, leadId, 'อยากจองโบท็อกซ์ริ้วรอย');
  assert.ok(msg3);
  assert.equal(msg3.status, 'pending_approval');
  assert.equal(Number(msg3.confidence_score), 0.96);
  assert.ok(msg3.message_text.includes('โบท็อกซ์ลดริ้วรอยทั่วใบหน้า'));

  const conv3 = await fixture.pool.query('select * from ai_agent_conversations where lead_id = $1', [leadId]);
  assert.equal(conv3.rows[0].current_agent, 'retention');
  assert.equal(conv3.rows[0].memory_context.interested_promo, 'BOTOX29');

  // 5. Low confidence query: "โรคประจำตัวเป็นโรคหัวใจ ถ้าทำแล้วมีผลข้างเคียงไหมคะ"
  // Should trigger HITL approval queue due to keywords 'โรคประจำตัว' and 'ผลข้างเคียง'
  const msg4 = await handleInboundMessage(clinicId, leadId, 'โรคประจำตัวเป็นโรคหัวใจ ถ้าทำแล้วมีผลข้างเคียงไหมคะ');
  assert.ok(msg4);
  assert.equal(msg4.status, 'pending_approval');
  assert.ok(Number(msg4.confidence_score) < 0.85);

  const hitlRows = await fixture.pool.query(
    'select * from ai_hitl_approval_queue where clinic_id = $1 and lead_id = $2 and status = $3',
    [clinicId, leadId, 'pending']
  );
  assert.equal(hitlRows.rowCount, 4);
  assert.ok(hitlRows.rows.some((row) => row.agent_type === 'retention'));

  // 6. Get Approval Queue
  const queue = await getApprovalQueue(clinicId);
  assert.equal(queue.length, 4);
  assert.ok(queue.some((row) => row.id === Number(msg4.id)));

  const autoReplySentAudit = await fixture.pool.query(
    'select count(*)::int as event_count from audit_logs where clinic_id = $1 and action_type = $2',
    [clinicId, 'ai.auto_reply_sent']
  );
  assert.equal(autoReplySentAudit.rows[0].event_count, 0);

  const hitlAudit = await fixture.pool.query(
    'select count(*)::int as event_count from audit_logs where clinic_id = $1 and action_type = $2',
    [clinicId, 'ai.auto_reply_requires_hitl']
  );
  assert.equal(hitlAudit.rows[0].event_count >= 4, true);

  // 7. Approve message with override text
  const approvedMsg = await approveOrOverrideMessage(clinicId, Number(msg4.id), 'สวัสดีค่ะสำหรับคุณลูกค้าที่มีโรคประจำตัวเป็นโรคหัวใจ หมอแนะนำให้ปรึกษาแพทย์ประจำตัวก่อน และนำใบรับรองแพทย์มาตรวจประเมินก่อนนะคะ');
  assert.ok(approvedMsg);
  assert.equal(approvedMsg.status, 'sent');
  assert.equal(approvedMsg.sender_type, 'staff_override');
  assert.ok(approvedMsg.message_text.includes('หมอแนะนำให้ปรึกษาแพทย์ประจำตัวก่อน'));

  // Ensure queue status is updated
  const hitlRowsAfter = await fixture.pool.query(
    'select * from ai_hitl_approval_queue where clinic_id = $1 and lead_id = $2 and status = $3',
    [clinicId, leadId, 'modified']
  );
  assert.equal(hitlRowsAfter.rowCount, 1);
  assert.equal(hitlRowsAfter.rows[0].ai_response_text, approvedMsg.message_text);
});

test('AI Agent Rules and Endpoint Routing', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  // Mock Request tools
  const tools = {
    authenticateRequest: async () => fixture.ownerContext,
    parseJsonBody: async (req) => req.body,
    json: (_response, status, data) => {
      responseStatus = status;
      responseData = data;
    }
  };

  let responseStatus = 200;
  let responseData = null;

  // 1. GET /ai-agent/rules - initial load should initialize defaults
  const reqGet = { method: 'GET' };
  await handleAiAgentRoutes(reqGet, {}, new URL('http://localhost/ai-agent/rules'), tools);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.length, 4); // qualification, consult, retention, orchestrator
  assert.equal(responseData[0].agent_type, 'consult');

  // 2. POST /ai-agent/rules - update consult agent prompt
  const updatedPrompt = 'คุณคือสุดยอดบอทที่ปรึกษาหัตถการความงาม';
  const reqPost = {
    method: 'POST',
    body: {
      agentType: 'consult',
      systemPrompt: updatedPrompt,
      temperature: 0.85,
      rulesConfig: { allowed_bookings: true }
    }
  };
  await handleAiAgentRoutes(reqPost, {}, new URL('http://localhost/ai-agent/rules'), tools);
  assert.equal(responseStatus, 200);
  assert.equal(responseData.agent_type, 'consult');
  assert.equal(responseData.system_prompt, updatedPrompt);
  assert.equal(Number(responseData.temperature), 0.85);

  // 3. GET /ai-agent/rules again to check update persisted
  await handleAiAgentRoutes(reqGet, {}, new URL('http://localhost/ai-agent/rules'), tools);
  assert.equal(responseStatus, 200);
  const consultRule = responseData.find(r => r.agent_type === 'consult');
  assert.equal(consultRule.system_prompt, updatedPrompt);
  assert.equal(Number(consultRule.temperature), 0.85);
});

const { closePool } = require('../apps/api/src/db');
test.after(async () => {
  await closePool();
});

