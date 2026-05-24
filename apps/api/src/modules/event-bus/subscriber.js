const { registerSubscriber } = require('./event_bus');

let initialized = false;

function ensureDefaultSubscribers() {
  if (initialized) {
    return;
  }

  registerSubscriber({
    name: 'automation-subscriber',
    supports(event) {
      return ['lead.created', 'lead.updated', 'lead.stage_changed', 'lead.assigned', 'lead.note_added', 'lead.tag_added', 'customer.created'].includes(event.eventType);
    },
    async handle(event) {
      const { resolveWorkerContext } = require('../worker-engine/worker');
      const { handleDomainEvent } = require('../automation/service');
      const { runDueJobs } = require('../worker-engine/scheduler');
      const context = await resolveWorkerContext(
        event.clinicId,
        event.payloadJson.actorUserId || null,
        event.payloadJson.workspaceId || null
      );
      const payload = {
        eventName: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        eventId: `bus-${event.id}`,
        occurredAt: new Date(new Date(event.createdAt).getTime() - 1000).toISOString(),
        contextJson: event.payloadJson,
        deferExecution: true
      };

      await handleDomainEvent(context, payload);

      if (event.eventType === 'lead.stage_changed') {
        await handleDomainEvent(context, {
          ...payload,
          eventName: 'lead.stage.updated',
          eventId: `bus-stage-updated-${event.id}`
        });
      }

      if (event.eventType === 'lead.updated' && Object.prototype.hasOwnProperty.call(event.payloadJson || {}, 'nextStatus')) {
        await handleDomainEvent(context, {
          eventName: 'lead.status.updated',
          entityType: event.entityType,
          entityId: event.entityId,
          eventId: `bus-status-${event.id}`,
          occurredAt: new Date(new Date(event.createdAt).getTime() - 1000).toISOString(),
          contextJson: event.payloadJson,
          deferExecution: true
        });
      }

      await runDueJobs(50);
    }
  });

  registerSubscriber({
    name: 'ai-subscriber',
    supports(event) {
      return ['lead.created', 'lead.updated', 'lead.stage_changed', 'lead.note_added', 'lead.tag_added', 'customer.created'].includes(event.eventType);
    },
    async handle(event) {
      const { resolveWorkerContext } = require('../worker-engine/worker');
      const { recomputeLeadInsights, recomputeCustomerInsights } = require('../ai/service');
      const context = await resolveWorkerContext(
        event.clinicId,
        event.payloadJson.actorUserId || null,
        event.payloadJson.workspaceId || null
      );

      if (event.entityType === 'lead') {
        const updatedFields = Array.isArray(event.payloadJson?.updatedFields) ? event.payloadJson.updatedFields : [];

        if (event.eventType === 'lead.updated' && updatedFields.length === 1 && updatedFields.includes('intentScore')) {
          return;
        }

        await recomputeLeadInsights(context, event.entityId);
        const { generateLeadPrediction } = require('../ai-engine/prediction');
        await generateLeadPrediction(context, event.entityId);
      }

      if (event.entityType === 'customer') {
        await recomputeCustomerInsights(context, event.entityId);
        const { generateCustomerPrediction } = require('../ai-engine/prediction');
        await generateCustomerPrediction(context, event.entityId);
      }
    }
  });

  registerSubscriber({
    name: 'ai-feedback-outcome-subscriber',
    supports(event) {
      return ['message.sent', 'message.delivered', 'message.replied', 'lead.converted', 'lead.lost'].includes(event.eventType);
    },
    async handle(event) {
      const { trackOutcomeFromEvent } = require('../ai-feedback/service');
      await trackOutcomeFromEvent(event);
    }
  });

  registerSubscriber({
    name: 'ai-feedback-learning-subscriber',
    supports(event) {
      return event.eventType === 'ai.outcome_recorded';
    },
    async handle(event) {
      const { applyOutcomeLearning } = require('../ai-feedback/service');
      await applyOutcomeLearning(event);
    }
  });

  registerSubscriber({
    name: 'ai-auto-action-subscriber',
    supports(event) {
      return ['ai.learning_updated', 'lead.updated'].includes(event.eventType);
    },
    async handle(event) {
      if (event.entityType !== 'lead') {
        return;
      }

      const { handleAutoActionEvent } = require('../ai-actions/service');
      await handleAutoActionEvent(event);
    }
  });

  registerSubscriber({
    name: 'analytics-subscriber',
    supports() {
      return true;
    },
    async handle(event) {
      const { recomputeAnalytics } = require('../analytics/service');
      const metricDate = new Date(event.createdAt).toISOString().slice(0, 10);
      await recomputeAnalytics(event.clinicId, metricDate);
    }
  });

  initialized = true;
}

module.exports = {
  ensureDefaultSubscribers
};
