const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { sendLeadOutboundMessage } = require('../messaging/service');

function normalizeMessagePayload(messageText, channelType) {
  let richContent = { type: 'text', text: messageText };
  
  try {
    const trimmed = messageText.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      
      // Normalize LINE Flex messages
      if (parsed.type === 'flex' || parsed.contents) {
        const contents = parsed.contents || parsed;
        richContent = {
          type: 'flex',
          originalPayload: parsed,
          text: contents.body?.contents?.[0]?.text || 'LINE Flex Message',
          elements: []
        };
        
        if (contents.body && Array.isArray(contents.body.contents)) {
          richContent.elements = contents.body.contents.map(c => ({
            type: c.type === 'text' ? 'text' : 'button',
            text: c.text || c.label || '',
            action: c.action || null
          }));
        }
      } 
      // Normalize Facebook Template/Generic elements
      else if (parsed.attachment && parsed.attachment.payload) {
        const payload = parsed.attachment.payload;
        richContent = {
          type: 'facebook_template',
          originalPayload: parsed,
          text: payload.text || 'Facebook Template',
          elements: []
        };
        if (Array.isArray(payload.buttons)) {
          richContent.elements = payload.buttons.map(b => ({
            type: 'button',
            text: b.title || b.label || '',
            url: b.url || null
          }));
        }
      }
    }
  } catch (e) {
    // Fail silently, fallback to standard text
  }

  return richContent;
}

function mapUnifiedThread(row) {
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    leadId: Number(row.lead_id),
    status: row.status,
    contextSummary: row.context_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lead: {
      id: Number(row.lead_id),
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      source: row.source,
      stage: row.stage
    }
  };
}

async function listUnifiedChats(clinicContext) {
  const pool = getPool();
  const clinicId = clinicContext.currentClinic.id;

  const result = await pool.query(
    `select t.*, l.full_name, l.phone, l.email, l.source, l.stage
     from ai_chat_threads t
     inner join leads l on l.id = t.lead_id
     where t.clinic_id = $1
     order by t.updated_at desc`,
    [Number(clinicId)]
  );

  return {
    items: result.rows.map(mapUnifiedThread)
  };
}

async function getUnifiedChatMessages(clinicContext, threadId) {
  const pool = getPool();
  const clinicId = clinicContext.currentClinic.id;

  // 1. Verify thread belongs to clinic
  const threadResult = await pool.query(
    `select t.*, l.source from ai_chat_threads t
     inner join leads l on l.id = t.lead_id
     where t.clinic_id = $1 and t.id = $2`,
    [Number(clinicId), Number(threadId)]
  );

  if (threadResult.rowCount === 0) {
    throw new AppError(404, 'THREAD_NOT_FOUND', 'Chat thread not found.');
  }

  const thread = threadResult.rows[0];

  // 2. Fetch all messages in the thread
  const messagesResult = await pool.query(
    `select * from ai_chat_messages
     where thread_id = $1
     order by created_at asc, id asc`,
    [Number(threadId)]
  );

  return {
    threadId: Number(threadId),
    channelType: thread.source,
    messages: messagesResult.rows.map(msg => ({
      id: Number(msg.id),
      threadId: Number(msg.thread_id),
      senderType: msg.sender_type,
      messageText: msg.message_text,
      confidenceScore: msg.confidence_score ? Number(msg.confidence_score) : null,
      status: msg.status,
      tokensUsed: msg.tokens_used,
      createdAt: msg.created_at,
      richContent: normalizeMessagePayload(msg.message_text, thread.source)
    }))
  };
}

async function sendUnifiedMessage(clinicContext, threadId, payload) {
  const pool = getPool();
  const clinicId = clinicContext.currentClinic.id;

  const threadResult = await pool.query(
    `select t.*, l.source from ai_chat_threads t
     inner join leads l on l.id = t.lead_id
     where t.clinic_id = $1 and t.id = $2`,
    [Number(clinicId), Number(threadId)]
  );

  if (threadResult.rowCount === 0) {
    throw new AppError(404, 'THREAD_NOT_FOUND', 'Chat thread not found.');
  }

  const thread = threadResult.rows[0];

  // 1. Find or create an active channel of this source type for the clinic
  const channelResult = await pool.query(
    `select id from channels 
     where clinic_id = $1 and channel_type = $2 and status = 'active'
     order by is_primary desc limit 1`,
    [Number(clinicId), thread.source]
  );

  let channelId;
  if (channelResult.rowCount > 0) {
    channelId = Number(channelResult.rows[0].id);
  } else {
    // Autocreate channel if missing, to ensure outbound delivery succeeds
    const createResult = await pool.query(
      `insert into channels (clinic_id, channel_type, name, status, is_primary)
       values ($1, $2, $3, 'active', false) returning id`,
      [Number(clinicId), thread.source, `Omnichannel ${thread.source}`]
    );
    channelId = Number(createResult.rows[0].id);
  }

  // 2. Deliver the actual message using our core outbound mechanism (ensuring billing, tracking, and logs work)
  const outbound = await sendLeadOutboundMessage(clinicContext, Number(thread.lead_id), {
    channelId,
    content: payload.messageText
  }, {
    messageType: 'manual'
  });

  // 3. Save the sent message into the conversational ai_chat_messages thread
  const insertMessageResult = await pool.query(
    `insert into ai_chat_messages (thread_id, sender_type, message_text, confidence_score, status)
     values ($1, 'staff_override', $2, 1.0, 'sent') returning *`,
    [Number(threadId), payload.messageText]
  );

  const savedMsg = insertMessageResult.rows[0];

  // 4. Update the thread's last updated_at time
  await pool.query(
    `update ai_chat_threads set updated_at = now() where id = $1`,
    [Number(threadId)]
  );

  return {
    success: true,
    outboundMessageId: outbound.id,
    message: {
      id: Number(savedMsg.id),
      threadId: Number(savedMsg.thread_id),
      senderType: savedMsg.sender_type,
      messageText: savedMsg.message_text,
      confidenceScore: Number(savedMsg.confidence_score),
      status: savedMsg.status,
      createdAt: savedMsg.created_at,
      richContent: normalizeMessagePayload(savedMsg.message_text, thread.source)
    }
  };
}

module.exports = {
  listUnifiedChats,
  getUnifiedChatMessages,
  sendUnifiedMessage,
  normalizeMessagePayload
};
