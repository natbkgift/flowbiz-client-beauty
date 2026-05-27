const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordMeteredUsage } = require('../billing/service');
const { recordAuditLog } = require('../audit/service');
const { sendLeadOutboundMessage } = require('../messaging/service');
const { classifyMedicalSafety } = require('./medical-safety');

const HITL_MESSAGE_STATUSES = Object.freeze([
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'modified',
  'sent',
  'failed'
]);

const CLINIC_PROMOTIONS = [
  {
    code: 'BOTOX29',
    name: 'โปรแกรมโบท็อกซ์ลดริ้วรอยทั่วใบหน้า',
    keywords: ['โบท็อกซ์', 'ริ้วรอย', 'ย่น', 'ตีนกา', 'หน้าผาก', 'botox', 'wrinkle'],
    price: 2900,
    discountText: 'ลดเหลือ 2,900.- บาท (ปกติ 5,900.-)',
    replyTemplate: 'สวัสดีค่ะคุณลูกค้า 💖 สำหรับปัญหาเรื่องริ้วรอยและตีนกา แอดมินแนะนำโปรแกรมโบท็อกซ์ลดริ้วรอยทั่วใบหน้า (Korea Premium) ช่วยคลายกล้ามเนื้อเรียบเนียนทันใจ ตอนนี้มีโปรโมชั่นพิเศษเพียง 2,900.- บาทเท่านั้นค่ะ (ปกติ 5,900.-) สนใจรับสิทธิ์โปรโมชั่นนี้เพื่อจองคิวคุณหมอเลยไหมคะ?'
  },
  {
    code: 'MESO19',
    name: 'โปรแกรมเมโสออร่าสกินหน้าใสฉ่ำวาว',
    keywords: ['เมโส', 'หน้าใส', 'ฉ่ำวาว', 'รูขุมขน', 'ผิวกระจ่างใส', 'meso', 'aura'],
    price: 1990,
    discountText: 'ลดเหลือ 1,990.- บาท (ปกติ 3,500.-)',
    replyTemplate: 'สวัสดีค่ะคุณลูกค้า ✨ แอดมินขอแนะนำคอร์สยอดนิยมเพื่อฟื้นฟูผิวหน้า โปรแกรมเมโสออร่าสกินหน้าใสฉ่ำวาว (Meso Aura) ช่วยบำรุงผิวล้ำลึก กระชับรูขุมขน ปรับผิวขาวสว่างกระจ่างใส ราคาพิเศษลดเหลือเพียง 1,990.- บาทต่อครั้งค่ะ (ปกติ 3,500.-) สนใจให้แอดมินจองสิทธิ์ลัดคิวให้วันนี้เลยไหมคะ?'
  },
  {
    code: 'HIFU39',
    name: 'โปรแกรมไฮฟูยกกระชับแก้มเหนียง Hifu Ultra Lift',
    keywords: ['ไฮฟู', 'ยกกระชับ', 'แก้ม', 'เหนียง', 'หย่อนคล้อย', 'วีเชฟ', 'hifu', 'lift'],
    price: 3900,
    discountText: 'ลดเหลือ 3,900.- บาท (ปกติ 8,900.-)',
    replyTemplate: 'สวัสดีค่ะคุณลูกค้า 🥰 สำหรับแก้มเหนียงและปัญหาความหย่อนคล้อย แอดมินแนะนำโปรแกรมไฮฟูยกกระชับแก้มเหนียง Hifu Ultra Lift ดึงหน้ายกกระชับลงลึกถึงชั้น SMAS ไม่จำกัดช็อต ไม่เจ็บไม่บวม ดีลเด็ดลดเหลือเพียง 3,900.- บาทเท่านั้นค่ะ (ปกติ 8,900.-) สะดวกนัดวันเข้าพบคงหมอเพื่อประเมินใบหน้าฟรีเลยไหมคะ?'
  },
  {
    code: 'ACNE99',
    name: 'โปรแกรมรักษาสิวเคลียร์ผิวใส Acne Care 5 ขั้นตอน',
    keywords: ['สิว', 'อักเสบ', 'กดสิว', 'รักษาสิว', 'acne', 'clear'],
    price: 990,
    discountText: 'ลดเหลือ 990.- บาท (ปกติ 1,800.-)',
    replyTemplate: 'สวัสดีค่ะคุณลูกค้า 🌿 หากกังวลเรื่องปัญหาสิวอุดตันหรือสิวอักเสบ แอดมินแนะนำโปรแกรมเคลียร์ผิวใส Acne Care 5 ขั้นตอนครบวงจร (กดสิว + ฉีดสิว + มาร์คสิวลดการอักเสบ + เลเซอร์ฉายแสงฆ่าเชื้อ) ราคาเบาๆ เพียง 990.- บาทต่อครั้งค่ะ (ปกติ 1,800.-) สะดวกเข้ามาให้คุณหมอช่วยกดและประเมินผิวก่อนช่วงบ่ายนี้ไหมคะ?'
  }
];

