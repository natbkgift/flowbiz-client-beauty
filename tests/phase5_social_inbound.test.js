const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const { handleTikTokWebhook } = require('../apps/api/src/modules/integration-gateway/tiktok-handler');
const { handleFacebookWebhook } = require('../apps/api/src/modules/integration-gateway/facebook-handler');

function buildAuthRequest(token, extraHeaders = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders
    }
  };
}

async function createFixture(t) {
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const session = await signup({
    clinicName: `Social Clinic ${uniqueId}`,
    ownerName: 'Social Owner',
    email: `social-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
    await pool.query('delete from users where id = $1', [session.user.id]);
    await pool.end();
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    ownerContext
  };
}

test('TikTok Lead Webhook parses, buffers raw payload, and creates lead successfully', async (t) => {
  const fixture = await createFixture(t);
  
  // Mock Request Object
  const req = {
    params: { clinicId: String(fixture.session.currentClinic.id) },
    query: { secret: 'valid-secret', workspaceId: String(fixture.session.currentWorkspace.id) },
    headers: { 'x-tiktok-signature': 'valid-secret' },
    body: {
      lead_id: 'tiktok-lead-12345',
      campaign_name: 'Super Botox campaign 2026',
      user_answers: [
        { name: 'Full Name', value: 'Jane TikTok Doe' },
        { name: 'Phone Number', value: '0899999999' },
        { name: 'Email', value: 'jane.doe@tiktok.com' }
      ]
    }
  };

  let responseStatus = 200;
  let responseData = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleTikTokWebhook(req, res, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 201);
  assert.ok(responseData.success);
  assert.ok(responseData.leadId);
  assert.ok(responseData.inboundRawId);

  // Check Database for Raw Buffering
  const rawRows = await fixture.pool.query(
    'select * from inbound_leads_raw where id = $1',
    [responseData.inboundRawId]
  );
  assert.equal(rawRows.rows.length, 1);
  assert.equal(rawRows.rows[0].source, 'tiktok');
  assert.equal(rawRows.rows[0].processed, true);
  assert.equal(Number(rawRows.rows[0].processed_lead_id), Number(responseData.leadId));

  // Check Database for CRM Lead details
  const leadRows = await fixture.pool.query(
    'select * from leads where id = $1',
    [responseData.leadId]
  );
  assert.equal(leadRows.rows.length, 1);
  assert.equal(leadRows.rows[0].full_name, 'Jane TikTok Doe');
  assert.equal(leadRows.rows[0].phone, '0899999999');
  assert.equal(leadRows.rows[0].email, 'jane.doe@tiktok.com');
  assert.equal(leadRows.rows[0].source, 'tiktok');
  assert.equal(leadRows.rows[0].source_ref, 'tiktok-lead-12345');

  // Check Database for Note details
  const noteRows = await fixture.pool.query(
    "select * from notes where entity_type = 'lead' and entity_id = $1",
    [responseData.leadId]
  );
  assert.ok(noteRows.rows.length >= 1);
  assert.ok(noteRows.rows[0].content.includes('TikTok Ads Ingest'));
});

test('Facebook Lead Ads Webhook parses, buffers, and creates lead successfully', async (t) => {
  const fixture = await createFixture(t);

  const req = {
    params: { clinicId: String(fixture.session.currentClinic.id) },
    query: { secret: 'valid-secret', workspaceId: String(fixture.session.currentWorkspace.id) },
    headers: { 'x-hub-signature-256': 'valid-secret' },
    body: {
      leadgen_id: 'fb-leadgen-999888',
      field_data: [
        { name: 'full_name', values: ['Jane Facebook Doe'] },
        { name: 'phone_number', values: ['0888888888'] },
        { name: 'email', values: ['jane.doe@facebook.com'] }
      ]
    }
  };

  let responseStatus = 200;
  let responseData = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleFacebookWebhook(req, res, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 201);
  assert.ok(responseData.success);
  assert.equal(responseData.event, 'leadgen');
  assert.ok(responseData.leadId);

  const rawRows = await fixture.pool.query(
    'select * from inbound_leads_raw where id = $1',
    [responseData.inboundRawId]
  );
  assert.equal(rawRows.rows.length, 1);
  assert.equal(rawRows.rows[0].source, 'facebook');
  assert.equal(rawRows.rows[0].processed, true);

  const leadRows = await fixture.pool.query(
    'select * from leads where id = $1',
    [responseData.leadId]
  );
  assert.equal(leadRows.rows.length, 1);
  assert.equal(leadRows.rows[0].full_name, 'Jane Facebook Doe');
  assert.equal(leadRows.rows[0].phone, '0888888888');
  assert.equal(leadRows.rows[0].email, 'jane.doe@facebook.com');
  assert.equal(leadRows.rows[0].source, 'facebook');
  assert.equal(leadRows.rows[0].source_ref, 'fb-leadgen-999888');
});

test('Facebook Page Comment Webhook scans intent, triggers auto-reply and creates lead only on high-intent keywords', async (t) => {
  const fixture = await createFixture(t);

  // 1. Low Intent Comment Test (Should NOT trigger auto-reply or create lead)
  const reqLow = {
    params: { clinicId: String(fixture.session.currentClinic.id) },
    query: { secret: 'valid-secret', workspaceId: String(fixture.session.currentWorkspace.id) },
    headers: { 'x-hub-signature-256': 'valid-secret' },
    body: {
      object: 'page',
      entry: [{
        changes: [{
          field: 'feed',
          value: {
            item: 'comment',
            verb: 'add',
            comment_id: 'comment-111222',
            post_id: 'post-100200',
            message: 'สวยมากเลยค่ะคุณหมอ',
            from: { id: 'fb-user-1', name: 'Low Intent User' }
          }
        }]
      }]
    }
  };

  let responseStatus = 200;
  let responseData = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  await handleFacebookWebhook(reqLow, res, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 200);
  assert.equal(responseData.event, 'comment');
  assert.equal(responseData.processed, false);
  assert.equal(responseData.leadId, null);
  assert.equal(responseData.autoReplySent, false);

  // 2. High Intent Comment Test (Should trigger auto-reply and create lead)
  const reqHigh = {
    params: { clinicId: String(fixture.session.currentClinic.id) },
    query: { secret: 'valid-secret', workspaceId: String(fixture.session.currentWorkspace.id) },
    headers: { 'x-hub-signature-256': 'valid-secret' },
    body: {
      object: 'page',
      entry: [{
        changes: [{
          field: 'feed',
          value: {
            item: 'comment',
            verb: 'add',
            comment_id: 'comment-333444',
            post_id: 'post-100200',
            message: 'สนใจ ราคาโปรโมชั่นโบท็อกซ์ลดริ้วรอยเท่าไหร่คะแอดมิน?',
            from: { id: 'fb-user-2', name: 'High Intent User' }
          }
        }]
      }]
    }
  };

  await handleFacebookWebhook(reqHigh, res, (err) => {
    if (err) throw err;
  });

  assert.equal(responseStatus, 200);
  assert.equal(responseData.event, 'comment');
  assert.equal(responseData.processed, true);
  assert.ok(responseData.leadId);
  assert.equal(responseData.autoReplySent, true);
  assert.ok(responseData.autoReplyText.includes('ขอบคุณที่สนใจ'));

  // Verify created lead in database
  const leadRows = await fixture.pool.query(
    'select * from leads where id = $1',
    [responseData.leadId]
  );
  assert.equal(leadRows.rows.length, 1);
  assert.equal(leadRows.rows[0].full_name, 'High Intent User');
  assert.equal(leadRows.rows[0].source, 'facebook');
  assert.equal(leadRows.rows[0].source_ref, 'comment-comment-333444');

  // Check Database for Note details
  const noteRows = await fixture.pool.query(
    "select * from notes where entity_type = 'lead' and entity_id = $1",
    [responseData.leadId]
  );
  assert.ok(noteRows.rows.length >= 1);
  assert.ok(noteRows.rows[0].content.includes('FB Comment Intent'));
});
