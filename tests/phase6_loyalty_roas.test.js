const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { signup, authenticateRequest } = require('../apps/api/src/modules/auth/service');
const {
  generateReferralCode,
  trackReferral,
  recordPurchaseAndAwardPoints,
  getLoyaltyBalance,
  getReferralsList
} = require('../apps/api/src/modules/loyalty-mgm/service');
const {
  syncMockAdSpend,
  getRoasReport
} = require('../apps/api/src/modules/loyalty-mgm/ad-spend-service');
const { handleLoyaltyRoutes } = require('../apps/api/src/modules/loyalty-mgm/routes');

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
    clinicName: `Loyalty Clinic ${uniqueId}`,
    ownerName: 'Loyalty Owner',
    email: `loyalty-owner-${uniqueId}@example.com`,
    password: 'StrongPass123!'
  });
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });

  t.after(async () => {
    try {
      await pool.query('delete from clinics where id = $1', [session.currentClinic.id]);
      await pool.query('delete from users where id = $1', [session.user.id]);
    } catch (err) {
      // ignore constraint or cleanup errors
    } finally {
      await pool.end();
    }
  });

  const ownerContext = await authenticateRequest(buildAuthRequest(session.token));

  return {
    pool,
    session,
    ownerContext
  };
}

test('Loyalty points earning, Referrals (MGM) rewards logic and APIs', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  // 1. Create referrer and referee leads
  const referrerRes = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'manual', 'Referrer Friend', 'new', 'inquiry') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );
  const referrerId = Number(referrerRes.rows[0].id);

  const refereeRes = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'facebook', 'Referee Newcomer', 'new', 'inquiry') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );
  const refereeId = Number(refereeRes.rows[0].id);

  // 2. Generate referral code
  const code = generateReferralCode(clinicId, referrerId);
  assert.equal(code, `FB-${referrerId}-GOLD`);

  // 3. Track referral (MGM Linkage)
  const refRecord = await trackReferral(clinicId, code, refereeId);
  assert.ok(refRecord);
  assert.equal(refRecord.status, 'pending');
  assert.equal(refRecord.referral_code, code);

  // Test self-referral blocks
  await assert.rejects(
    async () => {
      await trackReferral(clinicId, code, referrerId);
    },
    {
      code: 'SELF_REFERRAL_FORBIDDEN'
    }
  );

  // 4. Initial balance checks
  const initReferrerBal = await getLoyaltyBalance(clinicId, referrerId);
  const initRefereeBal = await getLoyaltyBalance(clinicId, refereeId);
  assert.equal(initReferrerBal, 0);
  assert.equal(initRefereeBal, 0);

  // 5. Record first purchase of referee (High value hัตถการ)
  // Purchase amount: 15,000 THB (should earn 150 points for purchase)
  // Since referred by code, referrer gets 100 bonus, referee gets 50 bonus
  const purchaseResult = await recordPurchaseAndAwardPoints(clinicId, refereeId, 15000, 'โบท็อกซ์ริ้วรอย + ฟิลเลอร์ใต้ตา');
  assert.ok(purchaseResult.success);
  assert.equal(purchaseResult.pointsEarned, 150);
  assert.equal(purchaseResult.referralProcessed, true);
  assert.equal(purchaseResult.referrerBonus, 100);
  assert.equal(purchaseResult.refereeBonus, 50);

  // 6. Verify balances after purchase & conversion
  const finalReferrerBal = await getLoyaltyBalance(clinicId, referrerId);
  const finalRefereeBal = await getLoyaltyBalance(clinicId, refereeId);
  // Referrer got 100 bonus
  assert.equal(finalReferrerBal, 100);
  // Referee got 150 (earn) + 50 (bonus) = 200
  assert.equal(finalRefereeBal, 200);

  // Verify referral list
  const referralsList = await getReferralsList(clinicId, referrerId);
  assert.equal(referralsList.length, 1);
  assert.equal(referralsList[0].referred_lead_id, refereeId);
  assert.equal(referralsList[0].status, 'converted');
  assert.equal(referralsList[0].reward_issued, true);
});