async function initializeDefaultRules(clinicId) {
  const pool = getPool();
  const defaults = [
    {
      type: 'qualification',
      prompt: 'คุณคือ AI Agent ฝ่ายคัดกรองลีด (Lead Qualification) ของคลินิกความงาม ทำหน้าที่ต้อนรับลูกค้าอย่างเป็นมิตร คัดกรองปัญหา และขอข้อมูลติดต่อพื้นฐาน (ชื่อ เบอร์โทร หรือไลน์ไอดี) หากได้ข้อมูลติดต่อแล้ว ให้ส่งตัวต่อไปให้ที่ปรึกษาหัตถการ',
      temp: 0.70
    },
    {
      type: 'consult',
      prompt: 'คุณคือ AI Agent ที่ปรึกษาด้านหัตถการแพทย์ (Clinical Consultation Agent) ทำหน้าที่วิเคราะห์ปัญหาใบหน้า/ผิวพรรณ แนะนำโปรแกรมรักษาที่เหมาะสม (โบท็อกซ์, เมโสหน้าใส, ไฮฟูยกกระชับ, รักษาสิว) เสนอราคาและโปรโมชั่นพิเศษ พร้อมเชิญชวนจองคิวตรวจรักษา',
      temp: 0.70
    },
    {
      type: 'retention',
      prompt: 'คุณคือ AI Agent ฝ่ายลูกค้าสัมพันธ์และการดูแลหลังทำหัตถการ (Customer Retention Agent) ทำหน้าที่ติดตามผลการรักษา สอบถามความพอใจ แจ้งเตือนการครบรอบทำซ้ำ (เช่น โบท็อกซ์ย่อยสลายทุก 6 เดือน) และเสนอคูปองหรือแต้มสะสมพิเศษเพื่อดึงดูดลูกค้ากลับเข้ารับบริการซ้ำ',
      temp: 0.60
    },
    {
      type: 'orchestrator',
      prompt: 'คุณคือ AI Agent ประสานงานสูงสุด (Agent Orchestrator) ทำหน้าที่สลับควบคุมและวิเคราะห์สถานะการสนทนาของคนไข้เพื่อส่งต่อให้บอตรายด้านทำงานได้ถูกต้อง',
      temp: 0.50
    }
  ];

  for (const d of defaults) {
    await pool.query(
      `insert into ai_agent_rules (clinic_id, agent_type, system_prompt, temperature, rules_config)
       values ($1, $2, $3, $4, '{}'::jsonb)
       on conflict (clinic_id, agent_type) do nothing`,
      [clinicId, d.type, d.prompt, d.temp]
    );
  }
}

async function getAgentRules(clinicId) {
  const pool = getPool();
  const res = await pool.query('select * from ai_agent_rules where clinic_id = $1 order by agent_type', [clinicId]);
  
  if (res.rowCount === 0) {
    await initializeDefaultRules(clinicId);
    const retry = await pool.query('select * from ai_agent_rules where clinic_id = $1 order by agent_type', [clinicId]);
    return retry.rows;
  }
  
  return res.rows;
}

async function updateAgentRule(clinicId, agentType, systemPrompt, temperature, rulesConfig = {}, options = {}) {
  const pool = getPool();
  
  const res = await pool.query(
    `insert into ai_agent_rules (clinic_id, agent_type, system_prompt, temperature, rules_config, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (clinic_id, agent_type)
     do update set system_prompt = excluded.system_prompt,
                   temperature = excluded.temperature,
                   rules_config = excluded.rules_config,
                   updated_at = now()
     returning *`,
    [clinicId, agentType, systemPrompt, temperature, JSON.stringify(rulesConfig)]
  );
  
  const rule = res.rows[0];
  await recordAuditLog({
    clinicId,
    entityType: 'ai_agent_rule',
    entityId: rule.id,
    actionType: 'ai.rule_updated',
    actorUserId: options.actorUserId || null,
    contextJson: {
      agentType,
      temperature: Number(temperature)
    }
  });

  return rule;
}

