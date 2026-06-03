'use strict';

const { AppError } = require('../../common/errors');
const { getNotificationChannelConfig, normalizeNotificationProviderConfig } = require('./provider-config');
const { hasRequiredProviderConfig } = require('./provider-readiness');

function assertNotificationDryRunAllowed(config = {}) {
  const normalized = normalizeNotificationProviderConfig(config);
  if (!normalized.dryRunEnabled) {
    throw new AppError(403, 'NOTIFICATION_DRY_RUN_DISABLED', 'Notification dry-run delivery is disabled.');
  }
}

function assertNotificationRealDeliveryAllowed(channel, config = {}) {
  const normalized = normalizeNotificationProviderConfig(config);
  const channelConfig = getNotificationChannelConfig(channel, config);

  if (!channelConfig) {
    throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_CHANNEL', 'Notification channel is not supported.');
  }

  if (!normalized.realDeliveryEnabled) {
    throw new AppError(403, 'NOTIFICATION_REAL_DELIVERY_DISABLED', 'Real notification delivery is disabled.');
  }

  if (normalized.globalKillSwitch) {
    throw new AppError(403, 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE', 'Notification real delivery kill switch is active.');
  }

  if (!channelConfig.enabled) {
    throw new AppError(403, 'NOTIFICATION_PROVIDER_DISABLED', 'Notification provider channel is disabled.');
  }

  if (!channelConfig.provider || channelConfig.provider === 'none') {
    throw new AppError(403, 'NOTIFICATION_PROVIDER_NOT_CONFIGURED', 'Notification provider is not configured.');
  }

  if (!hasRequiredProviderConfig(channel, channelConfig)) {
    throw new AppError(403, 'NOTIFICATION_PROVIDER_SECRET_MISSING', 'Notification provider required configuration is missing.');
  }

  throw new AppError(400, 'INVALID_NOTIFICATION_DELIVERY_MODE', 'Real notification delivery is not implemented in this release.');
}

module.exports = {
  assertNotificationDryRunAllowed,
  assertNotificationRealDeliveryAllowed
};
