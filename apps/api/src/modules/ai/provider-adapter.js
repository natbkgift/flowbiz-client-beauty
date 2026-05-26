const crypto = require('node:crypto');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { classifyMedicalSafety } = require('../ai-agent/medical-safety');
const { createPendingAiApprovalMessage } = require('../ai-agent/conversation-service');
const { buildPrompt, getPromptTemplate } = require('./prompt-registry');

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const GEMINI_GENERATE_CONTENT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const PROHIBITED_MEDICAL_CLAIMS = ['ปลอดภัย 100%', 'เห็นผลแน่นอน', 'หายแน่นอน'];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeString(value) {
  return String(value || '').trim();
}

function classifyAiMedicalSafety(text) {
  const base = classifyMedicalSafety(text);
  const normalized = normalizeString(text).toLowerCase();
  const prohibitedClaims = PROHIBITED_MEDICAL_CLAIMS.filter((claim) => normalized.includes(claim.toLowerCase()));
  const requiresHitl = base.requiresHitl || prohibitedClaims.length > 0;

  return {
    ...base,
    requiresHitl,
    severity: prohibitedClaims.length > 0 ? 'high' : base.severity,
    matchedCategories: prohibitedClaims.length > 0
      ? Array.from(new Set([...base.matchedCategories, 'prohibited_medical_claim']))
      : base.matchedCategories,
    matchedKeywords: prohibitedClaims.length > 0
      ? Array.from(new Set([...base.matchedKeywords, ...prohibitedClaims]))
      : base.matchedKeywords,
    prohibitedClaims
  };
}

function getAiRuntime(configOverride = null) {
  const config = configOverride || loadConfig();
  return {
    provider: config.aiProvider || 'mock',
    realGenerationEnabled: config.aiRealGenerationEnabled === true,
    geminiApiKey: config.geminiApiKey || '',
    openaiApiKey: config.openaiApiKey || '',
    geminiModel: config.geminiModel || 'gemini-2.5-flash',
    openaiModel: config.openaiModel || 'gpt-4.1-mini'
  };
}

function normalizeSuggestionInput(input = {}) {
  const useCase = normalizeString(input.useCase || 'reply_suggestion');
  const template = getPromptTemplate(useCase);

  if (!template) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'Unsupported AI prompt use case.');
  }

  return {
    clinicId: input.clinicId ? Number(input.clinicId) : null,
    leadId: input.leadId ? Number(input.leadId) : null,
    actorUserId: input.actorUserId || null,
    useCase,
    tone: normalizeString(input.tone || 'friendly') || 'friendly',
    inputText: normalizeString(input.inputText),
    variables: input.variables && typeof input.variables === 'object' && !Array.isArray(input.variables)
      ? input.variables
      : {},
    source: normalizeString(input.source || 'ai_provider') || 'ai_provider'
  };
}