async function getOrCreateAiThread(pool, clinicId, leadId) {
  let threadResult = await pool.query(
    'select * from ai_chat_threads where lead_id = $1 and clinic_id = $2 limit 1',
    [leadId, clinicId]
  );

  if (threadResult.rowCount > 0) {
    return Number(threadResult.rows[0].id);
  }

  const newThread = await pool.query(
    `
      insert into ai_chat_threads (clinic_id, lead_id, status)
      values ($1, $2, 'active')
      returning id
    `,
    [clinicId, leadId]
  );

  return Number(newThread.rows[0].id);
}

async function resolveLeadWorkspaceId(pool, clinicId, leadId) {
  const result = await pool.query(
    'select workspace_id from leads where clinic_id = $1 and id = $2 limit 1',
    [clinicId, leadId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  return result.rows[0].workspace_id ? Number(result.rows[0].workspace_id) : null;
}

function getRiskLabel(text) {
  return classifyMedicalSafety(text).severity || 'low';
}

function maxRiskLabel(...labels) {
  const rank = { low: 1, medium: 2, high: 3 };
  return labels
    .filter(Boolean)
    .reduce((current, label) => (rank[label] > rank[current] ? label : current), 'low');
}

function assertWorkspaceAccess(messageWorkspaceId, requestedWorkspaceId) {
  if (!requestedWorkspaceId || !messageWorkspaceId) {
    return;
  }

  if (Number(messageWorkspaceId) !== Number(requestedWorkspaceId)) {
    throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'Access to this HITL item is denied for the current workspace.');
  }
}

async function createPendingAiApprovalMessage({
  clinicId,
  leadId,
  workspaceId = null,
  inboundText,
  replyText,
  confidenceScore = 0.8,
  agentType = 'ai_agent',
  actorUserId = null,
  auditActionType = 'ai.generated_requires_hitl',
  contextJson = {}
}) {
  const pool = getPool();
  const normalizedConfidence = Number.isFinite(Number(confidenceScore)) ? Number(confidenceScore) : 0.8;
  const threadId = await getOrCreateAiThread(pool, clinicId, leadId);
  const resolvedWorkspaceId = workspaceId ? Number(workspaceId) : await resolveLeadWorkspaceId(pool, clinicId, leadId);
  const responseSafety = classifyMedicalSafety(replyText);
  const riskLabel = maxRiskLabel(
    responseSafety.severity,
    contextJson.medicalSafety?.severity,
    contextJson.preSafety?.severity,
    contextJson.postSafety?.severity
  );

  const aiMessageRes = await pool.query(
    `
      insert into ai_chat_messages (thread_id, sender_type, message_text, confidence_score, status)
      values ($1, 'ai_agent', $2, $3, 'pending_approval')
      returning *
    `,
    [threadId, replyText, normalizedConfidence]
  );

  const messageId = aiMessageRes.rows[0].id;
  await pool.query(
    `insert into ai_hitl_approval_queue (
       clinic_id,
       workspace_id,
       lead_id,
       ai_message_id,
       message_text,
       ai_response_text,
       original_text,
       modified_text,
       confidence_score,
       status,
       agent_type,
       risk_label
     )
     values ($1, $2, $3, $4, $5, $6, $6, null, $7, 'pending', $8, $9)`,
    [
      clinicId,
      resolvedWorkspaceId,
      leadId,
      messageId,
      inboundText || 'AI-generated outbound suggestion requires staff approval before send.',
      replyText,
      normalizedConfidence,
      agentType,
      riskLabel
    ]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'ai_message',
    entityId: messageId,
    actionType: auditActionType,
    actorUserId,
    contextJson: {
      leadId,
      threadId,
      workspaceId: resolvedWorkspaceId,
      agentType,
      confidenceScore: normalizedConfidence,
      status: 'pending_approval',
      hitlRequired: true,
      autoSendBlocked: true,
      responseMedicalSafety: responseSafety,
      ...contextJson
    }
  });

  return aiMessageRes.rows[0];
}

