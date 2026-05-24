const CHANNEL_TYPES = ['line', 'email', 'sms'];
const CHANNEL_STATUSES = ['active', 'inactive'];
const TEMPLATE_CATEGORIES = ['followup', 'reminder', 'promotion', 'review_request', 'reactivation'];
const TEMPLATE_APPROVAL_STATUSES = ['draft', 'approved', 'archived'];
const OUTBOUND_MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'failed', 'cancelled'];
const OUTBOUND_MESSAGE_TYPES = ['manual', 'template', 'automation', 'campaign'];
const CONTACT_ENTITY_TYPES = ['lead', 'customer'];

module.exports = {
  CHANNEL_TYPES,
  CHANNEL_STATUSES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_APPROVAL_STATUSES,
  OUTBOUND_MESSAGE_STATUSES,
  OUTBOUND_MESSAGE_TYPES,
  CONTACT_ENTITY_TYPES
};