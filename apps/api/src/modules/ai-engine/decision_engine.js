function daysSince(dateValue) {
  if (!dateValue) {
    return 30;
  }

  const parsed = new Date(dateValue).getTime();

  if (Number.isNaN(parsed)) {
    return 30;
  }

  return Math.max(0, Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000)));
}

function clampScore(score) {
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function predictLeadConversion(features) {
  let score = 0.2;

  score += Math.min(features.intentScore / 100, 1) * 0.35;
  score += ['qualified', 'consult_booked', 'converted'].includes(features.stage) ? 0.2 : 0;
  score += features.status === 'new' ? 0.1 : features.status === 'active' ? 0.05 : 0;
  score += Math.min(features.noteCount, 5) * 0.03;
  score += Math.min(features.outboundCount, 5) * 0.02;
  score += Math.min(features.executionCount, 5) * 0.01;
  score -= daysSince(features.lastContactedAt) > 14 ? 0.15 : 0;

  const normalizedScore = clampScore(score);
  const nextBestAction = normalizedScore >= 0.75
    ? 'schedule_consult'
    : normalizedScore >= 0.5
      ? 'call_lead'
      : 'send_followup_message';

  return {
    predictionType: 'conversion_probability',
    score: normalizedScore,
    nextBestAction,
    detailJson: {
      intentScore: features.intentScore,
      stage: features.stage,
      status: features.status,
      noteCount: features.noteCount,
      outboundCount: features.outboundCount,
      executionCount: features.executionCount,
      daysSinceLastContact: daysSince(features.lastContactedAt)
    }
  };
}

function predictCustomerChurn(features) {
  let churnScore = 0.25;

  churnScore += features.status === 'inactive' ? 0.3 : 0;
  churnScore -= features.status === 'vip' ? 0.15 : 0;
  churnScore -= Math.min(features.eventCount, 5) * 0.04;
  churnScore -= Math.min(features.noteCount, 5) * 0.03;
  churnScore -= Math.min(features.outboundCount, 5) * 0.02;
  churnScore += daysSince(features.lastActivityAt) > 30 ? 0.3 : daysSince(features.lastActivityAt) > 14 ? 0.15 : 0;

  const normalizedScore = clampScore(churnScore);
  const nextBestAction = normalizedScore >= 0.7
    ? 'launch_reactivation_offer'
    : normalizedScore >= 0.45
      ? 'call_customer'
      : 'send_treatment_recommendation';

  return {
    predictionType: 'churn_probability',
    score: normalizedScore,
    nextBestAction,
    detailJson: {
      status: features.status,
      eventCount: features.eventCount,
      noteCount: features.noteCount,
      outboundCount: features.outboundCount,
      daysSinceLastActivity: daysSince(features.lastActivityAt)
    }
  };
}

module.exports = {
  predictLeadConversion,
  predictCustomerChurn
};