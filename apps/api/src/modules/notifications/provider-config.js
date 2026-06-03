'use strict';

const CHANNELS = ['email', 'line', 'sms'];

function normalizeNotificationProviderConfig(config = {}) {
  const notifications = config.notifications || {};

  return {
    dryRunEnabled: Object.prototype.hasOwnProperty.call(notifications, 'dryRunEnabled')
      ? Boolean(notifications.dryRunEnabled)
      : Object.prototype.hasOwnProperty.call(config, 'notificationDryRunEnabled')
        ? Boolean(config.notificationDryRunEnabled)
        : true,
    realDeliveryEnabled: Object.prototype.hasOwnProperty.call(notifications, 'realDeliveryEnabled')
      ? Boolean(notifications.realDeliveryEnabled)
      : Boolean(config.notificationRealDeliveryEnabled),
    globalKillSwitch: Object.prototype.hasOwnProperty.call(notifications, 'globalKillSwitch')
      ? Boolean(notifications.globalKillSwitch)
      : Object.prototype.hasOwnProperty.call(config, 'notificationGlobalKillSwitch')
        ? Boolean(config.notificationGlobalKillSwitch)
        : true,
    email: {
      enabled: Boolean(notifications.email?.enabled),
      provider: notifications.email?.provider || 'none',
      from: notifications.email?.from || null,
      replyTo: notifications.email?.replyTo || null
    },
    line: {
      enabled: Boolean(notifications.line?.enabled),
      provider: notifications.line?.provider || 'none',
      channelAccessTokenConfigured: Boolean(notifications.line?.channelAccessTokenConfigured)
    },
    sms: {
      enabled: Boolean(notifications.sms?.enabled),
      provider: notifications.sms?.provider || 'none',
      from: notifications.sms?.from || null
    }
  };
}

function getNotificationChannelConfig(channel, config = {}) {
  const normalized = normalizeNotificationProviderConfig(config);
  if (!CHANNELS.includes(channel)) {
    return null;
  }
  return normalized[channel];
}

module.exports = {
  CHANNELS,
  getNotificationChannelConfig,
  normalizeNotificationProviderConfig
};
