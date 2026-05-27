const { sendTextMessage } = require('../integrations/line/service');

function buildSimulatedResult(message) {
  return {
    providerMessageId: `local-${Date.now()}-${message.channelType}`,
    integrationStatus: 'simulated',
    status: 'sent',
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    failureReason: null
  };
}

async function sendMessage(message, options = {}) {
  if (String(message.channelType || '').toLowerCase() === 'line') {
    return sendTextMessage(
      {
        clinicId: message.clinicId,
        entityType: message.entityType,
        entityId: message.entityId,
        actorUserId: message.actorUserId,
        recipientId: message.recipientRef || message.recipientId,
        text: message.contentRendered || message.text,
        source: message.source,
        approved: message.approved,
        dryRun: message.dryRun,
        metadata: message.metadata
      },
      options
    );
  }

  return buildSimulatedResult(message);
}

module.exports = {
  sendMessage
};