function buildMockText(input, medicalSafety) {
  const customerName = normalizeString(input.variables.customerName || input.variables.leadName || 'คุณลูกค้า');
  const treatment = normalizeString(input.variables.treatment || input.variables.interest || 'บริการความงาม');

  if (medicalSafety.requiresHitl && medicalSafety.severity === 'high') {
    return `สวัสดีค่ะ${customerName} ข้อมูลนี้เกี่ยวข้องกับความปลอดภัยทางการแพทย์ ทีมงานจะส่งให้เจ้าหน้าที่หรือแพทย์ตรวจสอบก่อนตอบกลับ เพื่อให้คำแนะนำเหมาะสมกับคุณลูกค้านะคะ`;
  }

  const templates = {
    reply_suggestion: `สวัสดีค่ะ${customerName} ทีมงานได้รับข้อมูลเรื่อง${treatment}แล้วค่ะ ขออนุญาตให้เจ้าหน้าที่ตรวจรายละเอียดและแนะนำขั้นตอนที่เหมาะสมก่อนยืนยันนัดหมายนะคะ`,
    follow_up_copy: `สวัสดีค่ะ${customerName} ขออนุญาตติดตามเรื่อง${treatment}นะคะ หากสะดวก ทีมงานช่วยสรุปตัวเลือกและเวลานัดปรึกษาให้ได้ค่ะ`,
    broadcast_copy: `โปรแกรม${treatment}พร้อมให้ปรึกษากับทีมงานคลินิกแล้วค่ะ สนใจให้เจ้าหน้าที่ช่วยประเมินข้อมูลเบื้องต้นและแนะนำรอบนัดที่เหมาะสม ทักกลับมาได้เลยค่ะ`,
    lead_summary: `${customerName} สนใจ${treatment} แนะนำให้เจ้าหน้าที่ตรวจสอบประวัติการติดต่อ ความต้องการหลัก และส่งต่อการปรึกษาก่อนเสนอข้อความถัดไป`,
    no_show_recovery_copy: `สวัสดีค่ะ${customerName} เห็นว่าวันนัดล่าสุดอาจไม่สะดวกเข้ามา ทางทีมงานช่วยดูรอบนัดใหม่ให้ได้ค่ะ สะดวกเป็นวันหรือช่วงเวลาไหนคะ`,
    review_request_copy: `สวัสดีค่ะ${customerName} ขอบคุณที่ไว้วางใจคลินิกนะคะ หากสะดวก สามารถแบ่งปันประสบการณ์หลังรับบริการเพื่อช่วยให้ทีมงานปรับปรุงการดูแลได้ค่ะ`,
    repeat_treatment_reminder_copy: `สวัสดีค่ะ${customerName} ถึงรอบที่ควรปรึกษาเรื่อง${treatment}อีกครั้งแล้วค่ะ ทีมงานช่วยเช็กข้อมูลเดิมและจัดเวลาปรึกษากับคลินิกให้ได้ค่ะ`
  };

  return templates[input.useCase] || templates.reply_suggestion;
}

function extractOpenAiText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') {
        chunks.push(content.text);
      } else if (typeof content.text?.value === 'string') {
        chunks.push(content.text.value);
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractGeminiText(payload = {}) {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('\n').trim();
}

async function callOpenAi(prompt, runtime, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', 'Fetch API is unavailable for OpenAI generation.');
  }

  const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: runtime.openaiModel,
      input: prompt,
      max_output_tokens: 320
    })
  });

  if (!response.ok) {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', `OpenAI provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const text = extractOpenAiText(payload);

  if (!text) {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', 'OpenAI provider returned an empty response.');
  }

  return {
    text,
    providerRequestId: payload.id || null
  };
}

async function callGemini(prompt, runtime, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', 'Fetch API is unavailable for Gemini generation.');
  }

  const endpoint = `${GEMINI_GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(runtime.geminiModel)}:generateContent?key=${encodeURIComponent(runtime.geminiApiKey)}`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 320
      }
    })
  });

  if (!response.ok) {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', `Gemini provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);

  if (!text) {
    throw new AppError(502, 'AI_PROVIDER_GENERATION_FAILED', 'Gemini provider returned an empty response.');
  }

  return {
    text,
    providerRequestId: null
  };
}

async function generateProviderText(input = {}, options = {}) {
  const normalized = normalizeSuggestionInput(input);
  const runtime = getAiRuntime(options.config);
  const prompt = buildPrompt(normalized);
  const preSafety = classifyAiMedicalSafety(`${normalized.inputText}\n${JSON.stringify(normalized.variables)}`);
  let text;
  let providerRequestId = null;
  let model = 'mock';

  if (runtime.provider === 'mock') {
    text = options.mockText || buildMockText(normalized, preSafety);
  } else {
    if (!runtime.realGenerationEnabled) {
      throw new AppError(400, 'AI_REAL_GENERATION_DISABLED', 'AI real generation is disabled. Set AI_REAL_GENERATION_ENABLED=true explicitly.');
    }

    if (runtime.provider === 'openai') {
      if (!runtime.openaiApiKey) {
        throw new AppError(400, 'AI_PROVIDER_API_KEY_REQUIRED', 'OPENAI_API_KEY is required for real OpenAI generation.');
      }
      model = runtime.openaiModel;
      ({ text, providerRequestId } = await callOpenAi(prompt, runtime, options));
    } else if (runtime.provider === 'gemini') {
      if (!runtime.geminiApiKey) {
        throw new AppError(400, 'AI_PROVIDER_API_KEY_REQUIRED', 'GEMINI_API_KEY is required for real Gemini generation.');
      }
      model = runtime.geminiModel;
      ({ text, providerRequestId } = await callGemini(prompt, runtime, options));
    }
  }

  const outputText = normalizeString(text);
  const postSafety = classifyAiMedicalSafety(outputText);

  if (postSafety.prohibitedClaims.length > 0) {
    throw new AppError(400, 'MEDICAL_SAFETY_REVIEW_REQUIRED', 'AI output contains prohibited medical claims and was blocked.');
  }

  return {
    provider: runtime.provider,
    model,
    providerRequestId,
    useCase: normalized.useCase,
    promptHash: sha256(prompt),
    inputHash: sha256(normalized.inputText),
    inputLength: normalized.inputText.length,
    outputHash: sha256(outputText),
    outputLength: outputText.length,
    text: outputText,
    preSafety,
    postSafety,
    requiresHitl: true,
    normalizedInput: normalized
  };
}

