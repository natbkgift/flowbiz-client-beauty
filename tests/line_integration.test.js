const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup } = require('../apps/api/src/modules/onboarding/service');
const { authenticateRequest } = require('../apps/api/src/modules/auth/service');
const {
  sendTextMessage,
  dryRunSend,
  validateWebhookSignature,
  parseInboundEvent
} = require('../apps/api/src/modules/integrations/line/service');
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
    clinicName: `LINE Integration Clinic ${uniqueId}`,
    ownerName: 'LINE Integration Owner',
    email: `line-integration-owner-${uniqueId}@example.com`,
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

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));
  return { pool, session, ownerContext };
}

test('LINE simulated send is the default and records an audit attempt', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv({}, async () => {
    const result = await sendTextMessage({
      clinicId: fixture.ownerContext.currentClinic.id,
      entityId: fixture.ownerContext.currentClinic.id,
      actorUserId: fixture.ownerContext.currentUser.id,
      recipientId: 'U1234567890',
      text: 'สวัสดีค่ะ สนใจให้ทีมงานติดต่อกลับไหมคะ',
      metadata: {
        testCase: 'simulated-default'
      }
    });

    assert.equal(result.provider, 'line');
    assert.equal(result.mode, 'simulated');
    assert.equal(result.integrationStatus, 'simulated');
    assert.equal(result.status, 'sent');

    const auditRows = await fixture.pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and action_type = 'line.outbound_attempt'
        order by id desc
        limit 1
      `,
      [fixture.ownerContext.currentClinic.id]
    );

    assert.equal(auditRows.rowCount, 1);
    assert.equal(auditRows.rows[0].context_json.mode, 'simulated');
    assert.equal(auditRows.rows[0].context_json.status, 'sent');
    assert.equal(JSON.stringify(auditRows.rows[0].context_json).includes('U1234567890'), false);
  });
});

test('LINE real send fails closed unless explicitly enabled and token is configured', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_REAL_SEND_ENABLED: 'false'
    },
    async () => {
      await assert.rejects(
        () => sendTextMessage({
          clinicId: fixture.ownerContext.currentClinic.id,
          actorUserId: fixture.ownerContext.currentUser.id,
          recipientId: 'U1234567890',
          text: 'ข้อความทดสอบ real mode'
        }),
        { code: 'LINE_REAL_SEND_DISABLED' }
      );
    }
  );

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_CHANNEL_ACCESS_TOKEN: undefined,
      LINE_REAL_SEND_ENABLED: 'true'
    },
    async () => {
      await assert.rejects(
        () => sendTextMessage({
          clinicId: fixture.ownerContext.currentClinic.id,
          actorUserId: fixture.ownerContext.currentUser.id,
          recipientId: 'U1234567890',
          text: 'ข้อความทดสอบ missing token'
        }),
        { code: 'LINE_ACCESS_TOKEN_REQUIRED' }
      );
    }
  );
});

test('LINE dry-run works in real mode without triggering provider send', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv(
    {
      LINE_INTEGRATION_MODE: 'real',
      LINE_REAL_SEND_ENABLED: 'false'
    },
    async () => {
      const result = await dryRunSend({
        clinicId: fixture.ownerContext.currentClinic.id,
        actorUserId: fixture.ownerContext.currentUser.id,
        recipientId: 'U1234567890',
        text: 'Dry run message'
      });

      assert.equal(result.mode, 'real');
      assert.equal(result.dryRun, true);
      assert.equal(result.integrationStatus, 'dry_run_real');

      const auditRows = await fixture.pool.query(
        `
          select context_json
          from audit_logs
          where clinic_id = $1
            and action_type = 'line.outbound_attempt'
          order by id desc
          limit 1
        `,
        [fixture.ownerContext.currentClinic.id]
      );

      assert.equal(auditRows.rowCount, 1);
      assert.equal(auditRows.rows[0].context_json.dryRun, true);
      assert.equal(auditRows.rows[0].context_json.status, 'dry_run');
    }
  );
});

test('LINE outbound blocks AI or medical-risk text without HITL approval', async (t) => {
  const fixture = await createFixture(t);

  await withLineEnv({}, async () => {
    await assert.rejects(
      () => sendTextMessage({
        clinicId: fixture.ownerContext.currentClinic.id,
        actorUserId: fixture.ownerContext.currentUser.id,
        recipientId: 'U1234567890',
        source: 'ai',
        text: 'สนใจโปรแกรมเมโสหน้าใสค่ะ'
      }),
      { code: 'HITL_APPROVAL_REQUIRED' }
    );

    await assert.rejects(
      () => sendTextMessage({
        clinicId: fixture.ownerContext.currentClinic.id,
        actorUserId: fixture.ownerContext.currentUser.id,
        recipientId: 'U1234567890',
        text: 'คนไข้ตั้งครรภ์และมีโรคประจำตัว ฉีดโบท็อกซ์ได้ไหม'
      }),
      { code: 'MEDICAL_SAFETY_REVIEW_REQUIRED' }
    );

    const blockedRows = await fixture.pool.query(
      `
        select count(*)::int as blocked_count
        from audit_logs
        where clinic_id = $1
          and action_type = 'line.outbound_blocked'
      `,
      [fixture.ownerContext.currentClinic.id]
    );

    assert.equal(blockedRows.rows[0].blocked_count, 2);
  });
});

test('LINE webhook signature validation uses channel secret and raw body', () => {
  const rawBody = JSON.stringify({
    events: [
      {
        type: 'message',
        message: {
          type: 'text',
          text: 'hello'
        }
      }
    ]
  });
  const channelSecret = 'line-channel-secret-for-test';
  const signature = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');

  const accepted = validateWebhookSignature(
    {
      rawBody,
      headers: {
        'x-line-signature': signature
      }
    },
    { channelSecret }
  );

  assert.equal(accepted.ok, true);
  assert.equal(accepted.integrationStatus, 'line_signature_verified');

  const rejected = validateWebhookSignature(
    {
      rawBody,
      headers: {
        'x-line-signature': 'wrong-signature'
      }
    },
    { channelSecret }
  );

  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'invalid_signature');

  const missingSecret = validateWebhookSignature({ rawBody, headers: { 'x-line-signature': signature } }, { channelSecret: '' });
  assert.equal(missingSecret.ok, false);
  assert.equal(missingSecret.reason, 'missing_channel_secret');
});

test('LINE inbound event parser normalizes message events', () => {
  const parsed = parseInboundEvent({
    type: 'message',
    replyToken: 'reply-token',
    timestamp: 1710000000000,
    source: {
      type: 'user',
      userId: 'U1234567890'
    },
    message: {
      id: 'message-id',
      type: 'text',
      text: 'สวัสดีค่ะ'
    }
  });

  assert.equal(parsed.provider, 'line');
  assert.equal(parsed.eventType, 'message');
  assert.equal(parsed.lineUserId, 'U1234567890');
  assert.equal(parsed.messageType, 'text');
  assert.equal(parsed.text, 'สวัสดีค่ะ');
});

test.after(async () => {
  await closePool();
});
