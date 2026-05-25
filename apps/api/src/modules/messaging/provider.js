async function sendMessage(message) {
  return {
    providerMessageId: `local-${Date.now()}-${message.channelType}`,
    integrationStatus: 'simulated',
    status: 'delivered',
    sentAt: new Date().toISOString(),
    deliveredAt: new Date().toISOString(),
    failureReason: null
  };
}

module.exports = {
  sendMessage
};
