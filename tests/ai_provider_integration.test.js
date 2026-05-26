const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { closePool } = require('../apps/api/src/db');
const {
  generateAiSuggestion,
  classifyAiMedicalSafety,
  OPENAI_RESPONSES_ENDPOINT
} = require('../apps/api/src/modules/ai/provider-adapter');

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'AI_REAL_GENERATION_ENABLED',
  'GEMINI_MODEL',
  'OPENAI_MODEL'
];

function withAiEnv(overrides, run) {
  const previous = Object.fromEntries(AI_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of AI_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      if (overrides[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = overrides[key];
      }
    } else {
      delete process.env[key];
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of AI_ENV_KEYS) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    });
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `AI Provider Clinic ${uniqueId}`,
    ownerName: 'AI Provider Owner',
    email: `ai-provider-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } finally {
      await pool.end();
    }
  });

  const context = {
    ...session,
    currentUser: session.user
  };
  const lead = await createLead(context, {
    fullName: `AI Provider Lead ${uniqueId}`,
    source: 'line',
    status: 'new',
    stage: 'inquiry',
    ownerUserId: session.user.id,
    phone: `089${String(uniqueId).slice(-7)}`,
    email: `ai-provider-lead-${uniqueId}@example.com`
  });

  return { pool, session, lead };
}

test('AI mock provider is default, queues HITL approval, and records PII-safe audit metadata', async (t) => {
  const fixture = await createFixture(t);

  await withAiEnv({}, async () => {
    const result = await generateAiSuggestion({
      clinicId: fixture.session.currentClinic.id,
      leadId: fixture.lead.id,
      actorUserId: fixture.session.user.id,
      useCase: 'no_show_recovery_copy',
      tone: 'friendly',
      inputText: 'ลูกค้าไม่มาตามนัดเมื่อวานนี้',
      variables: {
        treatment: 'Botox follow-up'
      }
    });

    assert.equal(result.provider, 'mock');
    assert.equal(result.hitl.status, 'pending_approval');
    assert.equal(result.hitl.hitlRequired, true);
    assert.ok(result.text.length > 20);

    const queueRows = await fixture.pool.query(
      `
        select *
        from ai_hitl_approval_queue
        where clinic_id = $1
          and lead_id = $2
          and status = 'pending'
        order by id desc
        limit 1
      `,
      [fixture.session.currentClinic.id, fixture.lead.id]
    );

    assert.equal(queueRows.rowCount, 1);
    assert.equal(queueRows.rows[0].ai_response_text, result.text);

    const auditRows = await fixture.pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and action_type = 'ai.provider_generation_queued'
        order by id desc
        limit 1
      `,
      [fixture.session.currentClinic.id]
    );

    assert.equal(auditRows.rowCount, 1);
    assert.equal(auditRows.rows[0].context_json.provider, 'mock');
    assert.equal(auditRows.rows[0].context_json.hitlRequired, true);
    assert.equal(auditRows.rows[0].context_json.rawPiiLogged, false);
    assert.equal(JSON.stringify(auditRows.rows[0].context_json).includes(fixture.lead.email), false);
  });
});

test('AI real provider modes fail closed when disabled or missing API keys', async (t) => {
  const fixture = await createFixture(t);
  let fetchCalled = false;

  await withAiEnv(
    {
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-openai-key',
      AI_REAL_GENERATION_ENABLED: 'false'
    },
    async () => {
      await assert.rejects(
        () => generateAiSuggestion(
          {
            clinicId: fixture.session.currentClinic.id,
            leadId: fixture.lead.id,
            actorUserId: fixture.session.user.id,
            useCase: 'reply_suggestion',
            inputText: 'สนใจโบท็อกซ์ค่ะ'
          },
          {
            fetchImpl: async () => {
              fetchCalled = true;
              return { ok: true };
            }
          }
        ),
        { code: 'AI_REAL_GENERATION_DISABLED' }
      );
    }
  );

  await withAiEnv(
    {
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: undefined,
      AI_REAL_GENERATION_ENABLED: 'true'
    },
    async () => {
      await assert.rejects(
        () => generateAiSuggestion({
          clinicId: fixture.session.currentClinic.id,
          leadId: fixture.lead.id,
          actorUserId: fixture.session.user.id,
          useCase: 'follow_up_copy',
          inputText: 'ยังไม่ได้ตอบกลับ'
        }),
        { code: 'AI_PROVIDER_API_KEY_REQUIRED' }
      );
    }
  );

  assert.equal(fetchCalled, false);
});

test('AI OpenAI adapter uses Responses API and still queues generated text into HITL', async (t) => {
  const fixture = await createFixture(t);
  const generatedText = 'สวัสดีค่ะ ทีมงานขออนุญาตสรุปข้อมูลและให้เจ้าหน้าที่ตรวจสอบก่อนตอบกลับนะคะ';
  let calledEndpoint = '';

  await withAiEnv(
    {
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-openai-key',
      AI_REAL_GENERATION_ENABLED: 'true',
      OPENAI_MODEL: 'test-model'
    },
    async () => {
      const result = await generateAiSuggestion(
        {
          clinicId: fixture.session.currentClinic.id,
          leadId: fixture.lead.id,
          actorUserId: fixture.session.user.id,
          useCase: 'reply_suggestion',
          inputText: 'สนใจปรึกษาเรื่องริ้วรอย'
        },
        {
          fetchImpl: async (url, request) => {
            calledEndpoint = url;
            assert.equal(request.method, 'POST');
            assert.equal(request.headers.Authorization, 'Bearer test-openai-key');
            return {
              ok: true,
              json: async () => ({
                id: 'resp_test_123',
                output_text: generatedText
              })
            };
          }
        }
      );

      assert.equal(calledEndpoint, OPENAI_RESPONSES_ENDPOINT);
      assert.equal(result.provider, 'openai');
      assert.equal(result.model, 'test-model');
      assert.equal(result.text, generatedText);
      assert.equal(result.hitl.status, 'pending_approval');
    }
  );
});

test('AI medical safety flags risky and prohibited language before generation', () => {
  const medicalRisk = classifyAiMedicalSafety('ลูกค้าตั้งครรภ์และถามว่าฉีดโบท็อกซ์ได้ไหม');
  assert.equal(medicalRisk.requiresHitl, true);
  assert.equal(medicalRisk.severity, 'high');
  assert.ok(medicalRisk.matchedCategories.includes('pregnancy'));

  const prohibitedClaim = classifyAiMedicalSafety('โปรแกรมนี้ปลอดภัย 100% และเห็นผลแน่นอน');
  assert.equal(prohibitedClaim.requiresHitl, true);
  assert.equal(prohibitedClaim.severity, 'high');
  assert.ok(prohibitedClaim.matchedCategories.includes('prohibited_medical_claim'));
});

test.after(async () => {
  await closePool();
});
