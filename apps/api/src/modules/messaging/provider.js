async function sendMessage(message) {
  return {
    providerMessageId: `local-${Date.now()}-${message.channelType}`,
    status: 'delivered',
    sentAt: new Date().toISOString(),
    deliveredAt: new Date().toISOString(),
    failureReason: null
  };
}

module.exports = {
  sendMessage
};