async function handleInboundMessage(clinicId, leadId, text, options = {}) {
  const pool = getPool();

  // 1. Get or create the AI Chat Thread
  const threadId = await getOrCreateAiThread(pool, clinicId, leadId);

  // 2. Insert Lead inbound message
  await pool.query(
    `
      insert into ai_chat_messages (thread_id, sender_type, message_text, status)
      values ($1, 'lead', $2, 'sent')
    `,
    [threadId, text]
  );

  // 3. Get or create AI Agent Conversation (Memory Context)
  let convResult = await pool.query('select * from ai_agent_conversations where lead_id = $1 and clinic_id = $2 limit 1', [leadId, clinicId]);
  let currentAgent = 'qualification';
  let memoryContext = {};
  if (convResult.rowCount === 0) {
    const leadContactRes = await pool.query('select phone, email from leads where id = $1 limit 1', [leadId]);
    if (leadContactRes.rowCount > 0 && (leadContactRes.rows[0].phone || leadContactRes.rows[0].email)) {
      currentAgent = 'consult';
      memoryContext.qualified = true;
      memoryContext.contact_provided = leadContactRes.rows[0].phone || leadContactRes.rows[0].email;
    }
    await pool.query(
      `insert into ai_agent_conversations (clinic_id, lead_id, current_agent, memory_context) values ($1, $2, $3, $4)`,
      [clinicId, leadId, currentAgent, JSON.stringify(memoryContext)]
    );
  } else {
    currentAgent = convResult.rows[0].current_agent;
    memoryContext = convResult.rows[0].memory_context || {};
  }

  // 4. Load Active Prompt Rules
  const rulesResult = await pool.query('select * from ai_agent_rules where clinic_id = $1 and agent_type = $2 limit 1', [clinicId, currentAgent]);
  let systemPrompt = '';
  let temperature = 0.70;
  if (rulesResult.rowCount === 0) {
    await initializeDefaultRules(clinicId);
    const retryRules = await pool.query('select * from ai_agent_rules where clinic_id = $1 and agent_type = $2 limit 1', [clinicId, currentAgent]);
    systemPrompt = retryRules.rows[0].system_prompt;
    temperature = Number(retryRules.rows[0].temperature);
  } else {
    systemPrompt = rulesResult.rows[0].system_prompt;
    temperature = Number(rulesResult.rows[0].temperature);
  }

  // 5. Run Orchestrator & Active Agent Logic
  const lowerText = text.toLowerCase();
  let confidenceScore = 0.90;
  let replyText = '';
  let nextAgent = currentAgent;

  const safetyClassification = classifyMedicalSafety(text);

  if (currentAgent === 'qualification') {
    const phoneRegex = /(0[2689]\d{8}|0[3457]\d{7})/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const hasContact = phoneRegex.test(text) || emailRegex.test(text) || lowerText.includes('line') || lowerText.includes('ไลน์');

    if (hasContact) {
      nextAgent = 'consult';
      memoryContext.qualified = true;
      memoryContext.contact_provided = text;
      replyText = 'ขอบพระคุณสำหรับข้อมูลติดต่อค่ะ แอดมินได้ส่งรายละเอียดให้ผู้เชี่ยวชาญด้านหัตถการความงามแล้วค่ะ ไม่ทราบว่าตอนนี้คุณลูกค้ากังวลเรื่องปัญหาผิวพรรณ ริ้วรอย หรือปัญหาสิวเป็นพิเศษจุดไหนไหมคะเพื่อให้แพทย์ช่วยวิเคราะห์เบื้องต้น?';
      confidenceScore = 0.95;
    } else {
      replyText = 'สวัสดีค่ะ ยินดีต้อนรับสู่ FlowBiz Beauty Clinic ค่ะ รบกวนขอทราบชื่อและเบอร์โทรศัพท์สำหรับลงทะเบียน เพื่อให้แพทย์ผู้เชี่ยวชาญโทรให้คำแนะนำโปรโมชั่นที่เหมาะสมกับคนไข้โดยตรงได้ไหมคะ?';
      confidenceScore = 0.88;
    }
  } else if (currentAgent === 'consult') {
    let matchedPromo = CLINIC_PROMOTIONS.find(promo => 
      promo.keywords.some(kw => lowerText.includes(kw))
    );

    if (matchedPromo) {
      replyText = matchedPromo.replyTemplate;
      confidenceScore = 0.96;
      memoryContext.interested_promo = matchedPromo.code;
      if (lowerText.includes('จอง') || lowerText.includes('โอน') || lowerText.includes('ซื้อ')) {
        nextAgent = 'retention';
        memoryContext.converted = true;
      }
    } else if (lowerText.includes('ราคา') || lowerText.includes('กี่บาท') || lowerText.includes('แพง')) {
      replyText = 'โปรแกรมความงามของเราเริ่มต้นเพียง 990.- บาทสำหรับรักษาสิว และมีโบท็อกซ์ลิฟต์ริ้วรอยทั่วหน้าเพียง 2,900.- บาทค่ะ สะดวกเข้ามาปรึกษาตรวจประเมินผิวกับคุณหมอฟรี ไม่มีค่าใช้จ่ายวันนี้เลยไหมคะ?';
      confidenceScore = 0.90;
    } else {
      replyText = 'ขออภัยสำหรับรายละเอียดทางการแพทย์เชิงลึกนะคะ เพื่อความปลอดภัยสูงสุดของคุณหมอขอแนะนำให้เข้ามาพบแพทย์ผู้เชี่ยวชาญโดยตรงที่คลินิกเพื่อวิเคราะห์ชั้นผิวและประเมินอย่างละเอียดฟรี ไม่มีค่าบริการค่ะ สะดวกนัดเป็นวันใดดีคะ?';
      confidenceScore = 0.78;
    }
  } else {
    // Retention Agent
    if (lowerText.includes('ผลข้างเคียง') || lowerText.includes('แพ้') || lowerText.includes('บวม') || lowerText.includes('ช้ำ')) {
      replyText = 'สวัสดีค่ะ ทางคลินิกต้องขออภัยในความกังวลใจของคนไข้นะคะ อาการระคายเคือง รอยแดง รอยบวม หรือจุดช้ำเล็กน้อยหลังทำเลเซอร์/ฉีดโบท็อกซ์เป็นอาการปกติที่เกิดขึ้นได้และจะยุบหายไปเองใน 3-7 วันค่ะ ทั้งนี้แอดมินได้ประสานงานให้แพทย์ผู้ตรวจเช็กประวัติของคนไข้และโทรติดต่อกลับด่วนที่สุดเพื่อประเมินความปลอดภัยแล้วนะคะ';
      confidenceScore = 0.70;
    } else {
      replyText = 'ขอบพระคุณที่ไว้วางใจใช้บริการของคลินิกเรานะคะ ยินดีมอบแต้มสะสมความงามและสิทธิพิเศษบอกต่อเพื่อน (Referrals) รับแต้มเพิ่ม 100 คะแนนสำหรับใช้เป็นส่วนลดครั้งถัดไปค่ะ ไม่ทราบว่าอาการหลังทำหัตถการเรียบร้อยดีไหมคะ?';
      confidenceScore = 0.89;
    }
  }

  if (safetyClassification.requiresHitl) {
    confidenceScore = Math.min(confidenceScore, 0.72);
    replyText = 'ขอบคุณที่แจ้งข้อมูลค่ะ กรณีนี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ แอดมินจะส่งให้เจ้าหน้าที่หรือแพทย์ผู้ดูแลตรวจสอบก่อนตอบกลับ เพื่อความปลอดภัยของคนไข้นะคะ';
  }

  const messageStatus = 'pending_approval';

  // 6. Update AI Agent Conversation State
  await pool.query(
    `update ai_agent_conversations
     set current_agent = $1,
         memory_context = $2,
         updated_at = now()
     where lead_id = $3 and clinic_id = $4`,
    [nextAgent, JSON.stringify(memoryContext), leadId, clinicId]
  );

  // 7. Queue every AI reply for HITL approval before any outbound send.
  const aiMessage = await createPendingAiApprovalMessage({
    clinicId,
    actorUserId: options.actorUserId || null,
    leadId,
    inboundText: text,
    replyText,
    confidenceScore,
    agentType: currentAgent,
    auditActionType: 'ai.auto_reply_requires_hitl',
    contextJson: {
      nextAgent,
      status: messageStatus,
      medicalSafety: safetyClassification
    }
  });

  return aiMessage;
}

