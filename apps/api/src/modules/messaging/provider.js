async function sendMessage(message) {
  return {
    providerMessageId: `local-${Date.now()}-${message.channelType}`,
    integrationStatus: 'simulated',
    status: 'sent',
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    failureReason: null
  };
}

module.exports = {
  sendMessage
};
