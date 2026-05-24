function computeNextRunAt(attempts, baseDelayMinutes = 1) {
  const multiplier = Math.max(attempts, 1);
  return new Date(Date.now() + baseDelayMinutes * multiplier * 60 * 1000).toISOString();
}

function shouldRetry(job) {
  return job.attempts < (job.maxAttempts ?? job.max_attempts);
}

module.exports = {
  computeNextRunAt,
  shouldRetry
};