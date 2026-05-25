const { createLead } = require('../leads/service');
const { resolveWorkerContext } = require('../worker-engine/worker');
const { getPool } = require('../../db');
const { verifyWebhookSecret, auditWebhookEvent } = require('./security');

function parseFacebookLeadPayload(body) {
  const data = body.data || body;
  
  let fullName = 'FB Lead';
  let phone = null;
  let email = null;
  let sourceRef = data.leadgen_id || data.leadgenId || null;
  let initialNote = 'Facebook Lead Ingest';

  if (Array.isArray(data.field_data)) {
    for (const field of data.field_data) {
      const name = (field.name || '').toLowerCase();
      const vals = field.values;
      const val = Array.isArray(vals) && vals.length > 0 ? vals[0] : null;
      if (!val) continue;

      if (name.includes('name') || name.includes('fullname')) {
        fullName = val;
      } else if (name.includes('phone') || name.includes('tel')) {
        phone = val;
      } else if (name.includes('email') || name.includes('mail')) {
        email = val;
      }
    }
  }

  // Fallbacks
  fullName = data.full_name || data.fullName || data.name || fullName;
  phone = data.phone || data.phone_number || phone;
  email = data.email || email;

  return {
    fullName: fullName.trim(),
    phone: phone ? phone.trim() : null,
    email: email ? email.trim() : null,
    source: 'facebook',
    sourceRef: sourceRef ? String(sourceRef) : null,
    initialNote,
    status: 'new',
    stage: 'inquiry'
  };
}

async function handleFacebookWebhook(req, res, next) {
  try {
    const { clinicId } = req.params;
    const workspaceId = req.query.workspaceId || req.body.workspaceId;

    if (!clinicId || !workspaceId) {
      return res.status(400).json({ error: 'Bad Request', message: 'clinicId and workspaceId are required' });
    }

    const verification = verifyWebhookSecret(req, ['x-hub-signature-256']);
    if (!verification.ok) {
      await auditWebhookEvent({
        clinicId,
        source: 'facebook',
        status: 'rejected',
        reason: verification.reason,
        integrationStatus: verification.integrationStatus
      });
      return res.status(401).json({ error: 'Unauthorized', message: 'ลายเซ็นหรือ secret ของ webhook ไม่ถูกต้อง' });
    }

    const pool = getPool();

    // 1. Buffer raw payload
    const insertRawResult = await pool.query(
      `insert into inbound_leads_raw (clinic_id, source, raw_payload, processed)
       values ($1, 'facebook', $2, false) returning id`,
      [Number(clinicId), JSON.stringify(req.body)]
    );
    const rawRecordId = insertRawResult.rows[0].id;

    // 2. Determine type of event (Lead Form or Page Comment)
    const isCommentEvent = req.body.entry?.[0]?.changes?.[0]?.value?.item === 'comment';
    
    // Resolve actor context
    const userResult = await pool.query(
      `select user_id from workspace_memberships 
       where clinic_id = $1 and workspace_id = $2 and status = 'active' 
       order by id asc limit 1`,
      [Number(clinicId), Number(workspaceId)]
    );
    const actorUserId = userResult.rows[0]?.user_id ? Number(userResult.rows[0].user_id) : null;
    const context = await resolveWorkerContext(Number(clinicId), actorUserId, Number(workspaceId));

    if (isCommentEvent) {
      // Handle Comment Auto-reply
      const change = req.body.entry[0].changes[0].value;
      const commentText = change.message || '';
      const userName = change.from?.name || 'Facebook User';
      const facebookUserId = change.from?.id || 'anonymous-fb-id';
      const commentId = change.comment_id;

      // Check for high-intent aesthetic clinic keywords (สนใจ, ราคา, โปรโมชั่น, แอดมิน, ขอราคา, กี่บาท)
      const keywords = ['สนใจ', 'ราคา', 'โปร', 'กี่บาท', 'ค่าครู', 'จอง', 'คอร์ส', 'treatment'];
      const hasIntent = keywords.some(kw => commentText.toLowerCase().includes(kw));

      let lead;
      if (hasIntent) {
        // Automatically create a lead from the high intent comment
        lead = await createLead(context, {
          fullName: userName.trim(),
          phone: null,
          email: null,
          source: 'facebook',
          sourceRef: `comment-${commentId}`,
          initialNote: `FB Comment Intent: "${commentText}" on post ${change.post_id || ''}`,
          status: 'new',
          stage: 'inquiry'
        });

        // Update raw buffer to link
        await pool.query(
          `update inbound_leads_raw set processed = true, processed_lead_id = $1, updated_at = now()
           where id = $2`,
          [lead.id, rawRecordId]
        );

        await auditWebhookEvent({
          clinicId,
          source: 'facebook_comment',
          status: 'accepted',
          rawRecordId,
          leadId: lead.id,
          integrationStatus: verification.integrationStatus
        });
      }

      // Simulate sending Facebook Page Auto-Reply & Private DM message
      return res.status(200).json({
        success: true,
        event: 'comment',
        integrationStatus: verification.integrationStatus,
        processed: hasIntent,
        leadId: lead ? lead.id : null,
        autoReplySent: false,
        autoReplyMode: 'simulated_pending_provider',
        autoReplyText: 'ขอบคุณที่สนใจค่ะคุณคนไข้ แอดมินได้ส่งรายละเอียดโปรแกรมความงามพิเศษเข้าทางกล่องข้อความเรียบร้อยแล้วค่ะ 💖',
        privateMessageSent: false
      });
    } else {
      // Handle Lead Ads Form Submission
      const payload = parseFacebookLeadPayload(req.body);
      const lead = await createLead(context, payload);

      await pool.query(
        `update inbound_leads_raw set processed = true, processed_lead_id = $1, updated_at = now()
         where id = $2`,
        [lead.id, rawRecordId]
      );

      await auditWebhookEvent({
        clinicId,
        source: 'facebook_leadgen',
        status: 'accepted',
        rawRecordId,
        leadId: lead.id,
        integrationStatus: verification.integrationStatus
      });

      return res.status(201).json({
        success: true,
        event: 'leadgen',
        integrationStatus: verification.integrationStatus,
        leadId: lead.id,
        inboundRawId: rawRecordId,
        message: 'รับข้อมูล Facebook Lead Ads สำเร็จ'
      });
    }
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleFacebookWebhook,
  parseFacebookLeadPayload
};