async function auditGeneration(input, providerResult, status, reason = null) {
  if (!input.clinicId) {
    return null;
  }

  return recordAuditLog({
    clinicId: Number(input.clinicId),
    entityType: input.leadId ? 'lead' : 'clinic',
    entityId: Number(input.leadId || input.clinicId),
    actionType: status === 'queued' ? 'ai.provider_generation_queued' : 'ai.provider_generation_blocked',
    actorUserId: input.actorUserId || null,
    contextJson: {
      status,
      reason,
      provider: providerResult?.provider || null,
      model: providerResult?.model || null,
      useCase: input.useCase,
      promptHash: providerResult?.promptHash || null,
      inputHash: providerResult?.inputHash || sha256(input.inputText),
      inputLength: providerResult?.inputLength ?? input.inputText.length,
      outputHash: providerResult?.outputHash || null,
      outputLength: providerResult?.outputLength || 0,
      providerRequestId: providerResult?.providerRequestId || null,
      preSafety: providerResult?.preSafety || null,
      postSafety: providerResult?.postSafety || null,
      hitlRequired: true,
      rawPiiLogged: false
    }
  });
}

async function queueAiSuggestionForHitl(providerResult, input = {}) {
  const normalized = providerResult.normalizedInput || normalizeSuggestionInput(input);

  if (!normalized.clinicId || !normalized.leadId) {
    throw new AppError(400, 'AI_HITL_QUEUE_REQUIRED', 'AI suggestions require clinicId and leadId so staff can approve before send.');
  }

  const message = await createPendingAiApprovalMessage({
    clinicId: normalized.clinicId,
    leadId: normalized.leadId,
    inboundText: `AI provider ${providerResult.useCase} suggestion queued for staff approval.`,
    replyText: providerResult.text,
    confidenceScore: providerResult.postSafety.requiresHitl ? 0.72 : 0.86,
    agentType: `provider_${providerResult.useCase}`.slice(0, 50),
    actorUserId: normalized.actorUserId,
    auditActionType: 'ai.provider_suggestion_requires_hitl',
    contextJson: {
      provider: providerResult.provider,
      model: providerResult.model,
      useCase: providerResult.useCase,
      inputHash: providerResult.inputHash,
      inputLength: providerResult.inputLength,
      outputHash: providerResult.outputHash,
      outputLength: providerResult.outputLength,
      providerRequestId: providerResult.providerRequestId,
      preSafety: providerResult.preSafety,
      postSafety: providerResult.postSafety,
      rawPiiLogged: false
    }
  });

  await auditGeneration(normalized, providerResult, 'queued');

  return {
    messageId: Number(message.id),
    status: message.status,
    hitlRequired: true
  };
}

async function generateAiSuggestion(input = {}, options = {}) {
  const normalized = normalizeSuggestionInput(input);

  try {
    const providerResult = await generateProviderText(normalized, options);
    const hitl = await queueAiSuggestionForHitl(providerResult, normalized);

    return {
      ...providerResult,
      normalizedInput: undefined,
      hitl
    };
  } catch (error) {
    await auditGeneration(normalized, null, 'blocked', error.code || error.message);
    throw error;
  }
}

module.exports = {
  OPENAI_RESPONSES_ENDPOINT,
  GEMINI_GENERATE_CONTENT_BASE_URL,
  PROHIBITED_MEDICAL_CLAIMS,
  classifyAiMedicalSafety,
  generateProviderText,
  generateAiSuggestion,
  queueAiSuggestionForHitl
};
