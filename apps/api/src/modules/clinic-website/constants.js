const WEBSITE_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
};

const SECTION_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  HIDDEN: 'hidden'
};

const DEFAULT_SECTION_KEYS = {
  HERO: 'hero',
  TRUST_BADGES: 'trust_badges',
  SERVICES_PREVIEW: 'services_preview',
  PROMOTIONS_PREVIEW: 'promotions_preview',
  PACKAGES_PREVIEW: 'packages_preview',
  DOCTORS_PREVIEW: 'doctors_preview',
  BEFORE_AFTER_PREVIEW: 'before_after_preview',
  REVIEWS_PREVIEW: 'reviews_preview',
  LOCATION: 'location',
  FINAL_CTA: 'final_cta'
};

const ALLOWED_WEBSITE_STATUSES = Object.values(WEBSITE_STATUSES);
const ALLOWED_SECTION_STATUSES = Object.values(SECTION_STATUSES);
const ALLOWED_DEFAULT_SECTION_KEYS = Object.values(DEFAULT_SECTION_KEYS);

module.exports = {
  WEBSITE_STATUSES,
  SECTION_STATUSES,
  DEFAULT_SECTION_KEYS,
  ALLOWED_WEBSITE_STATUSES,
  ALLOWED_SECTION_STATUSES,
  ALLOWED_DEFAULT_SECTION_KEYS
};
