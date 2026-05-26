const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

async function recordMeteredUsage(clinicId, usageType, quantity = 1, options = {}) {
  const pool = getPool();
  const result = await pool.query(
    `
      insert into billing_usage_records (clinic_id, usage_type, quantity)
      values ($1, $2, $3)
      returning id
    `,
    [clinicId, usageType, quantity]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'billing_usage',
    entityId: Number(result.rows[0].id),
    actionType: 'billing.usage_recorded',
    actorUserId: options.actorUserId || null,
    contextJson: {
      usageType,
      quantity: Number(quantity),
      source: options.source || 'system',
      relatedEntityType: options.relatedEntityType || null,
      relatedEntityId: options.relatedEntityId || null
    }
  });
}

async function calculateCurrentBillingUsage(clinicId) {
  const pool = getPool();

  // 1. Fetch subscription details and plan details
  const subResult = await pool.query(
    `
      select cs.*, bp.name as plan_name, bp.base_price_monthly, bp.included_broadcasts_limit,
             bp.included_ai_credits, bp.price_per_excess_broadcast, bp.price_per_excess_ai_call
      from clinic_subscriptions cs
      inner join billing_plans bp on bp.id = cs.plan_id
      where cs.clinic_id = $1
      limit 1
    `,
    [clinicId]
  );

  if (subResult.rowCount === 0) {
    throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Clinic does not have an active billing subscription.');
  }

  const sub = subResult.rows[0];
  const now = new Date();

  // Evaluate if trial is currently active
  const isTrialActive = sub.is_trial_active && (new Date(sub.trial_ends_at) > now);

  // 2. Count usage in the current billing cycle
  const usageStats = await pool.query(
    `
      select 
        coalesce(sum(case when usage_type = 'broadcast_sent' then quantity end)::int, 0) as broadcasts_sent,
        coalesce(sum(case when usage_type = 'ai_message_generated' then quantity end)::int, 0) as ai_messages_generated
      from billing_usage_records
      where clinic_id = $1
        and recorded_at >= $2
        and recorded_at <= $3
    `,
    [clinicId, sub.current_period_start, sub.current_period_end]
  );

  const stats = usageStats.rows[0];
  const totalBroadcasts = stats.broadcasts_sent;
  const totalAiMessages = stats.ai_messages_generated;

  // Calculate excess usage
  const excessBroadcasts = Math.max(0, totalBroadcasts - sub.included_broadcasts_limit);
  const excessAiMessages = Math.max(0, totalAiMessages - sub.included_ai_credits);

  // Calculate costs (0 if trial is active)
  const basePriceMonthly = isTrialActive ? 0.00 : Number(sub.base_price_monthly);
  const excessBroadcastCharge = isTrialActive 
    ? 0.00 
    : Number((excessBroadcasts * Number(sub.price_per_excess_broadcast)).toFixed(4));
  const excessAiCharge = isTrialActive 
    ? 0.00 
    : Number((excessAiMessages * Number(sub.price_per_excess_ai_call)).toFixed(4));

  const totalAmountDue = Number((basePriceMonthly + excessBroadcastCharge + excessAiCharge).toFixed(4));

  return {
    clinicId: Number(clinicId),
    subscription: {
      id: Number(sub.id),
      planName: sub.plan_name,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      trialEndsAt: sub.trial_ends_at,
      isTrialActive
    },
    usage: {
      broadcastsSent: totalBroadcasts,
      broadcastsLimit: sub.included_broadcasts_limit,
      excessBroadcasts,
      aiMessagesGenerated: totalAiMessages,
      aiCreditsLimit: sub.included_ai_credits,
      excessAiMessages
    },
    billingCalculation: {
      basePriceMonthly,
      excessBroadcastCharge,
      excessAiCharge,
      totalAmountDue
    }
  };
}

async function syncUsageToStripe(clinicId) {
  const calculation = await calculateCurrentBillingUsage(clinicId);
  // Simulating external Stripe metered billing usage records sync
  const result = {
    success: true,
    processor: 'Stripe',
    integrationStatus: 'simulated',
    syncedSubscriptionId: `sub_stripe_${clinicId}`,
    syncedAt: new Date().toISOString(),
    totalAmountDue: calculation.billingCalculation.totalAmountDue
  };

  await recordAuditLog({
    clinicId,
    entityType: 'billing_subscription',
    entityId: Number(calculation.subscription.id),
    actionType: 'billing.sync_simulated',
    actorUserId: null,
    contextJson: result
  });

  return result;
}

async function syncUsageToOmise(clinicId) {
  const calculation = await calculateCurrentBillingUsage(clinicId);
  // Simulating external Omise recurring/metered billing sync
  const result = {
    success: true,
    processor: 'Omise',
    integrationStatus: 'simulated',
    syncedSubscriptionId: `sub_omise_${clinicId}`,
    syncedAt: new Date().toISOString(),
    totalAmountDue: calculation.billingCalculation.totalAmountDue
  };

  await recordAuditLog({
    clinicId,
    entityType: 'billing_subscription',
    entityId: Number(calculation.subscription.id),
    actionType: 'billing.sync_simulated',
    actorUserId: null,
    contextJson: result
  });

  return result;
}

module.exports = {
  recordMeteredUsage,
  calculateCurrentBillingUsage,
  syncUsageToStripe,
  syncUsageToOmise
};
