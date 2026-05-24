const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { mapWorkerJob } = require('../worker-engine/scheduler');

function mapRecentFailure(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    jobType: row.job_type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    runAt: row.run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getSystemHealth(clinicId) {
  const [workerSummaryResult, executionSummaryResult, eventSummaryResult, failuresResult] = await Promise.all([
    getPool().query(
      `
        select
          count(*) filter (where status = 'pending')::int as pending_jobs,
          count(*) filter (where status = 'pending' and run_at <= now())::int as queue_depth,
          count(*) filter (where status = 'running')::int as running_jobs,
          count(*) filter (where status = 'failed')::int as failed_jobs,
          count(*) filter (where status = 'completed' and updated_at >= now() - interval '24 hours')::int as completed_last_24h
        from worker_jobs
        where clinic_id = $1
      `,
      [clinicId]
    ),
    getPool().query(
      `
        select
          count(*)::int as executions_last_24h,
          count(*) filter (where status = 'completed')::int as completed_last_24h,
          count(*) filter (where status = 'failed')::int as failed_last_24h
        from automation_executions
        where clinic_id = $1
          and created_at >= now() - interval '24 hours'
      `,
      [clinicId]
    ),
    getPool().query(
      `
        select
          count(*)::int as events_last_24h,
          count(*) filter (where created_at >= now() - interval '1 hour')::int as events_last_hour
        from event_store
        where clinic_id = $1
          and created_at >= now() - interval '24 hours'
      `,
      [clinicId]
    ),
    getPool().query(
      `
        select *
        from worker_jobs
        where clinic_id = $1 and status = 'failed'
        order by updated_at desc, id desc
        limit 10
      `,
      [clinicId]
    )
  ]);

  const workerSummary = workerSummaryResult.rows[0] || {
    pending_jobs: 0,
    queue_depth: 0,
    running_jobs: 0,
    failed_jobs: 0,
    completed_last_24h: 0
  };
  const executionSummary = executionSummaryResult.rows[0] || {
    executions_last_24h: 0,
    completed_last_24h: 0,
    failed_last_24h: 0
  };
  const eventSummary = eventSummaryResult.rows[0] || {
    events_last_24h: 0,
    events_last_hour: 0
  };
  const executionsLast24h = executionSummary.executions_last_24h;
  const failedLast24h = executionSummary.failed_last_24h;

  return {
    timestamp: new Date().toISOString(),
    systemStatus: workerSummary.failed_jobs > 0 || failedLast24h > 0 ? 'degraded' : 'healthy',
    worker: {
      queueDepth: workerSummary.queue_depth,
      pendingJobs: workerSummary.pending_jobs,
      runningJobs: workerSummary.running_jobs,
      failedJobs: workerSummary.failed_jobs,
      completedLast24h: workerSummary.completed_last_24h
    },
    automation: {
      executionsLast24h,
      completedLast24h: executionSummary.completed_last_24h,
      failedLast24h,
      executionRatePerHour: Number((executionsLast24h / 24).toFixed(2)),
      successRate: executionsLast24h > 0 ? Number(((executionSummary.completed_last_24h / executionsLast24h) * 100).toFixed(2)) : 0
    },
    eventBus: {
      eventsLast24h: eventSummary.events_last_24h,
      eventsLastHour: eventSummary.events_last_hour,
      throughputPerHour: Number((eventSummary.events_last_24h / 24).toFixed(2))
    },
    recentFailures: failuresResult.rows.map(mapRecentFailure)
  };
}

async function retryFailedJob(context, jobId) {
  const result = await getPool().query(
    `
      update worker_jobs
      set status = 'pending',
          attempts = 0,
          run_at = now() - interval '1 second',
          last_error = null,
          updated_at = now()
      where id = $1 and clinic_id = $2 and status = 'failed'
      returning *
    `,
    [jobId, context.currentClinic.id]
  );

  if (result.rowCount === 0) {
    const existing = await getPool().query(
      'select id, status from worker_jobs where id = $1 and clinic_id = $2 limit 1',
      [jobId, context.currentClinic.id]
    );

    if (existing.rowCount === 0) {
      throw new AppError(404, 'WORKER_JOB_NOT_FOUND', 'Worker job not found.');
    }

    throw new AppError(400, 'WORKER_JOB_NOT_RETRYABLE', 'Only failed worker jobs can be retried.');
  }

  await recordAuditLog({
    clinicId: context.currentClinic.id,
    entityType: 'worker_job',
    entityId: jobId,
    actionType: 'ops.worker_job_retried',
    actorUserId: context.currentUser.id,
    contextJson: {
      actorUserId: context.currentUser.id,
      retriedAt: new Date().toISOString()
    }
  });

  return mapWorkerJob(result.rows[0]);
}

module.exports = {
  getSystemHealth,
  retryFailedJob
};