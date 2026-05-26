const PROMPT_REGISTRY = {
  reply_suggestion: {
    label: 'Reply suggestion',
    goal: 'Draft a concise staff-reviewed reply for a beauty clinic lead.',
    outputInstruction: 'Return only the message text that a staff member can review before sending.'
  },
  follow_up_copy: {
    label: 'Follow-up copy',
    goal: 'Draft a polite follow-up for a lead who has not replied.',
    outputInstruction: 'Return one short follow-up message with a clear next step.'
  },
  broadcast_copy: {
    label: 'Broadcast copy',
    goal: 'Draft marketing broadcast copy that avoids medical guarantees and requires staff approval.',
    outputInstruction: 'Return one broadcast message draft. Do not include claims of guaranteed results.'
  },
  lead_summary: {
    label: 'Lead summary',
    goal: 'Summarize lead intent and the next safest staff action.',
    outputInstruction: 'Return a short operational summary for internal staff review.'
  },
  no_show_recovery_copy: {
    label: 'No-show recovery copy',
    goal: 'Draft a respectful no-show recovery message.',
    outputInstruction: 'Return one message that helps reschedule without pressure.'
  },
  review_request_copy: {
    label: 'Review request copy',
    goal: 'Draft a post-visit review request.',
    outputInstruction: 'Return one message asking for a review without incentives that could bias medical feedback.'
  },
  repeat_treatment_reminder_copy: {
    label: 'Repeat treatment reminder copy',
    goal: 'Draft a reminder that a customer may be due for a repeat treatment consultation.',
    outputInstruction: 'Return one message that asks the customer to consult the clinic before deciding.'
  }
};

function getPromptTemplate(useCase) {
  return PROMPT_REGISTRY[useCase] || null;
}

function listPromptUseCases() {
  return Object.keys(PROMPT_REGISTRY);
}

function compactValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function buildPrompt({ useCase, tone = 'friendly', inputText = '', variables = {} }) {
  const template = getPromptTemplate(useCase);

  if (!template) {
    throw new Error(`Unknown AI prompt use case: ${useCase}`);
  }

  const variableLines = Object.entries(variables || {})
    .map(([key, value]) => [key, compactValue(value)])
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  return [
    'You are FlowBiz Beauty, an AI Marketing & Revenue Automation assistant for aesthetic clinics.',
    'Draft content for staff review only. Do not send messages automatically.',
    'Safety rules:',
    '- Never claim guaranteed medical outcomes.',
    '- Do not use: "ปลอดภัย 100%", "เห็นผลแน่นอน", "หายแน่นอน".',
    '- Do not diagnose, prescribe, or replace a doctor consultation.',
    '- If the request involves pregnancy, medical conditions, adverse events, complaints, or medication, keep the response conservative and route to staff/doctor review.',
    `Use case: ${template.label}`,
    `Goal: ${template.goal}`,
    `Tone: ${tone}`,
    inputText ? `Input context: ${inputText}` : '',
    variableLines ? `Structured context:\n${variableLines}` : '',
    template.outputInstruction
  ].filter(Boolean).join('\n');
}

module.exports = {
  PROMPT_REGISTRY,
  buildPrompt,
  getPromptTemplate,
  listPromptUseCases
};
