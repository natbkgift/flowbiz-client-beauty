'use strict';

async function sendEmailNotification(payload) {
  return {
    provider: 'sandbox',
    externalCallMade: false,
    messageId: `sandbox-email-${payload.draftId}`,
    accepted: [payload.to],
    rejected: [],
    safeResult: true
  };
}

module.exports = {
  sendEmailNotification
};