async function getApprovalQueue(clinicId, options = {}) {
  const pool = getPool();
  const values = [clinicId];
  const workspaceClause = options.workspaceId ? 'and l.workspace_id = $2' : '';

  if (options.workspaceId) {
    values.push(Number(options.workspaceId));
  }

  const queueResult = await pool.query(
    `
      select
        m.*,
        t.lead_id,
        l.full_name as lead_name,
        l.workspace_id,
        q.id as approval_queue_id,
        q.original_text,
        q.modified_text,
        q.risk_label,
        q.reviewed_by,
        q.reviewed_at,
        q.outbound_message_id
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      inner join leads l on l.id = t.lead_id
      left join lateral (
        select *
        from ai_hitl_approval_queue q
        where q.clinic_id = t.clinic_id
          and q.lead_id = t.lead_id
          and (q.ai_message_id = m.id or (q.ai_message_id is null and q.ai_response_text = m.message_text))
        order by q.created_at desc, q.id desc
        limit 1
      ) q on true
      where t.clinic_id = $1
        and m.status = 'pending_approval'
        ${workspaceClause}
      order by m.created_at asc
    `,
    values
  );

  return queueResult.rows.map((row) => ({
    id: Number(row.id),
    threadId: Number(row.thread_id),
    leadId: Number(row.lead_id),
    leadName: row.lead_name,
    workspaceId: row.workspace_id ? Number(row.workspace_id) : null,
    approvalQueueId: row.approval_queue_id ? Number(row.approval_queue_id) : null,
    senderType: row.sender_type,
    messageText: row.message_text,
    originalText: row.original_text,
    modifiedText: row.modified_text,
    riskLabel: row.risk_label || getRiskLabel(row.message_text),
    reviewedBy: row.reviewed_by ? Number(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at,
    outboundMessageId: row.outbound_message_id ? Number(row.outbound_message_id) : null,
    confidenceScore: Number(row.confidence_score),
    status: row.status,
    createdAt: row.created_at
  }));
}

async function approveOrOverrideMessage(clinicId, messageId, staffOverrideText = null, options = {}) {
  const pool = getPool();

  // 1. Fetch message and verify clinic ownership
  const messageResult = await pool.query(
    `
      select m.*, t.clinic_id, t.lead_id, l.workspace_id
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      inner join leads l on l.id = t.lead_id and l.clinic_id = t.clinic_id
      where m.id = $1
      limit 1
    `,
    [messageId]
  );

  if (messageResult.rowCount === 0) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'AI message not found.');
  }

  const msg = messageResult.rows[0];

  if (Number(msg.clinic_id) !== Number(clinicId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access to approve this message is denied.');
  }

  assertWorkspaceAccess(msg.workspace_id, options.workspaceId);

  if (msg.status !== 'pending_approval') {
    throw new AppError(400, 'INVALID_STATUS', 'Message is not in pending_approval state.');
  }

  // 2. Perform approval or staff override. Approval is not delivery.
  let finalSenderType = msg.sender_type;
  let finalMessageText = msg.message_text;

  let hitlStatus = 'approved';
  if (staffOverrideText && staffOverrideText.trim() !== '') {
    finalSenderType = 'staff_override';
    finalMessageText = staffOverrideText;
    hitlStatus = 'modified';
  }

  const updatedResult = await pool.query(
    `
      update ai_chat_messages
      set sender_type = $2,
          message_text = $3,
          status = $4
      where id = $1
      returning *
    `,
    [messageId, finalSenderType, finalMessageText, hitlStatus]
  );

  // 3. Update the matching HITL queue record for this exact AI response.
  await pool.query(
    `with target_queue as (
       select id
       from ai_hitl_approval_queue
       where clinic_id = $4
         and lead_id = $5
         and status = 'pending'
         and (ai_message_id = $10 or (ai_message_id is null and ai_response_text = $6))
       order by created_at asc, id asc
       limit 1
     )
     update ai_hitl_approval_queue
     set status = $1,
         ai_response_text = $2,
         original_text = coalesce(original_text, $6),
         modified_text = $7,
         workspace_id = coalesce(workspace_id, $8),
         risk_label = $9,
         reviewed_by = $3,
         reviewed_at = now(),
         ai_message_id = coalesce(ai_message_id, $10)
     where id in (select id from target_queue)`,
    [
      hitlStatus,
      finalMessageText,
      options.actorUserId || null,
      clinicId,
      msg.lead_id,
      msg.message_text,
      hitlStatus === 'modified' ? finalMessageText : null,
      msg.workspace_id || null,
      getRiskLabel(finalMessageText),
      messageId
    ]
  );

  // 4. Record metered SaaS billing usage
  await recordMeteredUsage(clinicId, 'ai_message_generated', 1, {
    actorUserId: options.actorUserId || null,
    source: 'ai.hitl_approval',
    relatedEntityType: 'ai_message',
    relatedEntityId: messageId
  });

  await recordAuditLog({
    clinicId,
    entityType: 'ai_message',
    entityId: messageId,
    actionType: hitlStatus === 'modified' ? 'ai.hitl_modified' : 'ai.hitl_approved',
    actorUserId: options.actorUserId || null,
    contextJson: {
      leadId: Number(msg.lead_id),
      threadId: Number(msg.thread_id),
      workspaceId: msg.workspace_id ? Number(msg.workspace_id) : null,
      finalSenderType,
      approvalStatus: hitlStatus,
      originalTextLength: String(msg.message_text || '').length,
      finalTextLength: String(finalMessageText || '').length,
      overrideApplied: hitlStatus === 'modified',
      riskLabel: classifyMedicalSafety(finalMessageText).severity || 'unknown'
    }
  });

  return updatedResult.rows[0];
}

