const { ALLOWED_WEBSITE_STATUSES, ALLOWED_SECTION_STATUSES } = require('./constants');

function isValidWebsiteStatus(status) {
  return ALLOWED_WEBSITE_STATUSES.includes(status);
}

function isValidHomepageSectionStatus(status) {
  return ALLOWED_SECTION_STATUSES.includes(status);
}

function normalizeSectionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_') // Slug style allowed characters (lowercase letters, numbers, underscores, and dashes)
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

module.exports = {
  isValidWebsiteStatus,
  isValidHomepageSectionStatus,
  normalizeSectionKey
};
