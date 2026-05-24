function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function getDaysSince(dateValue) {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.floor((Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000));
}

const LEAD_STAGE_WEIGHTS = {
  inquiry: 18,
  qualified: 34,
  consult_booked: 56,
  consult_done: 67,
  booked: 78,
  no_show: 28,
  converted: 92
};

const LEAD_STATUS_WEIGHTS = {
  new: 8,
  active: 16,
  won: 24,
  lost: -18,
  archived: -24
};

const LEAD_SOURCE_WEIGHTS = {
  manual: 4,
  website: 9,
  line: 11,
  facebook: 6,
  referral: 13,
  import: 2
};

function computeLeadScore(signals) {
  const stageWeight = LEAD_STAGE_WEIGHTS[signals.stage] || 10;
  const statusWeight = LEAD_STATUS_WEIGHTS[signals.status] || 0;
  const sourceWeight = LEAD_SOURCE_WEIGHTS[signals.source] || 0;
  const interactionsWeight = clamp(signals.interactionCount * 3, 0, 18);
  const replyWeight = clamp(Math.round(signals.replyRate * 16), 0, 16);

  let contactWeight = 0;
  if (signals.daysSinceLastContact === null) {
    contactWeight = -6;
  } else if (signals.daysSinceLastContact <= 2) {
    contactWeight = 12;
  } else if (signals.daysSinceLastContact <= 7) {
    contactWeight = 6;
  } else if (signals.daysSinceLastContact <= 14) {
    contactWeight = -2;
  } else {
    contactWeight = -10;
  }

  const score = clamp(stageWeight + statusWeight + sourceWeight + interactionsWeight + replyWeight + contactWeight + 12, 0, 100);
  const confidence = round(clamp(0.45 + signals.interactionCount * 0.04 + signals.replyRate * 0.18, 0.45, 0.95));
  const dealProbability = round(clamp((stageWeight + statusWeight + replyWeight + interactionsWeight + 8) / 100, 0, 1));

  return {
    score,
    confidence,
    dealProbability,
    reasonJson: {
      modelName: 'flowbiz_deterministic_ai',
      version: 'v1',
      signals: {
        stage: signals.stage,
        status: signals.status,
        source: signals.source,
        interactionCount: signals.interactionCount,
        replyRate: round(signals.replyRate),
        daysSinceLastContact: signals.daysSinceLastContact
      },
      weights: {
        stageWeight,
        statusWeight,
        sourceWeight,
        interactionsWeight,
        replyWeight,
        contactWeight
      },
      dealProbability
    }
  };
}

function computeCustomerScore(signals) {
  const statusWeight = {
    active: 28,
    inactive: 10,
    vip: 38,
    churn_risk: 12
  }[signals.status] || 15;
  const engagementWeight = clamp(Math.round(signals.engagementScore * 0.35), 0, 35);
  const activityWeight = clamp(signals.activityCount * 2, 0, 16);
  const recencyWeight = signals.daysSinceLastActivity === null
    ? -8
    : signals.daysSinceLastActivity <= 7
      ? 12
      : signals.daysSinceLastActivity <= 30
        ? 5
        : -6;
  const score = clamp(statusWeight + engagementWeight + activityWeight + recencyWeight + 10, 0, 100);
  const lifetimeValueEstimate = Math.max(0, Math.round(15000 + signals.activityCount * 2500 + engagementWeight * 900 + (signals.status === 'vip' ? 45000 : 0)));

  return {
    score,
    lifetimeValueEstimate,
    engagementScore: clamp(Math.round(signals.engagementScore), 0, 100),
    confidence: round(clamp(0.48 + signals.activityCount * 0.03 + signals.engagementScore / 250, 0.48, 0.93))
  };
}