async function rejectAiMessage(clinicId, messageId, options = {}) {
  const pool = getPool();
  const messageResult = await pool.query(
    `
      select m.*, t.clinic_id, t.lead_id, l.workspace_id
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      inner join leads l on l.id = t.lead_id and l.clinic_id = t.clinic_id
      where m.id = $1
      limit 1
    `,
    [messageId]
  );

  if (messageResult.rowCount === 0) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'AI message not found.');
  }

  const msg = messageResult.rows[0];

  if (Number(msg.clinic_id) !== Number(clinicId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access to reject this message is denied.');
  }

  assertWorkspaceAccess(msg.workspace_id, options.workspaceId);

  if (msg.status !== 'pending_approval') {
    throw new AppError(400, 'INVALID_STATUS', 'Message is not in pending_approval state.');
  }

  const updatedResult = await pool.query(
    `
      update ai_chat_messages
      set status = 'rejected'
      where id = $1
      returning *
    `,
    [messageId]
  );

  await pool.query(
    `with target_queue as (
       select id
       from ai_hitl_approval_queue
       where clinic_id = $3
         and lead_id = $4
         and status = 'pending'
         and (ai_message_id = $1 or (ai_message_id is null and ai_response_text = $5))
       order by created_at asc, id asc
       limit 1
     )
     update ai_hitl_approval_queue
     set status = 'rejected',
         reviewed_by = $2,
         reviewed_at = now(),
         ai_message_id = coalesce(ai_message_id, $1),
         workspace_id = coalesce(workspace_id, $6),
         original_text = coalesce(original_text, $5),
         modified_text = null,
         risk_label = $7,
         rejection_reason = $8
     where id in (select id from target_queue)`,
    [
      messageId,
      options.actorUserId || null,
      clinicId,
      msg.lead_id,
      msg.message_text,
      msg.workspace_id || null,
      getRiskLabel(msg.message_text),
      options.rejectionReason || null
    ]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'ai_message',
    entityId: messageId,
    actionType: 'ai.hitl_rejected',
    actorUserId: options.actorUserId || null,
    contextJson: {
      leadId: Number(msg.lead_id),
      threadId: Number(msg.thread_id),
      workspaceId: msg.workspace_id ? Number(msg.workspace_id) : null,
      riskLabel: getRiskLabel(msg.message_text),
      rejectionReasonProvided: Boolean(options.rejectionReason)
    }
  });

  return updatedResult.rows[0];
}

