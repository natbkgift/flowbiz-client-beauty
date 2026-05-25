const MEDICAL_SAFETY_RULES = [
  {
    key: 'pregnancy',
    severity: 'high',
    keywords: ['ตั้งครรภ์', 'ท้อง', 'มีบุตร', 'ให้นม', 'นมบุตร', 'pregnant', 'breastfeeding']
  },
  {
    key: 'medical_condition',
    severity: 'high',
    keywords: ['โรคประจำตัว', 'หัวใจ', 'ความดัน', 'เบาหวาน', 'ภูมิแพ้', 'แพ้ยา', 'กินยา', 'ยาละลายลิ่มเลือด', 'immune', 'allergy']
  },
  {
    key: 'adverse_event',
    severity: 'high',
    keywords: ['ผลข้างเคียง', 'แพ้', 'บวม', 'ช้ำ', 'แสบ', 'ปวด', 'อักเสบ', 'ติดเชื้อ', 'หายใจไม่ออก', 'หน้ามืด', 'side effect']
  },
  {
    key: 'diagnosis_or_treatment',
    severity: 'medium',
    keywords: ['วินิจฉัย', 'รักษายังไง', 'ต้องฉีด', 'ต้องกินยา', 'ยาอะไร', 'โดส', 'ขนาดยา', 'diagnose', 'dosage']
  },
  {
    key: 'complaint_or_legal',
    severity: 'high',
    keywords: ['ร้องเรียน', 'ฟ้อง', 'คืนเงิน', 'เสียโฉม', 'อันตราย', 'ห่วย', 'ไม่เห็นผล', 'complaint', 'refund']
  }
];

function normalizeText(text) {
  return String(text || '').toLowerCase();
}

function classifyMedicalSafety(text) {
  const lowerText = normalizeText(text);
  const matchedRules = MEDICAL_SAFETY_RULES.filter((rule) =>
    rule.keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()))
  );

  const severityRank = { low: 1, medium: 2, high: 3 };
  const maxSeverity = matchedRules.reduce((current, rule) => (
    severityRank[rule.severity] > severityRank[current] ? rule.severity : current
  ), 'low');

  return {
    requiresHitl: matchedRules.length > 0,
    severity: matchedRules.length > 0 ? maxSeverity : 'low',
    matchedCategories: matchedRules.map((rule) => rule.key),
    matchedKeywords: matchedRules.flatMap((rule) =>
      rule.keywords.filter((keyword) => lowerText.includes(keyword.toLowerCase()))
    )
  };
}

function isMedicalSafetySensitive(text) {
  return classifyMedicalSafety(text).requiresHitl;
}

module.exports = {
  MEDICAL_SAFETY_RULES,
  classifyMedicalSafety,
  isMedicalSafetySensitive
};
