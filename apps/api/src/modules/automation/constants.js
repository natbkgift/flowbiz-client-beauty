const AUTOMATION_FLOW_STATUSES = ['draft', 'active', 'paused', 'disabled', 'archived'];
const AUTOMATION_EXECUTION_STATUSES = ['pending', 'running', 'waiting', 'retrying', 'completed', 'failed', 'cancelled'];
const AUTOMATION_STEP_TYPES = [
  'condition',
  'action',
  'delay',
  'wait',
  'send_message',
  'create_task',
  'assign_user',
  'add_tag',
  'remove_tag',
  'change_stage',
  'create_reminder',
  'notify_user'
];
const AUTOMATION_TASK_STATUSES = ['open', 'completed', 'cancelled'];
const REMINDER_STATUSES = ['pending', 'due', 'completed', 'cancelled'];
const TRIGGER_TYPES = ['event', 'scheduled'];
const AUTOMATION_TRIGGER_EVENTS = ['lead.created', 'lead.stage_changed', 'lead.assigned', 'lead.note_added', 'lead.tag_added', 'ai.hot_lead_followup'];
const AUTOMATION_ACTION_TYPES = ['send_message', 'create_task', 'assign_user', 'add_tag', 'remove_tag'];
const AUTOMATION_STEP_EXECUTION_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped', 'waiting', 'retrying', 'scheduled', 'retry_scheduled'];

module.exports = {
  AUTOMATION_FLOW_STATUSES,
  AUTOMATION_EXECUTION_STATUSES,
  AUTOMATION_STEP_TYPES,
  AUTOMATION_TASK_STATUSES,
  REMINDER_STATUSES,
  TRIGGER_TYPES,
  AUTOMATION_TRIGGER_EVENTS,
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_STEP_EXECUTION_STATUSES
};