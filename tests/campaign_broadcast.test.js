const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createCampaign, getCampaign, previewCampaignTargetCount, enqueueCampaignBroadcast } = require('../apps/api/src/modules/campaigns/service');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { runDueJobs } = require('../apps/api/src/modules/worker-engine/scheduler');

async function buildContext(pool) {
  const clinicResult = await pool.query(`select id, name, slug, plan, status, timezone from clinics where slug = 'demo-clinic' limit 1`);
  const clinicId = clinicResult.rows[0].id;

  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1 and cu.status = 'active' and u.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [clinicId]
  );

  return {
    currentClinic: {
      id: clinicId,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone
    },
    currentUser: {
      id: membershipResult.rows[0].id,
      email: membershipResult.rows[0].email,
      name: membershipResult.rows[0].name,
      role: membershipResult.rows[0].role
    }
  };
}

test('campaign broadcast system - creation, segmentation, enqueuing, worker processing', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);

  // 1. Ensure a channel is present for the clinic
  await pool.query(
    `insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
     values ($1, 'line', 'LINE Channel', 'active', true, '{}')
     on conflict do nothing`,
    [context.currentClinic.id]
  );
  const channelRes = await pool.query(`select id from channels where clinic_id = $1 limit 1`, [context.currentClinic.id]);
  const channelId = Number(channelRes.rows[0].id);

  // 2. Create clean mock target leads
  const timeSuffix = Date.now();
  const segmentTagName = `campaign-smoke-${timeSuffix}`;
  const lead1 = await createLead(context, {
    fullName: `Campaign Target A ${timeSuffix}`,
    source: 'manual',
    status: 'active',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `081${String(timeSuffix).slice(-7)}`,
    email: `campa-a-${timeSuffix}@example.com`,
    lineUserId: `mock-line-a-${timeSuffix}`,
    tagNames: [segmentTagName],
    intentScore: 85
  });

  // Extract the resolved workspace/organization from the created lead
  const workspaceId = Number(lead1.workspaceId);
  const organizationId = Number(lead1.organizationId);

  // Update context so that subsequent services match this exact workspace
  context.currentWorkspace = { id: workspaceId };
  context.currentOrganization = { id: organizationId };

  // Explicitly override intent score in database to bypass automatic AI override
  await pool.query('update leads set intent_score = 95 where id = $1', [lead1.id]);

  const lead2 = await createLead(context, {
    fullName: `Campaign Target B ${timeSuffix}`,
    source: 'manual',
    status: 'active',
    stage: 'inquiry',
    ownerUserId: context.currentUser.id,
    phone: `082${String(timeSuffix).slice(-7)}`,
    email: `campa-b-${timeSuffix}@example.com`,
    lineUserId: `mock-line-b-${timeSuffix}`,
    intentScore: 40
  });

  await pool.query('update leads set intent_score = 40 where id = $1', [lead2.id]);

  // 3. Preview target count filtering by intentScoreMin: 80
  const preview = await previewCampaignTargetCount(context, {
    intentScoreMin: 80,
    stage: 'inquiry',
    status: 'active'
  });
  
  assert.ok(preview.targetCount >= 1, 'Should find at least lead1 matching the filters');

  // 4. Create campaign draft
  const campaign = await createCampaign(context, {
    name: `Promo Campaign ${timeSuffix}`,
    channelType: 'line',
    channelId,
    segmentQueryJson: {
      intentScoreMin: 80,
      stage: 'inquiry',
      status: 'active',
      tagNames: [segmentTagName]
    }
  });

  assert.equal(campaign.status, 'draft');
  assert.equal(campaign.name, `Promo Campaign ${timeSuffix}`);

  // 5. Enqueue the campaign broadcast
  const enqueuedCampaign = await enqueueCampaignBroadcast(context, campaign.id);
  assert.equal(enqueuedCampaign.status, 'sending');
  assert.ok(enqueuedCampaign.statsJson.targetCount >= 1);

  // 6. Verify deliveries were created
  const deliveries = await pool.query(
    `select * from campaign_deliveries where campaign_id = $1`,
    [campaign.id]
  );
  assert.ok(deliveries.rowCount >= 1);
  assert.equal(deliveries.rows[0].status, 'pending');

  // 7. Verify worker jobs were enqueued
  const workerJobs = await pool.query(
    `select * from worker_jobs where clinic_id = $1 and job_type = 'campaign.dispatch' and status = 'pending' and payload_json->>'campaignId' = $2`,
    [context.currentClinic.id, String(campaign.id)]
  );
  assert.ok(workerJobs.rowCount >= 1);

  // 8. Run worker to process the jobs
  await pool.query(
    "update worker_jobs set run_at = now() - interval '10 seconds' where clinic_id = $1 and job_type = 'campaign.dispatch' and payload_json->>'campaignId' = $2",
    [context.currentClinic.id, String(campaign.id)]
  );
  const runResult = await runDueJobs(Math.max(10, enqueuedCampaign.statsJson.targetCount + 2), {
    clinicId: context.currentClinic.id,
    jobType: 'campaign.dispatch',
    payloadJsonContains: { campaignId: campaign.id }
  });
  assert.ok(runResult.claimedJobs >= 1);

  // 9. Reload campaign and verify stats and status
  const finishedCampaign = await getCampaign(context, campaign.id);

  assert.equal(finishedCampaign.status, 'completed');
  assert.ok(finishedCampaign.statsJson.sentCount >= 1);
  assert.equal(finishedCampaign.statsJson.deliveredCount, 0);

  await pool.end();
});
