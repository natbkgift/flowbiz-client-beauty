const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordMeteredUsage } = require('../billing/service');

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

async function updateAgentRule(clinicId, agentType, systemPrompt, temperature, rulesConfig = {}) {
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
  
  return res.rows[0];
}

async function handleInboundMessage(clinicId, leadId, text) {
  const pool = getPool();

  // 1. Get or create the AI Chat Thread
  let threadResult = await pool.query('select * from ai_chat_threads where lead_id = $1 limit 1', [leadId]);
  let threadId;
  
  if (threadResult.rowCount === 0) {
    const newThread = await pool.query(
      `
        insert into ai_chat_threads (clinic_id, lead_id, status)
        values ($1, $2, 'active')
        returning id
      `,
      [clinicId, leadId]
    );
    threadId = newThread.rows[0].id;
  } else {
    threadId = threadResult.rows[0].id;
  }

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

  // Scan text for medical/complaint keywords to drop confidence score below 85%
  const lowConfidenceKeywords = ['ตั้งครรภ์', 'ท้อง', 'แพ้', 'โรคประจำตัว', 'อันตราย', 'ผลข้างเคียง', 'คืนเงิน', 'ห่วย', 'ไม่เห็นผล', 'ร้องเรียน', 'ฟ้อง', 'มีบุตร', 'หัวใจ', 'ความดัน'];
  const hasLowConfidenceKeyword = lowConfidenceKeywords.some(kw => lowerText.includes(kw));

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

  if (hasLowConfidenceKeyword) {
    confidenceScore = Math.min(confidenceScore, 0.72);
  }

  let messageStatus = 'sent';
  if (confidenceScore < 0.85) {
    messageStatus = 'pending_approval';
  }

  // 6. Update AI Agent Conversation State
  await pool.query(
    `update ai_agent_conversations
     set current_agent = $1,
         memory_context = $2,
         updated_at = now()
     where lead_id = $3 and clinic_id = $4`,
    [nextAgent, JSON.stringify(memoryContext), leadId, clinicId]
  );

  // 7. Insert AI Chat Message
  const aiMessageRes = await pool.query(
    `
      insert into ai_chat_messages (thread_id, sender_type, message_text, confidence_score, status)
      values ($1, 'ai_agent', $2, $3, $4)
      returning *
    `,
    [threadId, replyText, confidenceScore, messageStatus]
  );

  const messageId = aiMessageRes.rows[0].id;

  // 8. If pending_approval, insert into HITL approval queue
  if (messageStatus === 'pending_approval') {
    await pool.query(
      `insert into ai_hitl_approval_queue (clinic_id, lead_id, message_text, ai_response_text, confidence_score, status, agent_type)
       values ($1, $2, $3, $4, $5, 'pending', $6)`,
      [clinicId, leadId, text, replyText, confidenceScore, currentAgent]
    );
  }

  // 9. If auto-sent, record metered SaaS billing usage
  if (messageStatus === 'sent') {
    await recordMeteredUsage(clinicId, 'ai_message_generated', 1);
  }

  return aiMessageRes.rows[0];
}

async function getApprovalQueue(clinicId) {
  const pool = getPool();
  const queueResult = await pool.query(
    `
      select m.*, t.lead_id, l.full_name as lead_name
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
      inner join leads l on l.id = t.lead_id
      where t.clinic_id = $1
        and m.status = 'pending_approval'
      order by m.created_at asc
    `,
    [clinicId]
  );

  return queueResult.rows.map((row) => ({
    id: Number(row.id),
    threadId: Number(row.thread_id),
    leadId: Number(row.lead_id),
    leadName: row.lead_name,
    senderType: row.sender_type,
    messageText: row.message_text,
    confidenceScore: Number(row.confidence_score),
    status: row.status,
    createdAt: row.created_at
  }));
}

async function approveOrOverrideMessage(clinicId, messageId, staffOverrideText = null) {
  const pool = getPool();

  // 1. Fetch message and verify clinic ownership
  const messageResult = await pool.query(
    `
      select m.*, t.clinic_id, t.lead_id
      from ai_chat_messages m
      inner join ai_chat_threads t on t.id = m.thread_id
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

  if (msg.status !== 'pending_approval') {
    throw new AppError(400, 'INVALID_STATUS', 'Message is not in pending_approval state.');
  }

  // 2. Perform approval or staff override
  let finalStatus = 'sent';
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
          status = $4,
          created_at = now()
      where id = $1
      returning *
    `,
    [messageId, finalSenderType, finalMessageText, finalStatus]
  );

  // 3. Update matching HITL queue record (where lead_id matches and status is 'pending')
  await pool.query(
    `update ai_hitl_approval_queue
     set status = $1,
         ai_response_text = $2,
         reviewed_at = now()
     where clinic_id = $3 and lead_id = $4 and status = 'pending'`,
    [hitlStatus, finalMessageText, clinicId, msg.lead_id]
  );

  // 4. Record metered SaaS billing usage
  await recordMeteredUsage(clinicId, 'ai_message_generated', 1);

  return updatedResult.rows[0];
}

async function getAiCopilotSuggestion(clinicId, leadId, messageText) {
  const pool = getPool();
  const lowerText = (messageText || '').toLowerCase();
  
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

  const result = await pool.query(
    `insert into ai_copilot_suggestions (clinic_id, lead_id, message_text, suggested_response, confidence_score, used)
     values ($1, $2, $3, $4, $5, false)
     returning id`,
    [Number(clinicId), Number(leadId), messageText, suggestedResponse, confidenceScore]
  );

  return {
    success: true,
    suggestionId: Number(result.rows[0].id),
    messageText,
    suggestedResponse,
    confidenceScore,
    promotion
  };
}

module.exports = {
  handleInboundMessage,
  getApprovalQueue,
  approveOrOverrideMessage,
  getAiCopilotSuggestion,
  getAgentRules,
  updateAgentRule
};
