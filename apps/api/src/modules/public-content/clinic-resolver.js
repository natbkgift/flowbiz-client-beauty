const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const {
  normalizeClinicSlug,
  isValidClinicSlug,
  isReservedClinicSlug
} = require('../clinics/validation');

/**
 * Resolve a clinic ID from a public slug string.
 * Returns the clinic record (id, status) if found and active.
 * Returns null if the slug is invalid, reserved, or not found.
 */
async function resolvePublicClinicBySlug(slug) {
  if (typeof slug !== 'string') return null;

  const normalized = normalizeClinicSlug(slug);

  // Reject invalid or reserved slugs (return null to keep 404 consistent)
  if (!isValidClinicSlug(normalized)) return null;
  if (isReservedClinicSlug(normalized)) return null;

  const pool = getPool();
  const result = await pool.query(
    'select id, name, slug, plan, status, timezone from clinics where slug = $1 limit 1',
    [normalized]
  );

  if (result.rowCount === 0) return null;
  return result.rows[0];
}

/**
 * Resolve a clinic ID from a slug, returning only the numeric ID.
 * Throws AppError(404) for any failure condition.
 */
async function resolvePublicClinicIdFromSlug(slug) {
  const clinic = await resolvePublicClinicBySlug(slug);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }
  if (clinic.status !== 'active') {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }
  return Number(clinic.id);
}

/**
 * Fetch full public clinic data by slug.
 * Only returns data for active clinics.
 * Returns safe defaults when settings rows are missing.
 */
async function getPublicClinicBySlug(slug) {
  if (typeof slug !== 'string') {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const normalized = normalizeClinicSlug(slug);

  // Validate slug format (public endpoint: always 404, not 400)
  if (!isValidClinicSlug(normalized) || isReservedClinicSlug(normalized)) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const pool = getPool();

  const clinicResult = await pool.query(
    'select id, name, slug, plan, status, timezone from clinics where slug = $1 limit 1',
    [normalized]
  );

  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const clinic = clinicResult.rows[0];

  // Inactive clinics must not be exposed to the public
  if (clinic.status !== 'active') {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const clinicId = Number(clinic.id);

  // Parallel fetch of all settings tables
  const [websiteResult, brandingResult, contactResult, locationResult, sectionsResult] = await Promise.all([
    pool.query('select * from clinic_website_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_branding_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_contact_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_location_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query(
      `select section_key, section_type, title, subtitle, content_json, sort_order, status
       from clinic_homepage_sections
       where clinic_id = $1 and status != 'hidden'
       order by sort_order asc, id asc`,
      [clinicId]
    )
  ]);

  const websiteRow = websiteResult.rows[0] || null;
  const brandingRow = brandingResult.rows[0] || null;
  const contactRow = contactResult.rows[0] || null;
  const locationRow = locationResult.rows[0] || null;

  return {
    clinic: serializePublicClinic(clinic),
    websiteSettings: serializePublicWebsiteSettings(websiteRow),
    brandingSettings: serializePublicBrandingSettings(brandingRow),
    contactSettings: serializePublicContactSettings(contactRow),
    locationSettings: serializePublicLocationSettings(locationRow),
    homepageSections: serializePublicHomepageSections(sectionsResult.rows),
    features: {
      blogEnabled: true,
      forumEnabled: true,
      bookingEnabled: false,
      packagesEnabled: false
    },
    isPubliclyRenderable: clinic.status === 'active' && (websiteRow ? websiteRow.website_status === 'active' : false)
  };
}

/**
 * Serialize clinic core fields for public response.
 */
function serializePublicClinic(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    timezone: row.timezone || 'Asia/Bangkok'
  };
}

/**
 * Serialize website settings with safe defaults when row is missing.
 */
function serializePublicWebsiteSettings(row) {
  if (!row) {
    return {
      websiteStatus: 'draft',
      publicDisplayName: null,
      tagline: null,
      shortDescription: null,
      defaultLocale: 'th-TH',
      publishedAt: null
    };
  }
  return {
    websiteStatus: row.website_status || 'draft',
    publicDisplayName: row.public_display_name || null,
    tagline: row.tagline || null,
    shortDescription: row.short_description || null,
    defaultLocale: row.default_locale || 'th-TH',
    publishedAt: row.published_at || null
  };
}

/**
 * Serialize branding settings with safe defaults when row is missing.
 */
function serializePublicBrandingSettings(row) {
  if (!row) {
    return {
      logoUrl: null,
      faviconUrl: null,
      heroImageUrl: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontFamily: null
    };
  }
  return {
    logoUrl: row.logo_url || null,
    faviconUrl: row.favicon_url || null,
    heroImageUrl: row.hero_image_url || null,
    primaryColor: row.primary_color || null,
    secondaryColor: row.secondary_color || null,
    accentColor: row.accent_color || null,
    fontFamily: row.font_family || null
  };
}

/**
 * Serialize contact settings with safe defaults when row is missing.
 */
function serializePublicContactSettings(row) {
  if (!row) {
    return {
      phone: null,
      email: null,
      lineUrl: null,
      lineOaId: null,
      facebookUrl: null,
      instagramUrl: null,
      tiktokUrl: null,
      websiteUrl: null
    };
  }
  return {
    phone: row.phone || null,
    email: row.email || null,
    lineUrl: row.line_url || null,
    lineOaId: row.line_oa_id || null,
    facebookUrl: row.facebook_url || null,
    instagramUrl: row.instagram_url || null,
    tiktokUrl: row.tiktok_url || null,
    websiteUrl: row.website_url || null
  };
}

/**
 * Serialize location settings with safe defaults when row is missing.
 */
function serializePublicLocationSettings(row) {
  if (!row) {
    return {
      addressLine1: null,
      addressLine2: null,
      district: null,
      province: null,
      postalCode: null,
      country: 'Thailand',
      googleMapUrl: null,
      googleMapEmbedUrl: null,
      latitude: null,
      longitude: null,
      businessHours: {}
    };
  }
  return {
    addressLine1: row.address_line1 || null,
    addressLine2: row.address_line2 || null,
    district: row.district || null,
    province: row.province || null,
    postalCode: row.postal_code || null,
    country: row.country || 'Thailand',
    googleMapUrl: row.google_map_url || null,
    googleMapEmbedUrl: row.google_map_embed_url || null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    businessHours: row.business_hours_json || {}
  };
}

/**
 * Serialize homepage sections array.
 */
function serializePublicHomepageSections(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    sectionKey: row.section_key,
    sectionType: row.section_type,
    title: row.title || null,
    subtitle: row.subtitle || null,
    content: row.content_json || {},
    sortOrder: row.sort_order,
    status: row.status
  }));
}

module.exports = {
  getPublicClinicBySlug,
  resolvePublicClinicBySlug,
  resolvePublicClinicIdFromSlug,
  serializePublicClinic,
  serializePublicWebsiteSettings,
  serializePublicBrandingSettings,
  serializePublicContactSettings,
  serializePublicLocationSettings,
  serializePublicHomepageSections
};
