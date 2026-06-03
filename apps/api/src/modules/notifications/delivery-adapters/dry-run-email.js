'use strict';

async function dryRunDeliver(payload) {
  return {
    dryRun: true,
    externalCallMade: false,
    blockedRealSend: true,
    provider: 'dry_run_email',
    message: 'Dry run only. No notification was sent.',
    payload
  };
}

module.exports = {
  dryRunDeliver
};
