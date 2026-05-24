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

module.exports = {
  handleInboundMessage,
  getApprovalQueue,
  approveOrOverrideMessage
};