async function queueApprovedMessageForOutbound(clinicContext, messageId, payload = {}) {
  const pool = getPool();
  const messageResult = await pool.query(
    `
      select m.*, t.clinic_id, t.lead_id, l.workspace_id
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      inner join leads l on l.id = t.lead_id and l.clinic_id = t.clinic_id
      where m.id = $1
      limit 1
    `,
    [messageId]
  );

  if (messageResult.rowCount === 0) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'AI message not found.');
  }

  const msg = messageResult.rows[0];
  const clinicId = clinicContext.currentClinic.id;

  if (Number(msg.clinic_id) !== Number(clinicId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access to send this message is denied.');
  }

  assertWorkspaceAccess(msg.workspace_id, clinicContext.currentWorkspace?.id);

  if (msg.status === 'rejected') {
    throw new AppError(400, 'AI_MESSAGE_REJECTED', 'Rejected AI messages cannot be sent.');
  }

  if (!['approved', 'modified'].includes(msg.status)) {
    throw new AppError(400, 'AI_MESSAGE_NOT_APPROVED', 'AI message must be approved before outbound queueing.');
  }

  const scheduledAt = payload.scheduledAt || new Date(Date.now() + 60 * 1000).toISOString();
  const outbound = await sendLeadOutboundMessage(
    clinicContext,
    Number(msg.lead_id),
    {
      channelId: payload.channelId,
      content: msg.message_text,
      scheduledAt
    },
    {
      messageType: 'manual',
      source: 'ai',
      approved: true
    }
  );

  await pool.query(
    `
      update ai_hitl_approval_queue
      set outbound_message_id = $1
      where clinic_id = $2
        and lead_id = $3
        and (ai_message_id = $4 or (ai_message_id is null and ai_response_text = $5))
    `,
    [outbound.id, clinicId, msg.lead_id, messageId, msg.message_text]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'ai_message',
    entityId: messageId,
    actionType: 'ai.hitl_outbound_queued',
    actorUserId: clinicContext.currentUser?.id || null,
    contextJson: {
      leadId: Number(msg.lead_id),
      workspaceId: msg.workspace_id ? Number(msg.workspace_id) : null,
      outboundMessageId: outbound.id,
      outboundStatus: outbound.status,
      channelId: payload.channelId,
      approvalStatus: msg.status,
      scheduledAt
    }
  });

  return {
    messageId: Number(messageId),
    status: msg.status,
    outboundMessage: outbound
  };
}

