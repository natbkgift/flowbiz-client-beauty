const { createLead } = require('../leads/service');
const { resolveWorkerContext } = require('../worker-engine/worker');
const { AppError } = require('../../common/errors');
const { buildErrorPayload } = require('../../common/http');
const { verifyWebhookSecret, auditWebhookEvent } = require('./security');

function parseWixLeadPayload(body) {
  const data = body.data || body;
  
  let fullName = 'Wix Lead';
  let phone = null;
  let email = null;
  let sourceRef = null;
  let initialNote = 'Wix Webhook Ingest';

  if (data.contact) {
    const c = data.contact;
    fullName = c.fullName || (c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : fullName);
    phone = c.phone || phone;
    email = c.email || email;
  } else if (data.booking) {
    const b = data.booking;
    const contact = b.contact || {};
    fullName = contact.fullName || (contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : fullName);
    phone = contact.phone || phone;
    email = contact.email || email;
    sourceRef = b.id || null;
    initialNote = `Wix Booking: ${b.serviceName || 'Appointment'} scheduled at ${b.startTime || ''}`;
  } else if (data.form) {
    const f = data.form;
    fullName = f.fullName || fullName;
    phone = f.phone || phone;
    email = f.email || email;
    sourceRef = f.submissionId || null;
    initialNote = `Wix Form: ${f.formName || 'Submission'}`;
  }

  // Direct body fallbacks
  fullName = body.fullName || body.name || fullName;
  phone = body.phone || phone;
  email = body.email || email;

  return {
    fullName,
    phone,
    email,
    source: 'website',
    sourceRef: sourceRef ? String(sourceRef) : null,
    initialNote,
    status: 'new',
    stage: 'inquiry'
  };
}

async function handleWixWebhook(req, res, next) {
  try {
    const { clinicId, workspaceId } = req.params;
    
    // Security verification (e.g. check signature or token in query)
    const verification = verifyWebhookSecret(req, ['x-wix-signature', 'x-webhook-secret']);
    if (!verification.ok) {
      await auditWebhookEvent({
        clinicId,
        source: 'wix',
        status: 'rejected',
        reason: verification.reason,
        integrationStatus: verification.integrationStatus
      });
      return res.status(401).json(buildErrorPayload(
        'INVALID_WEBHOOK_SIGNATURE',
        'Invalid webhook signature or secret.',
        {
          reason: verification.reason,
          integrationStatus: verification.integrationStatus
        }
      ));
    }

    const payload = parseWixLeadPayload(req.body);
    
    const { getPool } = require('../../db');
    const pool = getPool();
    const userResult = await pool.query(
      `select user_id from workspace_memberships 
       where clinic_id = $1 and workspace_id = $2 and status = 'active' 
       order by id asc limit 1`,
      [Number(clinicId), Number(workspaceId)]
    );
    const actorUserId = userResult.rows[0]?.user_id ? Number(userResult.rows[0].user_id) : null;
    const context = await resolveWorkerContext(Number(clinicId), actorUserId, Number(workspaceId));

    // Create lead which will automatically publish lead.created event and trigger flows
    const lead = await createLead(context, payload);

    await auditWebhookEvent({
      clinicId,
      source: 'wix',
      status: 'accepted',
      leadId: lead.id,
      integrationStatus: verification.integrationStatus
    });

    return res.status(201).json({
      success: true,
      integrationStatus: verification.integrationStatus,
      leadId: lead.id,
      message: 'รับข้อมูล Wix lead สำเร็จ'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleWixWebhook,
  parseWixLeadPayload
};
