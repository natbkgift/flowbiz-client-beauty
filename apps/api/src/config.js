const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '..', '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

function toPort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function loadConfig() {
  const appEnv = process.env.APP_ENV || 'development';
  const localTokenSecret = 'flowbiz_local_token_secret_change_me';
  const authTokenSecret = process.env.AUTH_TOKEN_SECRET || localTokenSecret;
  const inviteTokenSecret = process.env.INVITE_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET || localTokenSecret;
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://flowbiz:flowbiz_local_dev_only@localhost:5432/flowbiz_local';

  if (appEnv === 'production') {
    if (authTokenSecret === localTokenSecret || inviteTokenSecret === localTokenSecret) {
      throw new Error('Production AUTH_TOKEN_SECRET and INVITE_TOKEN_SECRET must be configured.');
    }

    if (!process.env.DATABASE_URL || databaseUrl.includes('flowbiz_local_dev_only') || databaseUrl.includes('flowbiz_local')) {
      throw new Error('Production DATABASE_URL must be configured with a non-local database.');
    }
  }

  return {
    appEnv,
    apiPort: toPort(process.env.API_PORT, 3001),
    webPort: toPort(process.env.WEB_PORT, 4173),
    authTokenSecret,
    authTokenTtlHours: toPositiveInt(process.env.AUTH_TOKEN_TTL_HOURS, 12),
    inviteTokenSecret,
    inviteTokenTtlHours: toPositiveInt(process.env.INVITE_TOKEN_TTL_HOURS, 72),
    workerLoopEnabled: toBoolean(process.env.WORKER_LOOP_ENABLED, true),
    workerLoopIntervalMs: toPositiveInt(process.env.WORKER_LOOP_INTERVAL_MS, 5000),
    workerLoopBatchSize: toPositiveInt(process.env.WORKER_LOOP_BATCH_SIZE, 20),
    eventRetryMaxAttempts: toPositiveInt(process.env.EVENT_RETRY_MAX_ATTEMPTS, 3),
    databaseUrl
  };
}

module.exports = {
  loadConfig
};