async function getAiCopilotSuggestion(clinicId, leadId, messageText, options = {}) {
  const pool = getPool();
  const lowerText = (messageText || '').toLowerCase();
  const safetyClassification = classifyMedicalSafety(messageText);
  
  let matchedPromo = CLINIC_PROMOTIONS.find(promo => 
    promo.keywords.some(kw => lowerText.includes(kw))
  );

  let confidenceScore = 0.80;
  let suggestedResponse = 'สวัสดีค่ะคุณลูกค้า ยินดีต้อนรับสู่คลินิกความงามค่ะ สามารถปรึกษารายละเอียดสิว ริ้วรอย หรือยกกระชับใบหน้าได้เลยนะคะ วันนี้มีคอร์สราคาพิเศษมากมายค่ะ';
  let promotion = null;

  if (matchedPromo) {
    confidenceScore = 0.95;
    suggestedResponse = matchedPromo.replyTemplate;
    promotion = {
      code: matchedPromo.code,
      name: matchedPromo.name,
      price: matchedPromo.price,
      discountText: matchedPromo.discountText
    };
  }

  if (safetyClassification.requiresHitl) {
    confidenceScore = Math.min(confidenceScore, 0.72);
    suggestedResponse = 'ข้อความนี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ ควรส่งให้เจ้าหน้าที่หรือแพทย์ตรวจสอบก่อนตอบกลับคนไข้';
    promotion = null;
  }

  const result = await pool.query(
    `insert into ai_copilot_suggestions (clinic_id, lead_id, message_text, suggested_response, confidence_score, used)
     values ($1, $2, $3, $4, $5, false)
     returning id`,
    [Number(clinicId), Number(leadId), messageText, suggestedResponse, confidenceScore]
  );

  await recordAuditLog({
    clinicId: Number(clinicId),
    entityType: 'ai_copilot_suggestion',
    entityId: Number(result.rows[0].id),
    actionType: safetyClassification.requiresHitl ? 'ai.copilot_requires_hitl' : 'ai.copilot_suggested',
    actorUserId: options.actorUserId || null,
    contextJson: {
      leadId: Number(leadId),
      confidenceScore,
      medicalSafety: safetyClassification
    }
  });

  return {
    success: true,
    suggestionId: Number(result.rows[0].id),
    messageText,
    suggestedResponse,
    confidenceScore,
    requiresHitl: safetyClassification.requiresHitl,
    medicalSafety: safetyClassification,
    promotion
  };
}

module.exports = {
  HITL_MESSAGE_STATUSES,
  handleInboundMessage,
  createPendingAiApprovalMessage,
  getApprovalQueue,
  approveOrOverrideMessage,
  rejectAiMessage,
  queueApprovedMessageForOutbound,
  getAiCopilotSuggestion,
  getAgentRules,
  updateAgentRule
};
