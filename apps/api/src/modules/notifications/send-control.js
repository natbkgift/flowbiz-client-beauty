'use strict';

const { AppError } = require('../../common/errors');
const { CHANNELS, getNotificationChannelConfig, normalizeNotificationProviderConfig } = require('./provider-config');
const { hasRequiredProviderConfig } = require('./provider-readiness');

function assertNotificationApprovedForRealDelivery(draft, approval) {
  if (!draft) {
    throw new AppError(404, 'NOTIFICATION_DRAFT_NOT_FOUND', 'Notification draft not found.');
  }

  if (!approval) {
    throw new AppError(403, 'NOTIFICATION_SEND_APPROVAL_REQUIRED', 'Notification approval is required before real delivery.');
  }

  if (approval.status !== 'approved') {
    throw new AppError(403, 'NOTIFICATION_SEND_APPROVAL_REQUIRED', 'Notification draft is not approved for real delivery.');
  }
}

function readinessForChannel(providerReadiness, channel) {
  return providerReadiness?.channels?.[channel] || null;
}

function assertNotificationSendControlAllowed({ draft, approval, providerReadiness = null, config = {} } = {}) {
  assertNotificationApprovedForRealDelivery(draft, approval);

  if (!CHANNELS.includes(draft.channel)) {
    throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_CHANNEL', 'Notification channel is not supported.');
  }

  if (draft.channel !== 'email') {
    throw new AppError(400, 'NOTIFICATION_EMAIL_ONLY', 'Only email real delivery is supported in this release.');
  }

  const normalized = normalizeNotificationProviderConfig(config);

  if (!normalized.realDeliveryEnabled || providerReadiness?.realDeliveryEnabled === false) {
    throw new AppError(403, 'NOTIFICATION_REAL_DELIVERY_DISABLED', 'Real notification delivery is disabled.');
  }

  if (normalized.globalKillSwitch || providerReadiness?.globalKillSwitch === true) {
    throw new AppError(403, 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE', 'Notification real delivery kill switch is active.');
  }

  const channelReadiness = readinessForChannel(providerReadiness, draft.channel);
  if (channelReadiness && !channelReadiness.ready) {
    throw new AppError(403, 'NOTIFICATION_SEND_CONTROL_BLOCKED', 'Notification provider is not ready for real delivery.');
  }

  const channelConfig = getNotificationChannelConfig(draft.channel, config);
  if (!channelConfig) {
    throw new AppError(400, 'UNSUPPORTED_NOTIFICATION_CHANNEL', 'Notification channel is not supported.');
  }

  if (!channelConfig.enabled || !channelConfig.provider || channelConfig.provider === 'none' || !hasRequiredProviderConfig(draft.channel, channelConfig)) {
    throw new AppError(403, 'NOTIFICATION_SEND_CONTROL_BLOCKED', 'Notification send control blocked provider delivery.');
  }

  return true;
}

module.exports = {
  assertNotificationApprovedForRealDelivery,
  assertNotificationSendControlAllowed
};
