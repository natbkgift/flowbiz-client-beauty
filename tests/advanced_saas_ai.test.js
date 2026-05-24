const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { 
  recordMeteredUsage, 
  calculateCurrentBillingUsage, 
  syncUsageToStripe, 
  syncUsageToOmise 
} = require('../apps/api/src/modules/billing/service');
const { 
  handleInboundMessage, 
  getApprovalQueue, 
  approveOrOverrideMessage 
} = require('../apps/api/src/modules/ai-agent/conversation-service');
const { getExecutiveAnalyticsSummary } = require('../apps/api/src/modules/analytics/executive-service');

async function buildContext(pool) {
  const clinicResult = await pool.query(`select id, name, slug, plan, status, timezone from clinics where slug = 'demo-clinic' limit 1`);
  const clinicId = clinicResult.rows[0].id;
  
  const workspaceResult = await pool.query(`select id, organization_id from workspaces where clinic_id = $1 limit 1`, [clinicId]);
  const workspaceId = workspaceResult.rows[0].id;
  const organizationId = workspaceResult.rows[0].organization_id;

  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1 and cu.status = 'active' and u.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [clinicId]
  );

  return {
    currentClinic: {
      id: clinicId,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone
    },
    currentUser: {
      id: membershipResult.rows[0].id,
      email: membershipResult.rows[0].email,
      name: membershipResult.rows[0].name,
      role: membershipResult.rows[0].role
    },
    currentWorkspace: {
      id: workspaceId
    },
    currentOrganization: {
      id: organizationId
    }
  };
}

async function setupBillingPlanAndSubscription(pool, clinicId) {
  // Seed a sample billing plan
  const planRes = await pool.query(
    `
      insert into billing_plans (name, base_price_monthly, included_broadcasts_limit, included_ai_credits, price_per_excess_broadcast, price_per_excess_ai_call)
      values ($1, 2900.00, 10, 5, 0.0500, 0.1000)
      on conflict (name) do update set base_price_monthly = excluded.base_price_monthly
      returning id
    `,
    [`Enterprise Premium Plan ${Date.now()}`]
  );
  
  const planId = planRes.rows[0].id;

  // Clear existing subscriptions to avoid conflict
  await pool.query('delete from clinic_subscriptions where clinic_id = $1', [clinicId]);

  // Create active subscription with 30-day Free Trial active
  const subRes = await pool.query(
    `
      insert into clinic_subscriptions (clinic_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, is_trial_active)
      values ($1, $2, 'active', now(), now() + interval '1 month', now() + interval '30 days', true)
      returning *
    `,
    [clinicId, planId]
  );

  return subRes.rows[0];
}

test('SaaS Billing - Free Trial and Metered Overrides with Stripe/Omise support', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  
  await setupBillingPlanAndSubscription(pool, context.currentClinic.id);

  // 1. Log excessive usages
  await recordMeteredUsage(context.currentClinic.id, 'broadcast_sent', 15); // limit is 10 (excess = 5)
  await recordMeteredUsage(context.currentClinic.id, 'ai_message_generated', 8);  // limit is 5 (excess = 3)

  // 2. Since 30-day Free Trial is active, totalAmountDue must be 0.00
  let bill = await calculateCurrentBillingUsage(context.currentClinic.id);
  assert.equal(bill.subscription.isTrialActive, true);
  assert.equal(bill.billingCalculation.basePriceMonthly, 0.00);
  assert.equal(bill.billingCalculation.excessBroadcastCharge, 0.00);
  assert.equal(bill.billingCalculation.excessAiCharge, 0.00);
  assert.equal(bill.billingCalculation.totalAmountDue, 0.00);

  // 3. Now toggle trial off in database
  await pool.query('update clinic_subscriptions set is_trial_active = false where clinic_id = $1', [context.currentClinic.id]);

  // Recalculate bill
  bill = await calculateCurrentBillingUsage(context.currentClinic.id);
  assert.equal(bill.subscription.isTrialActive, false);
  assert.equal(bill.billingCalculation.basePriceMonthly, 2900.00);
  assert.equal(bill.usage.excessBroadcasts, 5);
  assert.equal(bill.billingCalculation.excessBroadcastCharge, 0.25); // 5 * 0.05 = 0.25
  assert.equal(bill.usage.excessAiMessages, 3);
  assert.equal(bill.billingCalculation.excessAiCharge, 0.30); // 3 * 0.10 = 0.30
  assert.equal(bill.billingCalculation.totalAmountDue, 2900.55); // 2900 + 0.25 + 0.30

  // 4. Verify Stripe & Omise connectors synchronization
  const stripeSync = await syncUsageToStripe(context.currentClinic.id);
  assert.equal(stripeSync.success, true);
  assert.equal(stripeSync.processor, 'Stripe');
  assert.equal(stripeSync.totalAmountDue, 2900.55);

  const omiseSync = await syncUsageToOmise(context.currentClinic.id);
  assert.equal(omiseSync.success, true);
  assert.equal(omiseSync.processor, 'Omise');
  assert.equal(omiseSync.totalAmountDue, 2900.55);

  await pool.end();
});

