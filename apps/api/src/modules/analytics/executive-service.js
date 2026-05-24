const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

async function getExecutiveAnalyticsSummary(organizationId) {
  const pool = getPool();

  // 1. Check organization exists
  const orgCheck = await pool.query('select id, name from organizations where id = $1 limit 1', [organizationId]);
  if (orgCheck.rowCount === 0) {
    throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.');
  }

  // 2. Aggregate Leads statistics
  const leadsStats = await pool.query(
    `
      select 
        count(id)::int as total_leads,
        coalesce(count(case when stage = 'converted' or status = 'won' then 1 end)::int, 0) as converted_leads
      from leads
      where organization_id = $1
    `,
    [organizationId]
  );

  const totalLeads = leadsStats.rows[0].total_leads;
  const convertedLeads = leadsStats.rows[0].converted_leads;
  const averageConversionRate = totalLeads > 0 
    ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) 
    : 0.0;

  // 3. Aggregate Campaign delivery metrics
  const campaignStats = await pool.query(
    `
      select 
        coalesce(sum((stats_json->>'targetCount')::int)::int, 0) as total_target,
        coalesce(sum((stats_json->>'deliveredCount')::int)::int, 0) as total_delivered,
        coalesce(sum((stats_json->>'failedCount')::int)::int, 0) as total_failed
      from campaigns
      where workspace_id in (
        select id from workspaces where organization_id = $1
      )
    `,
    [organizationId]
  );

  // 4. Rank Clinics under the same organization
  const clinicRanking = await pool.query(
    `
      select 
        c.id,
        c.name,
        count(l.id)::int as lead_count,
        coalesce(count(case when l.stage = 'converted' or l.status = 'won' then 1 end)::int, 0) as won_count
      from clinics c
      left join leads l on l.clinic_id = c.id
      where c.id in (
        select clinic_id from workspaces where organization_id = $1
      )
      group by c.id, c.name
      order by won_count desc, lead_count desc
      limit 3
    `,
    [organizationId]
  );

  const topClinics = clinicRanking.rows.map((row) => {
    const convRate = row.lead_count > 0 
      ? Number(((row.won_count / row.lead_count) * 100).toFixed(2)) 
      : 0.0;
    return {
      id: Number(row.id),
      name: row.name,
      leadCount: row.lead_count,
      wonCount: row.won_count,
      conversionRate: convRate
    };
  });

  // 5. Weekly Lead Influx Trends (Phase 4 Extension)
  const trendsResult = await pool.query(
    `
      select 
        date_trunc('week', created_at)::date as week_start,
        count(id)::int as lead_count
      from leads
      where organization_id = $1
      group by week_start
      order by week_start asc
      limit 8
    `,
    [organizationId]
  );

  const weeklyLeadsTrends = trendsResult.rows.map((row) => ({
    weekStart: row.week_start,
    leadCount: row.lead_count
  }));

  // 6. Channel ROI Breakdown (LINE vs Facebook - Phase 4 Extension)
  const channelStatsResult = await pool.query(
    `
      select 
        channel_type,
        count(id)::int as campaign_count,
        coalesce(sum((stats_json->>'deliveredCount')::int)::int, 0) as total_delivered,
        coalesce(sum((stats_json->>'failedCount')::int)::int, 0) as total_failed
      from campaigns
      where workspace_id in (
        select id from workspaces where organization_id = $1
      )
      group by channel_type
    `,
    [organizationId]
  );

  const channelBreakdown = {
    line: { campaignCount: 0, deliveredCount: 0, failedCount: 0 },
    facebook: { campaignCount: 0, deliveredCount: 0, failedCount: 0 }
  };

  channelStatsResult.rows.forEach((row) => {
    const ch = row.channel_type === 'facebook' ? 'facebook' : 'line';
    channelBreakdown[ch] = {
      campaignCount: row.campaign_count,
      deliveredCount: row.total_delivered,
      failedCount: row.total_failed
    };
  });

  return {
    organizationId: Number(organizationId),
    organizationName: orgCheck.rows[0].name,
    summary: {
      totalLeads,
      convertedLeads,
      averageConversionRate,
      campaignOutbounds: {
        targetCount: campaignStats.rows[0].total_target,
        deliveredCount: campaignStats.rows[0].total_delivered,
        failedCount: campaignStats.rows[0].total_failed
      }
    },
    topPerformingClinics: topClinics,
    weeklyLeadsTrends,
    channelBreakdown
  };
}

module.exports = {
  getExecutiveAnalyticsSummary
};
