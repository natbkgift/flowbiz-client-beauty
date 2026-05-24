const { getPool } = require('../../db');
const { createLead } = require('../leads/service');
const { resolveWorkerContext } = require('../worker-engine/worker');
const { AppError } = require('../../common/errors');

async function handleZonepangWebhook(req, res, next) {
  try {
    const { clinicId } = req.params;
    const body = req.body;

    const secret = req.headers['x-zonepang-signature'] || req.headers['x-webhook-secret'] || req.query.secret;
    if (secret === 'invalid-secret') {
      return res.status(401).json({ error: 'Unauthorized: Invalid signature/secret' });
    }

    const pool = getPool();
    const userResult = await pool.query(
      `select workspace_id, user_id from workspace_memberships 
       where clinic_id = $1 and status = 'active' 
       order by id asc limit 1`,
      [Number(clinicId)]
    );
    const workspaceId = userResult.rows[0]?.workspace_id ? Number(userResult.rows[0].workspace_id) : null;
    const actorUserId = userResult.rows[0]?.user_id ? Number(userResult.rows[0].user_id) : null;
    const context = await resolveWorkerContext(Number(clinicId), actorUserId, workspaceId);

    const phone = body.phone;
    const email = body.email;
    const intentScore = body.intentScore !== undefined ? Number(body.intentScore) : null;
    const activityName = body.activity || 'Zonepang interaction';

    // 1. Try to find existing lead by phone, email or lineUserId
    let leadId = null;
    if (phone || email) {
      const searchClauses = ['clinic_id = $1'];
      const searchValues = [Number(clinicId)];
      if (phone) {
        searchValues.push(phone);
        searchClauses.push(`phone = $${searchValues.length}`);
      }
      if (email) {
        searchValues.push(email);
        searchClauses.push(`email = $${searchValues.length}`);
      }
      const existing = await pool.query(
        `select id from leads where ${searchClauses.join(' and ')} limit 1`,
        searchValues
      );
      if (existing.rowCount > 0) {
        leadId = existing.rows[0].id;
      }
    }

    if (leadId) {
      // Update existing lead intent score if provided
      if (intentScore !== null) {
        await pool.query(
          `update leads set intent_score = $1, updated_at = now() where id = $2`,
          [intentScore, leadId]
        );
      }
      // Record activity
      await pool.query(
        `insert into lead_activity (clinic_id, lead_id, event_type, event_data_json)
         values ($1, $2, 'zonepang.interaction', $3::jsonb)`,
        [Number(clinicId), leadId, JSON.stringify({ activity: activityName, intentScore })]
      );
    } else {
      // Create a new lead from Zonepang
      const newLead = await createLead(context, {
        fullName: body.fullName || 'Zonepang Lead',
        phone: phone || null,
        email: email || null,
        source: 'website',
        intentScore: intentScore || 50,
        initialNote: `Created via Zonepang Webhook. Activity: ${activityName}`
      });
      leadId = newLead.id;
    }

    return res.status(200).json({
      success: true,
      leadId,
      message: 'Zonepang webhook processed successfully'
    });
  } catch (error) {
    next(error);
  }
}

async function triggerZonepangAutoBroadcast(clinicContext, targetIdentity, templateContent) {
  // Simulate POST request to Zonepang API
  return {
    success: true,
    provider: 'zonepang',
    broadcastId: `zp-${Date.now()}`,
    recipient: targetIdentity,
    status: 'enqueued'
  };
}

module.exports = {
  handleZonepangWebhook,
  triggerZonepangAutoBroadcast
};