test('Conversational AI - Two-Way messaging with Human-in-the-loop approvals', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  // Create a mock lead
  const leadRes = await pool.query(
    `
      insert into leads (clinic_id, organization_id, workspace_id, full_name, source, status, stage, phone, email)
      values ($1, $2, $3, $4, 'manual', 'new', 'inquiry', '0891112222', $5)
      returning id
    `,
    [context.currentClinic.id, context.currentOrganization.id, context.currentWorkspace.id, `TwoWay Lead ${Date.now()}`, `twoway-${Date.now()}@example.com`]
  );
  const leadId = leadRes.rows[0].id;

  // 1. High confidence inbound text (auto-reply approved immediately)
  const highConfidenceMsg = await handleInboundMessage(context.currentClinic.id, leadId, 'อยากสอบถามราคาโปรโมชั่นด่วนค่ะ');
  assert.equal(highConfidenceMsg.status, 'sent');
  assert.ok(highConfidenceMsg.confidence_score >= 0.85);

  // 2. Low confidence inbound text (goes to approval queue)
  const lowConfidenceMsg = await handleInboundMessage(context.currentClinic.id, leadId, 'เอ่อคือ... มีใครแนะนำประวัติตัวตนหมอไหม');
  assert.equal(lowConfidenceMsg.status, 'pending_approval');
  assert.ok(lowConfidenceMsg.confidence_score < 0.85);

  // 3. Retrieve Approval Queue
  const queue = await getApprovalQueue(context.currentClinic.id);
  assert.ok(queue.some((msg) => Number(msg.id) === Number(lowConfidenceMsg.id)));

  // 4. Manual confirm with staff override text
  const overrideText = 'สวัสดีค่ะ ทางคลินิกขอแนะนำนายแพทย์กิตติพงษ์ ผู้เชี่ยวชาญความงามระดับท็อป 3 ให้คุณลูกค้าศึกษาประวัติได้ผ่านหน้าเว็บหลักเลยค่ะ';
  const approvedMsg = await approveOrOverrideMessage(context.currentClinic.id, lowConfidenceMsg.id, overrideText);
  
  assert.equal(approvedMsg.status, 'sent');
  assert.equal(approvedMsg.sender_type, 'staff_override');
  assert.equal(approvedMsg.message_text, overrideText);

  await pool.end();
});

test('Executive Summary Payload - enriched trends and channel ROI breakdown', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  const summary = await getExecutiveAnalyticsSummary(context.currentOrganization.id);
  
  assert.equal(summary.organizationId, Number(context.currentOrganization.id));
  assert.ok(Array.isArray(summary.weeklyLeadsTrends));
  assert.ok(summary.channelBreakdown.line);
  assert.ok(summary.channelBreakdown.facebook);

  await pool.end();
});
