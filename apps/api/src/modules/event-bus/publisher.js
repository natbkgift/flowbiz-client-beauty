const { getPool } = require('../../db');
const { loadConfig } = require('../../config');
const { AppError } = require('../../common/errors');
const { dispatchEvent } = require('./event_bus');
const { ensureDefaultSubscribers } = require('./subscriber');

function mapStoredEvent(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at
  };
}

async function publishDomainEvent(input) {
  ensureDefaultSubscribers();
  const result = await getPool().query(
    `
      insert into event_store (clinic_id, event_type, entity_type, entity_id, payload_json)
      values ($1, $2, $3, $4, $5::jsonb)
      returning *
    `,
    [input.clinicId, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payloadJson || {})]
  );
  const storedEvent = mapStoredEvent(result.rows[0]);
  const subscriberResults = await dispatchEvent(storedEvent);

  if (subscriberResults.some((item) => item.status === 'failed')) {
    await enqueueSubscriberRetryJob(storedEvent, subscriberResults);
  }

  return {
    event: storedEvent,
    subscriberResults
  };
}

async function getStoredEventById(eventId, client = getPool()) {
  const result = await client.query('select * from event_store where id = $1 limit 1', [eventId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'EVENT_NOT_FOUND', 'Stored domain event was not found.');
  }

  return mapStoredEvent(result.rows[0]);
}

async function enqueueSubscriberRetryJob(storedEvent, subscriberResults) {
  const failedSubscribers = subscriberResults
    .filter((item) => item.status === 'failed')
    .map((item) => item.name);

  if (failedSubscribers.length === 0) {
    return null;
  }

  const { enqueueJob } = require('../worker-engine/scheduler');
  return enqueueJob({
    clinicId: storedEvent.clinicId,
    jobType: 'event.dispatch.retry',
    payloadJson: {
      eventId: storedEvent.id,
      failedSubscribers
    },
    runAt: new Date(Date.now() - 1000).toISOString(),
    maxAttempts: loadConfig().eventRetryMaxAttempts
  });
}

async function retryDomainEventDelivery(eventId, subscriberNames) {
  ensureDefaultSubscribers();
  const storedEvent = await getStoredEventById(eventId);
  const retriedSubscribers = Array.isArray(subscriberNames) ? subscriberNames : [];
  const subscriberResults = await dispatchEvent(storedEvent, retriedSubscribers);

  return {
    event: storedEvent,
    retriedSubscribers,
    failedSubscribers: subscriberResults.filter((item) => item.status === 'failed').map((item) => item.name),
    subscriberResults
  };
}

module.exports = {
  publishDomainEvent,
  mapStoredEvent,
  getStoredEventById,
  retryDomainEventDelivery
};