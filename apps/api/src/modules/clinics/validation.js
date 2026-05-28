const { AppError } = require('../../common/errors');
const { toSlug } = require('../../common/slug');

const RESERVED_CLINIC_SLUGS = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'pricing',
  'demo',
  'contact',
  'support',
  'terms',
  'privacy',
  'assets',
  'static',
  'public',
  'blog',
  'forum',
  'member',
  'members',
  'dashboard',
  'settings',
  'health',
  'healthz',
  'live',
  'ready',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
  'public.css',
  'styles.css',
  'v1',
  'webhook',
  'webhooks',
  'integration',
  'integrations',
  'channels',
  'templates',
  'leads',
  'customers',
  'campaigns',
  'automation',
  'audit',
  'ops',
  'billing',
  'ai',
  'line',
  'facebook',
  'tiktok'
]);

function normalizeClinicSlug(value) {
  if (typeof value !== 'string') return '';
  return toSlug(value, '').slice(0, 70).replace(/-+$/, '');
}

function isReservedClinicSlug(slug) {
  if (typeof slug !== 'string') return false;
  const normalized = slug.trim().toLowerCase();
  return RESERVED_CLINIC_SLUGS.has(normalized);
}

function isValidClinicSlug(slug) {
  if (typeof slug !== 'string') return false;
  if (slug.length === 0 || slug.length > 80) return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  if (slug.startsWith('-') || slug.endsWith('-')) return false;
  if (slug.includes('--')) return false;
  return true;
}

function assertValidClinicSlug(slug) {
  if (isReservedClinicSlug(slug)) {
    throw new AppError(400, 'RESERVED_CLINIC_SLUG', 'Clinic slug is reserved for system routes.');
  }
  if (!isValidClinicSlug(slug)) {
    throw new AppError(400, 'INVALID_CLINIC_SLUG', 'Clinic slug is invalid.');
  }
}

module.exports = {
  RESERVED_CLINIC_SLUGS,
  normalizeClinicSlug,
  isReservedClinicSlug,
  isValidClinicSlug,
  assertValidClinicSlug
};
