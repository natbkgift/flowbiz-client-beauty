'use strict';

const { AppError } = require('../../common/errors');
const sandboxEmail = require('./email-adapters/sandbox-email');

const EMAIL_ADAPTERS = {
  sandbox: sandboxEmail
};

function resolveEmailAdapter(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const adapter = EMAIL_ADAPTERS[normalizedProvider];

  if (!adapter) {
    throw new AppError(403, 'NOTIFICATION_EMAIL_PROVIDER_NOT_READY', 'Email provider is not ready for real delivery.');
  }

  return {
    provider: normalizedProvider,
    adapter
  };
}

module.exports = {
  resolveEmailAdapter
};