function buildLeadRecommendations(signals, scoreResult) {
  const items = [];

  if (signals.daysSinceLastContact === null || signals.daysSinceLastContact > 3) {
    items.push({
      recommendationType: 'call_lead',
      recommendationText: 'โทรติดตาม lead รายนี้เพื่ออัปเดตความสนใจและปลด blocker ล่าสุด',
      priority: scoreResult.score >= 70 ? 'urgent' : 'high',
      confidence: clamp(scoreResult.confidence, 0, 1),
      contextJson: {
        actionType: 'call_lead',
        dealProbability: scoreResult.dealProbability,
        daysSinceLastContact: signals.daysSinceLastContact
      }
    });
  }

  if (['qualified', 'consult_booked', 'consult_done'].includes(signals.stage)) {
    items.push({
      recommendationType: 'schedule_followup',
      recommendationText: 'นัด follow-up ภายใน 24 ชั่วโมงเพื่อเร่งการตัดสินใจของ lead',
      priority: scoreResult.dealProbability >= 0.65 ? 'high' : 'medium',
      confidence: clamp(scoreResult.dealProbability, 0, 1),
      contextJson: {
        actionType: 'schedule_followup',
        stage: signals.stage,
        dealProbability: scoreResult.dealProbability
      }
    });
  }

  if (signals.outboundMessageCount < 2) {
    items.push({
      recommendationType: 'send_followup_message',
      recommendationText: 'ส่งข้อความ follow-up พร้อมสรุปข้อเสนอหรือ treatment option ที่เกี่ยวข้อง',
      priority: 'medium',
      confidence: clamp(scoreResult.confidence - 0.05, 0.4, 0.9),
      contextJson: {
        actionType: 'send_followup_message',
        outboundMessageCount: signals.outboundMessageCount
      }
    });
  }

  if (signals.source === 'website' || signals.source === 'line') {
    items.push({
      recommendationType: 'send_treatment_recommendation',
      recommendationText: 'ส่ง treatment recommendation ที่ตรงกับความสนใจเพื่อเพิ่ม conversion probability',
      priority: 'medium',
      confidence: clamp(scoreResult.dealProbability - 0.04, 0.35, 0.85),
      contextJson: {
        actionType: 'send_treatment_recommendation',
        source: signals.source
      }
    });
  }

  return items.slice(0, 4);
}

function buildCustomerRecommendations(signals, scoreResult) {
  const items = [];

  if (signals.status === 'inactive' || (signals.daysSinceLastActivity !== null && signals.daysSinceLastActivity > 30)) {
    items.push({
      recommendationType: 'send_reactivation_followup',
      recommendationText: 'ส่ง reactivation follow-up พร้อมข้อเสนอเฉพาะบุคคลเพื่อดึงลูกค้ากลับมา',
      priority: 'high',
      confidence: clamp(scoreResult.confidence, 0, 1),
      contextJson: {
        actionType: 'send_reactivation_followup',
        daysSinceLastActivity: signals.daysSinceLastActivity
      }
    });
  }

  if (scoreResult.engagementScore < 55) {
    items.push({
      recommendationType: 'call_customer',
      recommendationText: 'โทรติดตามความพึงพอใจและชวนกลับมารับบริการรอบถัดไป',
      priority: 'medium',
      confidence: clamp(scoreResult.confidence - 0.06, 0.4, 0.88),
      contextJson: {
        actionType: 'call_customer',
        engagementScore: scoreResult.engagementScore
      }
    });
  }

  if (signals.status === 'vip') {
    items.push({
      recommendationType: 'send_treatment_recommendation',
      recommendationText: 'ส่ง treatment recommendation แบบ premium พร้อมข้อเสนอเฉพาะ VIP',
      priority: 'high',
      confidence: clamp(scoreResult.confidence + 0.04, 0.45, 0.95),
      contextJson: {
        actionType: 'send_treatment_recommendation',
        status: signals.status,
        lifetimeValueEstimate: scoreResult.lifetimeValueEstimate
      }
    });
  }

  if (signals.outboundMessageCount < 1) {
    items.push({
      recommendationType: 'book_revisit',
      recommendationText: 'เสนอการจอง revisit รอบถัดไปพร้อมช่วงเวลาที่ลูกค้าสะดวก',
      priority: 'medium',
      confidence: clamp(scoreResult.confidence - 0.02, 0.38, 0.86),
      contextJson: {
        actionType: 'book_revisit',
        outboundMessageCount: signals.outboundMessageCount
      }
    });
  }

  return items.slice(0, 4);
}

module.exports = {
  clamp,
  round,
  getDaysSince,
  computeLeadScore,
  computeCustomerScore,
  buildLeadRecommendations,
  buildCustomerRecommendations
};