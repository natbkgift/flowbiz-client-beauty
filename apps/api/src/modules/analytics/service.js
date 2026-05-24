const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { parseMetricFilters } = require('./validation');

function requireAnalyticsRow(result, errorCode, message) {
  if (result.rowCount === 0) {
    throw new AppError(500, errorCode, message);
  }

  return result.rows[0];
}

function asDateString(dateValue) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

async function upsertDailyMetrics(client, clinicId, metricDate) {
  const result = await client.query(
    `
      with daily as (
        select
          $1::bigint as clinic_id,
          $2::date as metric_date,
          (select count(*)::int from leads l where l.clinic_id = $1 and l.created_at::date = $2::date) as leads_created,
          (select count(*)::int from customers cu where cu.clinic_id = $1 and cu.created_at::date = $2::date) as customers_created,
          (select count(*)::int from outbound_messages om where om.clinic_id = $1 and om.created_at::date = $2::date and om.status in ('pending', 'sent', 'delivered')) as messages_sent,
          (select count(*)::int from automation_executions ae where ae.clinic_id = $1 and ae.created_at::date = $2::date) as automation_executions,
          (select count(*)::int from ai_recommendations ar where ar.clinic_id = $1 and ar.created_at::date = $2::date) as ai_recommendations_generated
      )
      insert into analytics_daily_metrics (clinic_id, metric_date, leads_created, customers_created, messages_sent, automation_executions, ai_recommendations_generated)
      select clinic_id, metric_date, leads_created, customers_created, messages_sent, automation_executions, ai_recommendations_generated
      from daily
      on conflict (clinic_id, metric_date)
      do update set
        leads_created = excluded.leads_created,
        customers_created = excluded.customers_created,
        messages_sent = excluded.messages_sent,
        automation_executions = excluded.automation_executions,
        ai_recommendations_generated = excluded.ai_recommendations_generated,
        updated_at = now()
      returning *
    `,
    [clinicId, metricDate]
  );

  return requireAnalyticsRow(result, 'ANALYTICS_DAILY_UPSERT_FAILED', 'Failed to upsert daily analytics metrics.');
}

async function rebuildFunnelMetrics(client, clinicId) {
  await client.query('delete from analytics_funnel_metrics where clinic_id = $1', [clinicId]);

  const result = await client.query(
    `
      with total as (
        select count(*)::numeric as total_leads
        from leads
        where clinic_id = $1
      ), stage_metrics as (
        select
          l.stage as stage_name,
          count(*)::int as lead_count,
          round(count(*)::numeric / nullif((select total_leads from total), 0), 4) as conversion_rate
        from leads l
        where l.clinic_id = $1
        group by l.stage

        union all

        select
          'lost' as stage_name,
          count(*)::int as lead_count,
          round(count(*)::numeric / nullif((select total_leads from total), 0), 4) as conversion_rate
        from leads l
        where l.clinic_id = $1 and l.status = 'lost'

        union all

        select
          'customer_converted' as stage_name,
          count(*)::int as lead_count,
          round(count(*)::numeric / nullif((select total_leads from total), 0), 4) as conversion_rate
        from customers cu
        where cu.clinic_id = $1 and cu.source_lead_id is not null
      )
      insert into analytics_funnel_metrics (clinic_id, stage_name, lead_count, conversion_rate, calculated_at)
      select $1, stage_name, lead_count, coalesce(conversion_rate, 0), now()
      from stage_metrics
      returning *
    `,
    [clinicId]
  );

  return result.rows;
}

async function upsertAiMetrics(client, clinicId, metricDate) {
  const result = await client.query(
    `
      with daily as (
        select
          $1::bigint as clinic_id,
          $2::date as metric_date,
          (select count(*)::int from ai_lead_scores als where als.clinic_id = $1 and als.generated_at::date = $2::date) as leads_scored,
          (select count(*)::int from ai_customer_scores acs where acs.clinic_id = $1 and acs.generated_at::date = $2::date) as customers_scored,
          (select count(*)::int from ai_recommendations ar where ar.clinic_id = $1 and ar.created_at::date = $2::date) as recommendations_generated,
          0::int as recommendations_accepted
      )
      insert into analytics_ai_metrics (clinic_id, metric_date, leads_scored, customers_scored, recommendations_generated, recommendations_accepted)
      select clinic_id, metric_date, leads_scored, customers_scored, recommendations_generated, recommendations_accepted
      from daily
      on conflict (clinic_id, metric_date)
      do update set
        leads_scored = excluded.leads_scored,
        customers_scored = excluded.customers_scored,
        recommendations_generated = excluded.recommendations_generated,
        recommendations_accepted = excluded.recommendations_accepted,
        updated_at = now()
      returning *
    `,
    [clinicId, metricDate]
  );

  return requireAnalyticsRow(result, 'ANALYTICS_AI_UPSERT_FAILED', 'Failed to upsert AI analytics metrics.');
}

async function computeMessagingMetrics(clinicId, metricDate) {
  const result = await getPool().query(
    `
      with messaging as (
        select
          count(*)::int as messages_sent,
          count(*) filter (where status = 'delivered')::int as messages_delivered,
          count(*) filter (where status = 'failed')::int as messages_failed,
          count(distinct entity_type || ':' || entity_id) filter (where status = 'delivered')::int as delivered_entities
        from outbound_messages
        where clinic_id = $1 and created_at::date = $2::date
      ), response as (
        select
          (
            (select count(*)::numeric from notes where clinic_id = $1 and created_at::date = $2::date)
            +
            (select count(*)::numeric from customer_notes where clinic_id = $1 and created_at::date = $2::date)
          ) as total_replies
      )
      select
        messaging.messages_sent,
        messaging.messages_delivered,
        messaging.messages_failed,
        round(coalesce(response.total_replies / nullif(messaging.messages_sent, 0), 0), 4) as response_rate
      from messaging, response
    `,
    [clinicId, metricDate]
  );

  const row = result.rows[0] || {
    messages_sent: 0,
    messages_delivered: 0,
    messages_failed: 0,
    response_rate: 0
  };

  return {
    messagesSent: row.messages_sent,
    messagesDelivered: row.messages_delivered,
    messagesFailed: row.messages_failed,
    responseRate: Number(row.response_rate)
  };
}

