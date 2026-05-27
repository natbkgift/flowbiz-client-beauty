const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { sendLeadOutboundMessage } = require('../apps/api/src/modules/messaging/service');
const { closePool } = require('../apps/api/src/db');

const LINE_ENV_KEYS = [
  'LINE_INTEGRATION_MODE',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_REAL_SEND_ENABLED'
];

function buildAuthRequest(token) {
  return {
    headers: {
      authorization: `Bearer ${token}`
    }
  };
}

function withLineEnv(overrides, run) {
  const previous = Object.fromEntries(LINE_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LINE_ENV_KEYS) {
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
      for (const key of LINE_ENV_KEYS) {
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
    clinicName: `Messaging Wiring Clinic ${uniqueId}`,
    ownerName: 'Messaging Wiring Owner',
    email: `messaging-wiring-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));
  const lineRecipient = `U-line-${uniqueId}`;
  const emailRecipient = `lead-${uniqueId}@example.com`;

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } finally {
      await pool.end();
    }
  });

  const leadResult = await pool.query(
    `
      insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage, line_user_id, email)
      values ($1, $2, $3, 'line', $4, 'new', 'inquiry', $5, $6)
      returning id
    `,
    [
      ownerContext.currentClinic.id,
      ownerContext.currentOrganization.id,
      ownerContext.currentWorkspace.id,
      `Messaging Lead ${uniqueId}`,
      lineRecipient,
      emailRecipient
    ]
  );
  const leadId = Number(leadResult.rows[0].id);

  const channelResult = await pool.query(
    `
      insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
      values
        ($1, 'line', $2, 'active', true, '{}'::jsonb),
        ($1, 'email', $3, 'active', false, '{}'::jsonb)
      returning id, channel_type
    `,
    [ownerContext.currentClinic.id, `LINE ${uniqueId}`, `Email ${uniqueId}`]
  );

  const channels = Object.fromEntries(channelResult.rows.map((row) => [row.channel_type, Number(row.id)]));

  await pool.query(
    `
      insert into contact_identities (clinic_id, entity_type, entity_id, channel_type, external_id, is_primary)
      values
        ($1, 'lead', $2, 'line', $3, true),
        ($1, 'lead', $2, 'email', $4, true)
    `,
    [ownerContext.currentClinic.id, leadId, lineRecipient, emailRecipient]
  );

  return {
    pool,
    ownerContext,
    leadId,
    lineChannelId: channels.line,
    emailChannelId: channels.email,
    lineRecipient,
    emailRecipient
  };
}

async function getLatestAudit(pool, clinicId, actionType) {
  const result = await pool.query(
    `
      select context_json
      from audit_logs
      where clinic_id = $1 and action_type = $2
      order by id desc
      limit 1
    `,
    [clinicId, actionType]
  );

  assert.equal(result.rowCount, 1);
  return result.rows[0].context_json;
}

async function countOutboundMessages(pool, clinicId, leadId) {
  const result = await pool.query(
    `
      select count(*)::int as outbound_count
      from outbound_messages
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2
    `,
    [clinicId, leadId]
  );

  return result.rows[0].outbound_count;
}

function createFetchStub(requestId = 'line-request-id-123') {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      headers: {
        get(name) {
          return name.toLowerCase() === 'x-line-request-id' ? requestId : null;
        }
      }
    };
  };

  return { calls, fetchImpl };
}

test('simulated default still works for the product LINE messaging path', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv({}, async () => {
    const outbound = await sendLeadOutboundMessage(
      fixture.ownerContext,
      fixture.leadId,
      { channelId: fixture.lineChannelId, content: 'ข้อความทดสอบ low-risk manual' }
    );

    assert.equal(outbound.channelType, 'line');
    assert.equal(outbound.status, 'sent');
    assert.match(outbound.providerMessageId, /^local-\d+-line$/);

    const messageAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'message.send');
    const lineAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'line.outbound_attempt');

    assert.equal(messageAudit.integrationStatus, 'simulated');
    assert.equal(lineAudit.integrationStatus, 'simulated');
    assert.equal(JSON.stringify(lineAudit).includes(fixture.lineRecipient), false);
    assert.equal(JSON.stringify(lineAudit).includes('ข้อความทดสอบ low-risk manual'), false);
  });
});

test('product LINE route fails closed when real mode is disabled', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'false'
    },
    async () => {
      const beforeCount = await countOutboundMessages(
        fixture.pool,
        fixture.ownerContext.currentClinic.id,
        fixture.leadId
      );

      await assert.rejects(
        () => sendLeadOutboundMessage(
          fixture.ownerContext,
          fixture.leadId,
          { channelId: fixture.lineChannelId, content: 'ข้อความทดสอบ disabled real send' }
        ),
        { code: 'LINE_REAL_SEND_DISABLED' }
      );

      const afterCount = await countOutboundMessages(
        fixture.pool,
        fixture.ownerContext.currentClinic.id,
        fixture.leadId
      );
      const blockedAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'line.outbound_blocked');

      assert.equal(afterCount, beforeCount);
      assert.equal(blockedAudit.integrationStatus, 'real_blocked');
      assert.equal(JSON.stringify(blockedAudit).includes(fixture.lineRecipient), false);
    }
  );
});

test('product LINE route blocks when the real token is missing', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: undefined,
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      await assert.rejects(
        () => sendLeadOutboundMessage(
          fixture.ownerContext,
          fixture.leadId,
          { channelId: fixture.lineChannelId, content: 'ข้อความทดสอบ missing token' }
        ),
        { code: 'LINE_ACCESS_TOKEN_REQUIRED' }
      );

      const blockedAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'line.outbound_blocked');
      assert.equal(blockedAudit.integrationStatus, 'real_blocked');
    }
  );
});

test('manual low-risk approved message can call the LINE adapter in mocked real mode', async (t) => {
  const fixture = await createFixture(t);
  const fetchStub = createFetchStub('line-request-id-real-manual');

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      const outbound = await sendLeadOutboundMessage(
        fixture.ownerContext,
        fixture.leadId,
        { channelId: fixture.lineChannelId, content: 'นัดได้เลยค่ะ ทีมงานพร้อมช่วยดูคิวให้' },
        {
          approved: true,
          providerOptions: {
            fetchImpl: fetchStub.fetchImpl
          }
        }
      );

      assert.equal(fetchStub.calls.length, 1);
      assert.equal(outbound.status, 'sent');
      assert.equal(outbound.providerMessageId, 'line-request-id-real-manual');

      const messageAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'message.send');
      const lineAudit = await getLatestAudit(fixture.pool, fixture.ownerContext.currentClinic.id, 'line.outbound_attempt');

      assert.equal(messageAudit.integrationStatus, 'real_send');
      assert.equal(lineAudit.integrationStatus, 'real_send');
      assert.equal(JSON.stringify(lineAudit).includes(fixture.lineRecipient), false);
      assert.equal(JSON.stringify(lineAudit).includes('นัดได้เลยค่ะ ทีมงานพร้อมช่วยดูคิวให้'), false);
    }
  );
});

test('AI-generated LINE text cannot send until approved, then can route after approval', async (t) => {
  const fixture = await createFixture(t);
  const fetchStub = createFetchStub('line-request-id-ai-approved');

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      await assert.rejects(
        () => sendLeadOutboundMessage(
          fixture.ownerContext,
          fixture.leadId,
          { channelId: fixture.lineChannelId, content: 'ข้อความ AI รอตรวจสอบก่อนส่ง' },
          {
            source: 'ai',
            approved: false,
            providerOptions: {
              fetchImpl: fetchStub.fetchImpl
            }
          }
        ),
        { code: 'HITL_APPROVAL_REQUIRED' }
      );

      const approvedOutbound = await sendLeadOutboundMessage(
        fixture.ownerContext,
        fixture.leadId,
        { channelId: fixture.lineChannelId, content: 'ข้อความ AI ที่ผ่านการอนุมัติแล้ว' },
        {
          source: 'ai',
          approved: true,
          providerOptions: {
            fetchImpl: fetchStub.fetchImpl
          }
        }
      );

      assert.equal(fetchStub.calls.length, 1);
      assert.equal(approvedOutbound.status, 'sent');
      assert.equal(approvedOutbound.providerMessageId, 'line-request-id-ai-approved');
    }
  );
});

test('medical-risk LINE text requires approval before send', async (t) => {
  const fixture = await createFixture(t);
  const fetchStub = createFetchStub('line-request-id-medical-approved');

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      await assert.rejects(
        () => sendLeadOutboundMessage(
          fixture.ownerContext,
          fixture.leadId,
          { channelId: fixture.lineChannelId, content: 'คนไข้ตั้งครรภ์ ฉีดโบท็อกซ์ได้ไหมคะ' }
        ),
        { code: 'MEDICAL_SAFETY_REVIEW_REQUIRED' }
      );

      const approvedOutbound = await sendLeadOutboundMessage(
        fixture.ownerContext,
        fixture.leadId,
        { channelId: fixture.lineChannelId, content: 'คนไข้ตั้งครรภ์ ฉีดโบท็อกซ์ได้ไหมคะ' },
        {
          approved: true,
          providerOptions: {
            fetchImpl: fetchStub.fetchImpl
          }
        }
      );

      assert.equal(approvedOutbound.status, 'sent');
      assert.equal(fetchStub.calls.length, 1);
    }
  );
});

test('non-LINE channels keep the previous simulated provider behavior', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      const outbound = await sendLeadOutboundMessage(
        fixture.ownerContext,
        fixture.leadId,
        { channelId: fixture.emailChannelId, content: 'email fallback still simulated' }
      );

      assert.equal(outbound.channelType, 'email');
      assert.equal(outbound.status, 'sent');
      assert.match(outbound.providerMessageId, /^local-\d+-email$/);

      const lineAuditCount = await fixture.pool.query(
        `
          select count(*)::int as audit_count
          from audit_logs
          where clinic_id = $1 and action_type like 'line.%'
        `,
        [fixture.ownerContext.currentClinic.id]
      );

      assert.equal(lineAuditCount.rows[0].audit_count, 0);
    }
  );
});

test.after(async () => {
  await closePool();
});