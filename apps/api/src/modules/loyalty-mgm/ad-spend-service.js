const { getPool } = require('../../db');

/**
 * Syncs mock ad spend data for Facebook and Google over the last 7 days.
 */
async function syncMockAdSpend(clinicId) {
  const pool = getPool();
  const channels = ['facebook', 'google'];
  const campaigns = {
    facebook: ['Botox Glow Campaign', 'Meso Aura Campaign', 'Hifu Lift Campaign', 'Acne Clear Campaign'],
    google: ['Botox Search Ads', 'Hifu Search Ads']
  };

  const client = await pool.connect();
  try {
    await client.query('begin');

    // Generate spend data for the last 7 days
    for (let i = 0; i < 7; i++) {
      const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      for (const channel of channels) {
        for (const campaign of campaigns[channel]) {
          // Generate realistic daily random metrics
          const spend = Math.floor(500 + Math.random() * 1000); // 500 - 1500 THB
          const clicks = Math.floor(50 + Math.random() * 100);   // 50 - 150 clicks
          const impressions = clicks * Math.floor(80 + Math.random() * 40); // CTR of ~1%

          await client.query(
            `insert into ad_spend_daily (clinic_id, date, channel, campaign_name, spend_amount, impressions, clicks)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (clinic_id, date, channel, campaign_name) 
             do update set spend_amount = excluded.spend_amount, 
                           impressions = excluded.impressions, 
                           clicks = excluded.clicks`,
            [clinicId, dateStr, channel, campaign, spend, impressions, clicks]
          );
        }
      }
    }

    await client.query('commit');
    return { success: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Computes BI report: CAC, CPL, and ROAS across Facebook and Google channels.
 */
async function getRoasReport(clinicId) {
  const pool = getPool();

  // 1. Get spend metrics by channel
  const spendResult = await pool.query(
    `select channel, 
            sum(spend_amount) as total_spend,
            sum(impressions) as total_impressions,
            sum(clicks) as total_clicks
     from ad_spend_daily
     where clinic_id = $1
     group by channel`,
    [clinicId]
  );

  // 2. Get lead counts & conversion revenue by channel
  const leadResult = await pool.query(
    `select l.source as channel,
            count(l.id) as total_leads,
            count(case when l.stage = 'converted' then 1 end) as total_converted,
            coalesce(sum(case when ledger.transaction_type = 'earn' then ledger.points * 100 else 0 end), 0) as total_revenue
     from leads l
     left join loyalty_points_ledger ledger on ledger.lead_id = l.id
     where l.clinic_id = $1 and l.source in ('facebook', 'google')
     group by l.source`,
    [clinicId]
  );

  // Map results
  const report = {};
  const channels = ['facebook', 'google'];

  for (const ch of channels) {
    const spendInfo = spendResult.rows.find(r => r.channel === ch) || { total_spend: 0, total_impressions: 0, total_clicks: 0 };
    const leadInfo = leadResult.rows.find(r => r.channel === ch) || { total_leads: 0, total_converted: 0, total_revenue: 0 };

    const totalSpend = Number(spendInfo.total_spend);
    const totalLeads = Number(leadInfo.total_leads);
    const totalConverted = Number(leadInfo.total_converted);
    const totalRevenue = Number(leadInfo.total_revenue);

    const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;
    const cac = totalConverted > 0 ? (totalSpend / totalConverted) : 0;
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;

    report[ch] = {
      channel: ch,
      totalSpend,
      totalImpressions: Number(spendInfo.total_impressions),
      totalClicks: Number(spendInfo.total_clicks),
      totalLeads,
      totalConverted,
      totalRevenue,
      costPerLead: Number(cpl.toFixed(2)),
      customerAcquisitionCost: Number(cac.toFixed(2)),
      roas: Number(roas.toFixed(2))
    };
  }

  // Calculate totals
  const totalSpendAll = report.facebook.totalSpend + report.google.totalSpend;
  const totalRevenueAll = report.facebook.totalRevenue + report.google.totalRevenue;
  const totalLeadsAll = report.facebook.totalLeads + report.google.totalLeads;
  const totalConvertedAll = report.facebook.totalConverted + report.google.totalConverted;

  report.total = {
    totalSpend: totalSpendAll,
    totalRevenue: totalRevenueAll,
    totalLeads: totalLeadsAll,
    totalConverted: totalConvertedAll,
    costPerLead: totalLeadsAll > 0 ? Number((totalSpendAll / totalLeadsAll).toFixed(2)) : 0,
    customerAcquisitionCost: totalConvertedAll > 0 ? Number((totalSpendAll / totalConvertedAll).toFixed(2)) : 0,
    roas: totalSpendAll > 0 ? Number((totalRevenueAll / totalSpendAll).toFixed(2)) : 0
  };

  return report;
}

module.exports = {
  syncMockAdSpend,
  getRoasReport
};
