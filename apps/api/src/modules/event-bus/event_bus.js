const subscribers = [];

function registerSubscriber(subscriber) {
  if (!subscribers.some((item) => item.name === subscriber.name)) {
    subscribers.push(subscriber);
  }
}

async function dispatchEvent(event) {
  const subscriberNames = arguments.length > 1 ? arguments[1] : null;
  const filter = Array.isArray(subscriberNames) && subscriberNames.length > 0 ? new Set(subscriberNames) : null;
  const results = [];

  for (const subscriber of subscribers) {
    if (filter && !filter.has(subscriber.name)) {
      continue;
    }

    if (subscriber.supports(event)) {
      try {
        await subscriber.handle(event);
        results.push({ name: subscriber.name, status: 'completed' });
      } catch (error) {
        results.push({ name: subscriber.name, status: 'failed', error: error.message });
      }
    }
  }

  return results;
}

module.exports = {
  registerSubscriber,
  dispatchEvent
};