async function computeAutomationMetrics(clinicId, metricDate) {
  const result = await getPool().query(
    `
      select
        count(*)::int as executions_count,
        count(*) filter (where status = 'completed')::int as completed_count,
        count(*) filter (where status = 'failed')::int as failed_count,
        round(avg(extract(epoch from (coalesce(finished_at, now()) - started_at))) filter (where started_at is not null), 2) as average_execution_duration_seconds
      from automation_executions
      where clinic_id = $1 and created_at::date = $2::date
    `,
    [clinicId, metricDate]
  );
  const taskResult = await getPool().query(
    `select count(*)::int as tasks_created from automation_tasks where clinic_id = $1 and created_at::date = $2::date`,
    [clinicId, metricDate]
  );

  const executionRow = result.rows[0] || {
    executions_count: 0,
    completed_count: 0,
    failed_count: 0,
    average_execution_duration_seconds: 0
  };
  const taskRow = taskResult.rows[0] || { tasks_created: 0 };

  const executionsCount = executionRow.executions_count;
  const completedCount = executionRow.completed_count;
  const failedCount = executionRow.failed_count;

  return {
    executionsCount,
    completedCount,
    failedCount,
    successRate: executionsCount > 0 ? Number((completedCount / executionsCount).toFixed(4)) : 0,
    failureRate: executionsCount > 0 ? Number((failedCount / executionsCount).toFixed(4)) : 0,
    averageExecutionDurationSeconds: Number(executionRow.average_execution_duration_seconds || 0),
    tasksCreated: taskRow.tasks_created
  };
}

async function recomputeAnalytics(clinicId, metricDate) {
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const daily = await upsertDailyMetrics(client, clinicId, metricDate);
    const funnel = await rebuildFunnelMetrics(client, clinicId);
    const ai = await upsertAiMetrics(client, clinicId, metricDate);
    await client.query('commit');

    return { daily, funnel, ai };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getOverview(clinicId, searchParams) {
  const filters = parseMetricFilters(searchParams);
  const recomputed = await recomputeAnalytics(clinicId, filters.metricDate);
  const messaging = await computeMessagingMetrics(clinicId, filters.metricDate);
  const automation = await computeAutomationMetrics(clinicId, filters.metricDate);

  return {
    metricDate: filters.metricDate,
    daily: {
      leadsCreated: recomputed.daily.leads_created,
      customersCreated: recomputed.daily.customers_created,
      messagesSent: recomputed.daily.messages_sent,
      automationExecutions: recomputed.daily.automation_executions,
      aiRecommendationsGenerated: recomputed.daily.ai_recommendations_generated
    },
    messaging,
    automation,
    ai: {
      leadsScored: recomputed.ai.leads_scored,
      customersScored: recomputed.ai.customers_scored,
      recommendationsGenerated: recomputed.ai.recommendations_generated,
      recommendationsAccepted: recomputed.ai.recommendations_accepted
    }
  };
}

async function getFunnel(clinicId, searchParams) {
  const filters = parseMetricFilters(searchParams);
  await recomputeAnalytics(clinicId, filters.metricDate);
  const result = await getPool().query(
    `select * from analytics_funnel_metrics where clinic_id = $1 order by stage_name asc`,
    [clinicId]
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      clinicId: row.clinic_id,
      stageName: row.stage_name,
      leadCount: row.lead_count,
      conversionRate: Number(row.conversion_rate),
      calculatedAt: row.calculated_at
    }))
  };
}

async function getMessagingAnalytics(clinicId, searchParams) {
  const filters = parseMetricFilters(searchParams);
  const metrics = await computeMessagingMetrics(clinicId, filters.metricDate);

  return {
    metricDate: filters.metricDate,
    ...metrics
  };
}

async function getAutomationAnalytics(clinicId, searchParams) {
  const filters = parseMetricFilters(searchParams);
  const metrics = await computeAutomationMetrics(clinicId, filters.metricDate);

  return {
    metricDate: filters.metricDate,
    ...metrics
  };
}

async function getAiAnalytics(clinicId, searchParams) {
  const filters = parseMetricFilters(searchParams);
  await upsertAiMetrics(getPool(), clinicId, filters.metricDate);
  const result = await getPool().query(
    `select * from analytics_ai_metrics where clinic_id = $1 and metric_date = $2::date limit 1`,
    [clinicId, filters.metricDate]
  );
  const row = requireAnalyticsRow(result, 'ANALYTICS_AI_NOT_FOUND', 'AI analytics metrics are unavailable for the requested date.');

  return {
    metricDate: filters.metricDate,
    leadsScored: row.leads_scored,
    customersScored: row.customers_scored,
    recommendationsGenerated: row.recommendations_generated,
    recommendationsAccepted: row.recommendations_accepted
  };
}

module.exports = {
  recomputeAnalytics,
  getOverview,
  getFunnel,
  getMessagingAnalytics,
  getAutomationAnalytics,
  getAiAnalytics,
  asDateString
};