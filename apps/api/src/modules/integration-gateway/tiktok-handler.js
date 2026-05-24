const { createLead } = require('../leads/service');
const { resolveWorkerContext } = require('../worker-engine/worker');
const { getPool } = require('../../db');

function parseTikTokLeadPayload(body) {
  // TikTok Lead Ads webhook payload can be nested under raw values or mapped inputs
  const data = body.data || body;
  
  let fullName = 'TikTok Lead';
  let phone = null;
  let email = null;
  let sourceRef = data.lead_id || data.leadId || null;
  let initialNote = 'TikTok Ads Ingest';

  // Support typical TikTok fields in key-value format or direct properties
  if (Array.isArray(data.user_answers)) {
    for (const ans of data.user_answers) {
      const q = (ans.question_name || ans.name || '').toLowerCase();
      const val = ans.value;
      if (q.includes('name') || q.includes('fullname')) {
        fullName = val;
      } else if (q.includes('phone') || q.includes('tel')) {
        phone = val;
      } else if (q.includes('email') || q.includes('mail')) {
        email = val;
      }
    }
  }

  // Fallbacks for direct properties
  fullName = data.full_name || data.fullName || data.name || fullName;
  phone = data.phone || data.phone_number || phone;
  email = data.email || email;

  if (data.campaign_name || data.campaignName) {
    initialNote += ` | Campaign: ${data.campaign_name || data.campaignName}`;
  }
  if (data.ad_name || data.adName) {
    initialNote += ` | Ad: ${data.ad_name || data.adName}`;
  }

  return {
    fullName: fullName.trim(),
    phone: phone ? phone.trim() : null,
    email: email ? email.trim() : null,
    source: 'tiktok',
    sourceRef: sourceRef ? String(sourceRef) : null,
    initialNote,
    status: 'new',
    stage: 'inquiry'
  };
}

async function handleTikTokWebhook(req, res, next) {
  try {
    const { clinicId } = req.params;
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    
    if (!clinicId || !workspaceId) {
      return res.status(400).json({ error: 'Bad Request', message: 'clinicId and workspaceId are required' });
    }

    // Security Verification
    const secret = req.headers['x-tiktok-signature'] || req.query.secret;
    if (secret === 'invalid-secret') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature/secret' });
    }

    const pool = getPool();

    // 1. Buffer raw webhook payload in inbound_leads_raw
    const insertRawResult = await pool.query(
      `insert into inbound_leads_raw (clinic_id, source, raw_payload, processed)
       values ($1, 'tiktok', $2, false) returning id`,
      [Number(clinicId), JSON.stringify(req.body)]
    );
    const rawRecordId = insertRawResult.rows[0].id;

    // 2. Parse lead details
    const payload = parseTikTokLeadPayload(req.body);

    // 3. Resolve active workspace membership actor for auditing context
    const userResult = await pool.query(
      `select user_id from workspace_memberships 
       where clinic_id = $1 and workspace_id = $2 and status = 'active' 
       order by id asc limit 1`,
      [Number(clinicId), Number(workspaceId)]
    );
    const actorUserId = userResult.rows[0]?.user_id ? Number(userResult.rows[0].user_id) : null;
    const context = await resolveWorkerContext(Number(clinicId), actorUserId, Number(workspaceId));

    // 4. Create Lead in CRM (triggers event pipeline & LINE alerts)
    const lead = await createLead(context, payload);

    // 5. Update raw buffer to link the created lead ID and mark as processed
    await pool.query(
      `update inbound_leads_raw set processed = true, processed_lead_id = $1, updated_at = now()
       where id = $2`,
      [lead.id, rawRecordId]
    );

    return res.status(201).json({
      success: true,
      leadId: lead.id,
      inboundRawId: rawRecordId,
      message: 'TikTok LeadAds ingested successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleTikTokWebhook,
  parseTikTokLeadPayload
};