test('Ad spend Daily Syncing and ROAS BI Report calculations', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  // 1. Sync mock ad spend
  const syncRes = await syncMockAdSpend(clinicId);
  assert.ok(syncRes.success);

  // Check database populated records
  const spendRows = await fixture.pool.query(
    'select count(*) as count from ad_spend_daily where clinic_id = $1',
    [clinicId]
  );
  // 7 days * (4 FB campaigns + 2 Google campaigns) = 42 rows
  assert.equal(Number(spendRows.rows[0].count), 42);

  // 2. Generate leads with matching sources to compute conversion metrics
  // Create 2 Facebook leads (1 converted, 1 inquiry)
  const fbLead1 = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'facebook', 'FB Conv', 'converted', 'converted') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );
  const fbLead2 = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'facebook', 'FB Inq', 'new', 'inquiry') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );

  // Create 1 Google lead (converted)
  const ggLead = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'google', 'GG Conv', 'converted', 'converted') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );

  // Add revenue via points ledger (points * 100 = revenue amount)
  // FB Conv spent 10,000 THB (100 points)
  await fixture.pool.query(
    `insert into loyalty_points_ledger (clinic_id, lead_id, points, transaction_type, description)
     values ($1, $2, 100, 'earn', 'Facial treatment')`,
    [clinicId, Number(fbLead1.rows[0].id)]
  );

  // GG Conv spent 30,000 THB (300 points)
  await fixture.pool.query(
    `insert into loyalty_points_ledger (clinic_id, lead_id, points, transaction_type, description)
     values ($1, $2, 300, 'earn', 'Ulthera lift')`,
    [clinicId, Number(ggLead.rows[0].id)]
  );

  // 3. Compute ROAS Report
  const report = await getRoasReport(clinicId);

  // Assert report values structure
  assert.ok(report.facebook);
  assert.ok(report.google);
  assert.ok(report.total);

  assert.equal(report.facebook.totalLeads, 2);
  assert.equal(report.facebook.totalConverted, 1);
  assert.equal(report.facebook.totalRevenue, 10000);

  assert.equal(report.google.totalLeads, 1);
  assert.equal(report.google.totalConverted, 1);
  assert.equal(report.google.totalRevenue, 30000);

  assert.equal(report.total.totalLeads, 3);
  assert.equal(report.total.totalConverted, 2);
  assert.equal(report.total.totalRevenue, 40000);

  assert.ok(report.facebook.totalSpend > 0);
  assert.ok(report.facebook.costPerLead > 0);
  assert.ok(report.facebook.customerAcquisitionCost > 0);
  assert.ok(report.facebook.roas >= 0);
});

test('Loyalty & Ad Spend API Integration routes', async (t) => {
  const fixture = await createFixture(t);
  const clinicId = fixture.session.currentClinic.id;

  const leadRes = await fixture.pool.query(
    `insert into leads (clinic_id, organization_id, workspace_id, source, full_name, status, stage)
     values ($1, $2, $3, 'line', 'API Client', 'new', 'inquiry') returning id`,
    [clinicId, fixture.session.currentOrganization.id, fixture.session.currentWorkspace.id]
  );
  const leadId = Number(leadRes.rows[0].id);

  // Mock Request tools
  const tools = {
    authenticateRequest: async () => fixture.ownerContext,
    parseJsonBody: async (req) => req.body,
    json: (_response, status, data) => {
      responseStatus = status;
      responseData = data;
    }
  };

  let responseStatus = 200;
  let responseData = null;

  // 1. POST /loyalty/record-purchase
  const reqPurchase = {
    method: 'POST',
    body: { leadId, amount: 5000, description: 'Meso Aura treatment' }
  };
  await handleLoyaltyRoutes(reqPurchase, {}, new URL('http://localhost/loyalty/record-purchase'), tools);

  assert.equal(responseStatus, 201);
  assert.ok(responseData.success);
  assert.equal(responseData.pointsEarned, 50);

  // 2. GET /loyalty/balance?leadId=...
  const reqBalance = { method: 'GET' };
  const urlBalance = new URL(`http://localhost/loyalty/balance?leadId=${leadId}`);
  await handleLoyaltyRoutes(reqBalance, {}, urlBalance, tools);

  assert.equal(responseStatus, 200);
  assert.ok(responseData.success);
  assert.equal(responseData.balance, 50);

  // 3. POST /loyalty/ad-spend/sync
  const reqSync = { method: 'POST', body: {} };
  await handleLoyaltyRoutes(reqSync, {}, new URL('http://localhost/loyalty/ad-spend/sync'), tools);

  assert.equal(responseStatus, 200);
  assert.ok(responseData.success);

  // 4. GET /loyalty/roas-report
  const reqRoas = { method: 'GET' };
  await handleLoyaltyRoutes(reqRoas, {}, new URL('http://localhost/loyalty/roas-report'), tools);

  assert.equal(responseStatus, 200);
  assert.ok(responseData.facebook);
  assert.ok(responseData.google);
  assert.ok(responseData.total);
});

const { closePool } = require('../apps/api/src/db');
test.after(async () => {
  await closePool();
});

