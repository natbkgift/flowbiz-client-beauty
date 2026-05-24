const LIFECYCLE_FLOW_PRESETS = [
  {
    key: 'new_lead_welcome',
    name: 'Lifecycle - New Lead Welcome',
    triggerEvent: 'lead.created',
    entityType: 'lead',
    guardConditions: {
      leadStatusEquals: 'new'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'lead_welcome'
      },
      {
        logicalStepType: 'schedule_task',
        engineStepType: 'create_task',
        dueInMinutes: 1440,
        title: 'Follow up new lead after 24 hours',
        taskType: 'new_lead_followup'
      }
    ]
  },
  {
    key: 'missed_response_follow_up',
    name: 'Lifecycle - Missed Response Follow-Up',
    triggerEvent: 'lead.created',
    entityType: 'lead',
    guardConditions: {
      lastContactedAtIsNull: true
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'wait',
        engineStepType: 'wait',
        delayMinutes: 360,
        blocking: false,
        title: 'Check response after 6 hours'
      },
      {
        logicalStepType: 'condition_check',
        engineStepType: 'send_message',
        templateName: 'missed_response_follow_up',
        scheduledAfterMinutes: 360,
        guardConditions: {
          lastContactedAtIsNull: true
        }
      }
    ]
  },
  {
    key: 'hot_lead_alert',
    name: 'Lifecycle - Hot Lead Alert',
    triggerEvent: 'lead.stage.updated',
    entityType: 'lead',
    guardConditions: {
      stageEquals: 'qualified'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'internal_notify',
        engineStepType: 'notify_user',
        assignedUserField: 'ownerUserId',
        title: 'Qualified lead requires immediate attention',
        description: 'Lifecycle hot lead alert triggered for a qualified lead.'
      }
    ]
  },
  {
    key: 'viewing_reminder',
    name: 'Lifecycle - Viewing Reminder',
    triggerEvent: 'lead.stage.updated',
    entityType: 'lead',
    guardConditions: {
      stageEquals: 'viewing'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'schedule_task',
        engineStepType: 'create_task',
        title: 'Viewing reminder - 2 hours before appointment',
        taskType: 'viewing_reminder',
        dueAtFromContextField: 'viewingAt',
        dueOffsetMinutes: -120
      },
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'viewing_reminder',
        scheduledFromContextField: 'viewingAt',
        scheduledOffsetMinutes: -120
      }
    ]
  },
  {
    key: 'post_viewing_follow_up',
    name: 'Lifecycle - Post Viewing Follow-Up',
    triggerEvent: 'lead.stage.updated',
    entityType: 'lead',
    guardConditions: {
      stageEquals: 'viewed'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'wait',
        engineStepType: 'wait',
        delayMinutes: 240,
        blocking: false,
        title: 'Wait 4 hours after viewing'
      },
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'post_viewing_follow_up',
        scheduledAfterMinutes: 240
      }
    ]
  },
  {
    key: 'dormant_lead_reactivation',
    name: 'Lifecycle - Dormant Lead Reactivation',
    triggerEvent: 'lead.last_contacted_timeout',
    entityType: 'lead',
    guardConditions: {
      lastContactedOlderThanDays: 14
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'dormant_lead_reactivation'
      }
    ]
  },
  {
    key: 'negotiation_nurture',
    name: 'Lifecycle - Negotiation Nurture',
    triggerEvent: 'lead.stage.updated',
    entityType: 'lead',
    guardConditions: {
      stageEquals: 'negotiation'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'schedule_task',
        engineStepType: 'create_task',
        dueInMinutes: 720,
        title: 'Negotiation nurture sequence check-in',
        taskType: 'negotiation_nurture'
      },
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'negotiation_nurture'
      }
    ]
  },
  {
    key: 'lost_lead_recovery',
    name: 'Lifecycle - Lost Lead Recovery',
    triggerEvent: 'lead.status.updated',
    entityType: 'lead',
    guardConditions: {
      statusEquals: 'lost'
    },
    rateLimits: {
      maxExecutionsPerEntity: 1,
      maxMessagesPerDayPerLead: 2
    },
    steps: [
      {
        logicalStepType: 'wait',
        engineStepType: 'wait',
        delayMinutes: 43200,
        blocking: false,
        title: 'Wait 30 days before recovery outreach'
      },
      {
        logicalStepType: 'send_message',
        engineStepType: 'send_message',
        templateName: 'lost_lead_recovery',
        scheduledAfterMinutes: 43200
      }
    ]
  }
];

function getLifecycleFlowPresets() {
  return LIFECYCLE_FLOW_PRESETS.map((preset) => ({
    ...preset,
    guardConditions: { ...preset.guardConditions },
    rateLimits: { ...preset.rateLimits },
    steps: preset.steps.map((step) => ({ ...step }))
  }));
}

module.exports = {
  LIFECYCLE_FLOW_PRESETS,
  getLifecycleFlowPresets
};