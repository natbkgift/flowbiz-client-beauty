const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { computeNextRunAt, shouldRetry } = require('./retry');
const { executeJob } = require('./worker');

let workerLoopTimer = null;
let workerLoopInFlight = false;

function mapWorkerJob(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    jobType: row.job_type,
    payloadJson: row.payload_json,
    status: row.status,
    runAt: row.run_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function enqueueJob(input, client = getPool()) {
  const result = await client.query(
    `
      insert into worker_jobs (clinic_id, job_type, payload_json, status, run_at, attempts, max_attempts)
      values ($1, $2, $3::jsonb, 'pending', $4, 0, $5)
      returning *
    `,
    [
      input.clinicId,
      input.jobType,
      JSON.stringify(input.payloadJson || {}),
      input.runAt || new Date().toISOString(),
      input.maxAttempts || 3
    ]
  );

  return mapWorkerJob(result.rows[0]);
}

async function claimDueJobs(limit = 10, options = {}) {
  const values = [limit];
  const filters = [
    "status = 'pending'",
    'run_at <= now()'
  ];

  function addFilterValue(value) {
    values.push(value);
    return `$${values.length}`;
  }

  if (options.clinicId) {
    filters.push(`clinic_id = ${addFilterValue(Number(options.clinicId))}`);
  }

  if (options.jobType) {
    filters.push(`job_type = ${addFilterValue(String(options.jobType))}`);
  }

  if (options.payloadJsonContains && typeof options.payloadJsonContains === 'object') {
    filters.push(`payload_json @> ${addFilterValue(JSON.stringify(options.payloadJsonContains))}::jsonb`);
  }

  if (Array.isArray(options.jobIds) && options.jobIds.length > 0) {
    filters.push(`id = any(${addFilterValue(options.jobIds.map(Number))}::bigint[])`);
  }

  if (options.createdAfter) {
    filters.push(`created_at >= ${addFilterValue(new Date(options.createdAfter).toISOString())}::timestamptz`);
  }

  const result = await getPool().query(
    `
      update worker_jobs
      set status = 'running',
          updated_at = now()
      where id in (
        select id
        from worker_jobs
        where ${filters.join(' and ')}
        order by case when job_type = 'event.dispatch.retry' then 0 else 1 end asc, run_at asc, id asc
        limit $1
        for update skip locked
      )
      returning *
    `,
    values
  );

  return result.rows.map(mapWorkerJob);
}

async function completeJob(jobId) {
  await getPool().query(
    `update worker_jobs set status = 'completed', updated_at = now() where id = $1`,
    [jobId]
  );
}

async function failOrRetryJob(job, error) {
  const nextAttempts = job.attempts + 1;

  if (shouldRetry({ attempts: nextAttempts, max_attempts: job.maxAttempts })) {
    if (job.jobType === 'automation.execute' && job.payloadJson?.executionId) {
      await getPool().query(
        `
          update automation_executions
          set status = 'retrying',
              retry_count = $2,
              error_message = $3,
              updated_at = now()
          where id = $1
        `,
        [job.payloadJson.executionId, nextAttempts, error.message]
      );
    }

    await getPool().query(
      `
        update worker_jobs
        set status = 'pending',
            attempts = $2,
            run_at = $3,
            last_error = $4,
            updated_at = now()
        where id = $1
      `,
      [job.id, nextAttempts, computeNextRunAt(nextAttempts, 1), error.message]
    );
    return 'retried';
  }

  if (job.jobType === 'automation.execute' && job.payloadJson?.executionId) {
    await getPool().query(
      `
        update automation_executions
        set status = 'failed',
            retry_count = $2,
            error_message = $3,
            completed_at = now(),
            updated_at = now()
        where id = $1
      `,
      [job.payloadJson.executionId, nextAttempts, error.message]
    );
  }

  // Archiving to DLQ (Dead Letter Queue) and clearing from active queue
  await getPool().query(
    `
      insert into dead_letter_jobs (job_id, clinic_id, job_type, payload_json, last_error)
      values ($1, $2, $3, $4::jsonb, $5)
    `,
    [job.id, job.clinicId, job.jobType, JSON.stringify(job.payloadJson || {}), error.message]
  );

  await getPool().query(
    `delete from worker_jobs where id = $1`,
    [job.id]
  );
  
  return 'failed';
}

async function runDueJobs(limit = 10, options = {}) {
  const jobs = await claimDueJobs(limit, options);
  const results = [];

  for (const job of jobs) {
    try {
      const output = await executeJob({
        id: job.id,
        clinic_id: job.clinicId,
        job_type: job.jobType,
        payload_json: job.payloadJson,
        attempts: job.attempts,
        max_attempts: job.maxAttempts
      });
      await completeJob(job.id);
      results.push({ jobId: job.id, status: 'completed', output });
    } catch (error) {
      const status = await failOrRetryJob(job, error);
      results.push({ jobId: job.id, status, error: error.message });
    }
  }

  return {
    claimedJobs: jobs.length,
    results
  };
}

async function tickWorkerLoop(limit, options = {}) {
  if (workerLoopInFlight) {
    return {
      claimedJobs: 0,
      results: [],
      skipped: true
    };
  }

  workerLoopInFlight = true;

  try {
    return await runDueJobs(limit, options);
  } finally {
    workerLoopInFlight = false;
  }
}

function startWorkerLoop(options = {}) {
  if (workerLoopTimer) {
    return {
      started: false,
      intervalMs: options.intervalMs || loadConfig().workerLoopIntervalMs,
      batchSize: options.batchSize || loadConfig().workerLoopBatchSize
    };
  }

  const config = loadConfig();
  const intervalMs = options.intervalMs || config.workerLoopIntervalMs;
  const batchSize = options.batchSize || config.workerLoopBatchSize;
  const runOnStart = options.runOnStart !== false;
  const runOptions = {};
  for (const key of ['clinicId', 'jobType', 'payloadJsonContains', 'jobIds', 'createdAfter']) {
    if (options[key] !== undefined) {
      runOptions[key] = options[key];
    }
  }

  const runTick = () => {
    void tickWorkerLoop(batchSize, runOptions).catch((error) => {
      console.error('Worker loop tick failed:', error.message);
    });
  };

  workerLoopTimer = setInterval(runTick, intervalMs);

  if (typeof workerLoopTimer.unref === 'function') {
    workerLoopTimer.unref();
  }

  if (runOnStart) {
    runTick();
  }

  return {
    started: true,
    intervalMs,
    batchSize
  };
}

function stopWorkerLoop() {
  if (!workerLoopTimer) {
    return false;
  }

  clearInterval(workerLoopTimer);
  workerLoopTimer = null;
  return true;
}

module.exports = {
  enqueueJob,
  claimDueJobs,
  runDueJobs,
  mapWorkerJob,
  startWorkerLoop,
  stopWorkerLoop,
  tickWorkerLoop
};
