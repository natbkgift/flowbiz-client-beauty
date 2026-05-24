const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordMeteredUsage } = require('../billing/service');

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

  // 3. Analyze text for Intent & Confidence Score
  const lowerText = text.toLowerCase();
  let confidenceScore = 0.90; // High confidence default
  let replyText = 'สวัสดีค่ะ ยินดีต้อนรับสู่คลินิกความงามของเราค่ะ สะดวกให้เจ้าหน้าที่ดูแลนัดหมายด่วนช่วงไหนดีคะ?';
  let messageStatus = 'sent';

  if (lowerText.includes('จอง') || lowerText.includes('นัด') || lowerText.includes('คิว')) {
    confidenceScore = 0.92;
    replyText = 'สวัสดีค่ะคุณลูกค้า สนใจจองคิวบริการความงาม ทางคลินิกยินดีจัดสรรคิวให้ด่วนที่สุดค่ะ สะดวกเป็นช่วงเช้าหรือบ่ายดีคะ?';
  } else if (lowerText.includes('ราคา') || lowerText.includes('กี่บาท') || lowerText.includes('แพง')) {
    confidenceScore = 0.88;
    replyText = 'สวัสดีค่ะ สามารถปรึกษารายละเอียดราคาโปรโมชั่นเลเซอร์หรือศัลยกรรมได้เลยค่ะ ไม่ทราบว่าสนใจเป็นส่วนไหนเป็นพิเศษไหมคะ?';
  } else {
    // Ambiguous or complex inquiries drop below 85% confidence threshold (Human-in-the-loop required)
    confidenceScore = 0.65;
    replyText = 'สวัสดีค่ะ ยินดีแนะนำข้อมูลเพิ่มเติมค่ะ ไม่ทราบว่าบริการที่สนใจเป็นเรื่องใดเป็นพิเศษเพื่อให้หมอช่วยวิเคราะห์คะ?';
    messageStatus = 'pending_approval';
  }

  // 4. Insert AI Chat Message
  const aiMessageRes = await pool.query(
    `
      insert into ai_chat_messages (thread_id, sender_type, message_text, confidence_score, status)
      values ($1, 'ai_agent', $2, $3, $4)
      returning *
    `,
    [threadId, replyText, confidenceScore, messageStatus]
  );

  // 5. If auto-sent, record metered SaaS billing usage
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
      select m.*, t.clinic_id
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

  if (staffOverrideText && staffOverrideText.trim() !== '') {
    finalSenderType = 'staff_override';
    finalMessageText = staffOverrideText;
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

  // 3. Record metered SaaS billing usage
  await recordMeteredUsage(clinicId, 'ai_message_generated', 1);

  return updatedResult.rows[0];
}

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

async function getAiCopilotSuggestion(clinicId, leadId, messageText) {
  const pool = getPool();
  const lowerText = (messageText || '').toLowerCase();
  
  // 1. Scan for matching beauty promotions based on customer intent keywords
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

  // 2. Log suggestion to database ai_copilot_suggestions table for audit analytics
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
  getAiCopilotSuggestion
};
