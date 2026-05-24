const LEAD_STATUSES = ['new', 'active', 'converted', 'lost', 'won', 'archived'];
const LEAD_ACTIVE_STATUSES = ['new', 'active', 'converted', 'lost'];
const LEAD_STAGES = ['inquiry', 'qualified', 'consult_booked', 'consult_done', 'booked', 'converted', 'lost'];
const LEAD_SOURCES = ['manual', 'website', 'line', 'facebook', 'referral', 'import'];
const LEAD_STAGE_TRANSITIONS = {
  inquiry: ['qualified', 'lost'],
  qualified: ['consult_booked', 'lost'],
  consult_booked: ['consult_done', 'lost'],
  consult_done: ['booked', 'lost'],
  booked: ['converted', 'lost'],
  converted: [],
  lost: []
};
const LEGACY_LEAD_STATUS_ALIASES = {
  won: 'converted',
  archived: 'lost'
};

module.exports = {
  LEAD_STATUSES,
  LEAD_ACTIVE_STATUSES,
  LEAD_STAGES,
  LEAD_SOURCES,
  LEAD_STAGE_TRANSITIONS,
  LEGACY_LEAD_STATUS_ALIASES
};