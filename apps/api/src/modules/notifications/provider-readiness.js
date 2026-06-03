'use strict';

const { CHANNELS, normalizeNotificationProviderConfig } = require('./provider-config');

function hasRequiredProviderConfig(channel, channelConfig) {
  if (channel === 'email') {
    return Boolean(channelConfig.from);
  }

  if (channel === 'line') {
    return Boolean(channelConfig.channelAccessTokenConfigured);
  }

  if (channel === 'sms') {
    return Boolean(channelConfig.from);
  }

  return false;
}

function getChannelBlockedReason(channel, normalizedConfig, channelConfig) {
  const prefix = channel.toUpperCase();

  if (!channelConfig.enabled) {
    return `${prefix}_PROVIDER_DISABLED`;
  }

  if (!channelConfig.provider || channelConfig.provider === 'none') {
    return `${prefix}_PROVIDER_NOT_CONFIGURED`;
  }

  if (!hasRequiredProviderConfig(channel, channelConfig)) {
    return `${prefix}_PROVIDER_SECRET_MISSING`;
  }

  if (!normalizedConfig.realDeliveryEnabled) {
    return 'NOTIFICATION_REAL_DELIVERY_DISABLED';
  }

  if (normalizedConfig.globalKillSwitch) {
    return 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE';
  }

  return null;
}

function getNotificationProviderReadiness(config = {}) {
  const normalized = normalizeNotificationProviderConfig(config);
  const realDeliveryBlocked = !normalized.realDeliveryEnabled || normalized.globalKillSwitch;
  const channels = {};

  for (const channel of CHANNELS) {
    const channelConfig = normalized[channel];
    const configured = Boolean(
      channelConfig.enabled &&
      channelConfig.provider &&
      channelConfig.provider !== 'none' &&
      hasRequiredProviderConfig(channel, channelConfig)
    );
    const blockedReason = getChannelBlockedReason(channel, normalized, channelConfig);

    channels[channel] = {
      enabled: channelConfig.enabled,
      provider: channelConfig.provider,
      ready: configured && !realDeliveryBlocked,
      configured,
      blockedReason
    };
  }

  return {
    realDeliveryEnabled: normalized.realDeliveryEnabled,
    dryRunEnabled: normalized.dryRunEnabled,
    globalKillSwitch: normalized.globalKillSwitch,
    realDeliveryBlocked,
    channels
  };
}

module.exports = {
  getNotificationProviderReadiness,
  hasRequiredProviderConfig
};
