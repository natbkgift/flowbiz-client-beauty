const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const {
  isValidWebsiteStatus,
  isValidHomepageSectionStatus,
  normalizeSectionKey
} = require('./validation');

const hexColorRegex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function validateHexColor(color, fieldName) {
  if (!color) return;
  if (typeof color !== 'string' || !hexColorRegex.test(color)) {
    throw new AppError(400, 'INVALID_COLOR', `${fieldName} must be a valid HEX color code (e.g. #FFF or #FFFFFF).`);
  }
}

function isSafeUrl(val) {
  if (!val) return true;
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function validateSafeUrl(url, fieldName) {
  if (!url) return;
  if (!isSafeUrl(url)) {
    throw new AppError(400, 'INVALID_URL', `${fieldName} must be a safe http or https URL.`);
  }
}

function serializeWebsiteSettings(row) {
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

function serializeBrandingSettings(row) {
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

function serializeContactSettings(row) {
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

function serializeLocationSettings(row) {
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

function serializeHomepageSection(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sectionKey: row.section_key,
    sectionType: row.section_type,
    title: row.title || null,
    subtitle: row.subtitle || null,
    content: row.content_json || {},
    sortOrder: Number(row.sort_order || 0),
    status: row.status
  };
}

async function getClinicWebsitePayload(clinicId) {
  const pool = getPool();

  const clinicResult = await pool.query(
    'select id, name, slug, plan, status, timezone from clinics where id = $1 limit 1',
    [clinicId]
  );

  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const clinic = clinicResult.rows[0];

  const [websiteResult, brandingResult, contactResult, locationResult, sectionsResult] = await Promise.all([
    pool.query('select * from clinic_website_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_branding_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_contact_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query('select * from clinic_location_settings where clinic_id = $1 limit 1', [clinicId]),
    pool.query(
      `select * from clinic_homepage_sections
       where clinic_id = $1
       order by sort_order asc, id asc`,
      [clinicId]
    )
  ]);

  return {
    clinic: {
      id: Number(clinic.id),
      name: clinic.name,
      slug: clinic.slug,
      plan: clinic.plan,
      status: clinic.status,
      timezone: clinic.timezone
    },
    websiteSettings: serializeWebsiteSettings(websiteResult.rows[0]),
    brandingSettings: serializeBrandingSettings(brandingResult.rows[0]),
    contactSettings: serializeContactSettings(contactResult.rows[0]),
    locationSettings: serializeLocationSettings(locationResult.rows[0]),
    homepageSections: sectionsResult.rows.map(serializeHomepageSection)
  };
}

async function updateWebsiteSettings(clinicId, actorUserId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_website_settings where clinic_id = $1 limit 1', [clinicId]);
  const existing = existingRes.rows[0] || null;

  const websiteStatus = body.websiteStatus !== undefined ? body.websiteStatus : (existing?.website_status || 'draft');
  const publicDisplayName = body.publicDisplayName !== undefined ? body.publicDisplayName : (existing?.public_display_name || null);
  const tagline = body.tagline !== undefined ? body.tagline : (existing?.tagline || null);
  const shortDescription = body.shortDescription !== undefined ? body.shortDescription : (existing?.short_description || null);
  const defaultLocale = body.defaultLocale !== undefined ? body.defaultLocale : (existing?.default_locale || 'th-TH');

  if (!isValidWebsiteStatus(websiteStatus)) {
    throw new AppError(400, 'INVALID_WEBSITE_STATUS', `Invalid website status: ${websiteStatus}`);
  }

  const validLocales = ['th-TH', 'en-US'];
  const locale = validLocales.includes(defaultLocale) ? defaultLocale : 'th-TH';

  const trimmedDisplayName = typeof publicDisplayName === 'string' ? publicDisplayName.trim().substring(0, 200) : null;
  const trimmedTagline = typeof tagline === 'string' ? tagline.trim().substring(0, 500) : null;
  const trimmedDescription = typeof shortDescription === 'string' ? shortDescription.trim().substring(0, 2000) : null;

  const publishedAt = websiteStatus === 'active'
    ? (existing?.published_at || new Date())
    : (websiteStatus === 'draft' ? null : (existing?.published_at || null));

  const result = await pool.query(
    `insert into clinic_website_settings (
       clinic_id, website_status, public_display_name, tagline, short_description, default_locale, published_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (clinic_id)
     do update set
       website_status = excluded.website_status,
       public_display_name = excluded.public_display_name,
       tagline = excluded.tagline,
       short_description = excluded.short_description,
       default_locale = excluded.default_locale,
       published_at = excluded.published_at,
       updated_at = now()
     returning *`,
    [clinicId, websiteStatus, trimmedDisplayName, trimmedTagline, trimmedDescription, locale, publishedAt]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_website',
    entityId: clinicId,
    actionType: 'clinic_website.updated',
    actorUserId,
    contextJson: {
      summary: {
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return serializeWebsiteSettings(result.rows[0]);
}

async function updateBrandingSettings(clinicId, actorUserId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_branding_settings where clinic_id = $1 limit 1', [clinicId]);
  const existing = existingRes.rows[0] || null;

  const logoUrl = body.logoUrl !== undefined ? body.logoUrl : (existing?.logo_url || null);
  const faviconUrl = body.faviconUrl !== undefined ? body.faviconUrl : (existing?.favicon_url || null);
  const heroImageUrl = body.heroImageUrl !== undefined ? body.heroImageUrl : (existing?.hero_image_url || null);
  const primaryColor = body.primaryColor !== undefined ? body.primaryColor : (existing?.primary_color || null);
  const secondaryColor = body.secondaryColor !== undefined ? body.secondaryColor : (existing?.secondary_color || null);
  const accentColor = body.accentColor !== undefined ? body.accentColor : (existing?.accent_color || null);
  const fontFamily = body.fontFamily !== undefined ? body.fontFamily : (existing?.font_family || null);

  validateSafeUrl(logoUrl, 'logoUrl');
  validateSafeUrl(faviconUrl, 'faviconUrl');
  validateSafeUrl(heroImageUrl, 'heroImageUrl');

  validateHexColor(primaryColor, 'primaryColor');
  validateHexColor(secondaryColor, 'secondaryColor');
  validateHexColor(accentColor, 'accentColor');

  const trimmedFont = typeof fontFamily === 'string' ? fontFamily.trim().substring(0, 100) : null;

  const result = await pool.query(
    `insert into clinic_branding_settings (
       clinic_id, logo_url, favicon_url, hero_image_url, primary_color, secondary_color, accent_color, font_family, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (clinic_id)
     do update set
       logo_url = excluded.logo_url,
       favicon_url = excluded.favicon_url,
       hero_image_url = excluded.hero_image_url,
       primary_color = excluded.primary_color,
       secondary_color = excluded.secondary_color,
       accent_color = excluded.accent_color,
       font_family = excluded.font_family,
       updated_at = now()
     returning *`,
    [clinicId, logoUrl, faviconUrl, heroImageUrl, primaryColor, secondaryColor, accentColor, trimmedFont]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_website',
    entityId: clinicId,
    actionType: 'clinic_branding.updated',
    actorUserId,
    contextJson: {
      summary: {
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return serializeBrandingSettings(result.rows[0]);
}

async function updateContactSettings(clinicId, actorUserId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_contact_settings where clinic_id = $1 limit 1', [clinicId]);
  const existing = existingRes.rows[0] || null;

  const phone = body.phone !== undefined ? body.phone : (existing?.phone || null);
  const email = body.email !== undefined ? body.email : (existing?.email || null);
  const lineUrl = body.lineUrl !== undefined ? body.lineUrl : (existing?.line_url || null);
  const lineOaId = body.lineOaId !== undefined ? body.lineOaId : (existing?.line_oa_id || null);
  const facebookUrl = body.facebookUrl !== undefined ? body.facebookUrl : (existing?.facebook_url || null);
  const instagramUrl = body.instagramUrl !== undefined ? body.instagramUrl : (existing?.instagram_url || null);
  const tiktokUrl = body.tiktokUrl !== undefined ? body.tiktokUrl : (existing?.tiktok_url || null);
  const websiteUrl = body.websiteUrl !== undefined ? body.websiteUrl : (existing?.website_url || null);

  validateSafeUrl(lineUrl, 'lineUrl');
  validateSafeUrl(facebookUrl, 'facebookUrl');
  validateSafeUrl(instagramUrl, 'instagramUrl');
  validateSafeUrl(tiktokUrl, 'tiktokUrl');
  validateSafeUrl(websiteUrl, 'websiteUrl');

  const trimmedPhone = typeof phone === 'string' ? phone.trim().substring(0, 100) : null;
  const trimmedEmail = typeof email === 'string' ? email.trim() : null;
  const trimmedLineOaId = typeof lineOaId === 'string' ? lineOaId.trim().substring(0, 100) : null;

  if (trimmedEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new AppError(400, 'INVALID_EMAIL', 'Email format is invalid.');
    }
  }

  const result = await pool.query(
    `insert into clinic_contact_settings (
       clinic_id, phone, email, line_url, line_oa_id, facebook_url, instagram_url, tiktok_url, website_url, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (clinic_id)
     do update set
       phone = excluded.phone,
       email = excluded.email,
       line_url = excluded.line_url,
       line_oa_id = excluded.line_oa_id,
       facebook_url = excluded.facebook_url,
       instagram_url = excluded.instagram_url,
       tiktok_url = excluded.tiktok_url,
       website_url = excluded.website_url,
       updated_at = now()
     returning *`,
    [clinicId, trimmedPhone, trimmedEmail, lineUrl, trimmedLineOaId, facebookUrl, instagramUrl, tiktokUrl, websiteUrl]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_website',
    entityId: clinicId,
    actionType: 'clinic_contact.updated',
    actorUserId,
    contextJson: {
      summary: {
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return serializeContactSettings(result.rows[0]);
}

async function updateLocationSettings(clinicId, actorUserId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_location_settings where clinic_id = $1 limit 1', [clinicId]);
  const existing = existingRes.rows[0] || null;

  const addressLine1 = body.addressLine1 !== undefined ? body.addressLine1 : (existing?.address_line1 || null);
  const addressLine2 = body.addressLine2 !== undefined ? body.addressLine2 : (existing?.address_line2 || null);
  const district = body.district !== undefined ? body.district : (existing?.district || null);
  const province = body.province !== undefined ? body.province : (existing?.province || null);
  const postalCode = body.postalCode !== undefined ? body.postalCode : (existing?.postal_code || null);
  const country = body.country !== undefined ? body.country : (existing?.country || 'Thailand');
  const googleMapUrl = body.googleMapUrl !== undefined ? body.googleMapUrl : (existing?.google_map_url || null);
  const googleMapEmbedUrl = body.googleMapEmbedUrl !== undefined ? body.googleMapEmbedUrl : (existing?.google_map_embed_url || null);
  const latitude = body.latitude !== undefined ? body.latitude : (existing?.latitude ?? null);
  const longitude = body.longitude !== undefined ? body.longitude : (existing?.longitude ?? null);
  const businessHours = body.businessHours !== undefined ? body.businessHours : (existing?.business_hours_json || {});

  validateSafeUrl(googleMapUrl, 'googleMapUrl');
  validateSafeUrl(googleMapEmbedUrl, 'googleMapEmbedUrl');

  if (latitude !== null && latitude !== undefined && latitude !== '') {
    const latNum = Number(latitude);
    if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
      throw new AppError(400, 'INVALID_LATITUDE', 'Latitude must be between -90 and 90.');
    }
  }

  if (longitude !== null && longitude !== undefined && longitude !== '') {
    const lngNum = Number(longitude);
    if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      throw new AppError(400, 'INVALID_LONGITUDE', 'Longitude must be between -180 and 180.');
    }
  }

  if (businessHours && (typeof businessHours !== 'object' || Array.isArray(businessHours))) {
    throw new AppError(400, 'INVALID_BUSINESS_HOURS', 'businessHours must be a structured JSON object only.');
  }

  const result = await pool.query(
    `insert into clinic_location_settings (
       clinic_id, address_line1, address_line2, district, province, postal_code, country,
       google_map_url, google_map_embed_url, latitude, longitude, business_hours_json, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
     on conflict (clinic_id)
     do update set
       address_line1 = excluded.address_line1,
       address_line2 = excluded.address_line2,
       district = excluded.district,
       province = excluded.province,
       postal_code = excluded.postal_code,
       country = excluded.country,
       google_map_url = excluded.google_map_url,
       google_map_embed_url = excluded.google_map_embed_url,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       business_hours_json = excluded.business_hours_json,
       updated_at = now()
     returning *`,
    [
      clinicId,
      addressLine1,
      addressLine2,
      district,
      province,
      postalCode,
      country,
      googleMapUrl,
      googleMapEmbedUrl,
      latitude === '' ? null : latitude,
      longitude === '' ? null : longitude,
      JSON.stringify(businessHours)
    ]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_website',
    entityId: clinicId,
    actionType: 'clinic_location.updated',
    actorUserId,
    contextJson: {
      summary: {
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return serializeLocationSettings(result.rows[0]);
}

async function createHomepageSection(clinicId, actorUserId, body) {
  const pool = getPool();

  const sectionKey = body.sectionKey;
  const sectionType = body.sectionType;
  const title = body.title || null;
  const subtitle = body.subtitle || null;
  const content = body.content || {};
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : 0;
  const status = body.status || 'draft';

  if (!sectionKey) {
    throw new AppError(400, 'MISSING_SECTION_KEY', 'sectionKey is required.');
  }

  const normalizedKey = normalizeSectionKey(sectionKey);

  if (!sectionType) {
    throw new AppError(400, 'MISSING_SECTION_TYPE', 'sectionType is required.');
  }

  const allowedTypes = ['hero', 'trust_badges', 'services_preview', 'promotions_preview', 'about', 'location', 'final_cta', 'custom'];
  if (!allowedTypes.includes(sectionType)) {
    throw new AppError(400, 'INVALID_SECTION_TYPE', `Invalid section type: ${sectionType}`);
  }

  if (!isValidHomepageSectionStatus(status)) {
    throw new AppError(400, 'INVALID_SECTION_STATUS', `Invalid section status: ${status}`);
  }

  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    throw new AppError(400, 'INVALID_SECTION_CONTENT', 'section content must be a structured JSON object only.');
  }

  const conflictCheck = await pool.query(
    'select 1 from clinic_homepage_sections where clinic_id = $1 and section_key = $2 limit 1',
    [clinicId, normalizedKey]
  );

  if (conflictCheck.rowCount > 0) {
    throw new AppError(409, 'SECTION_KEY_CONFLICT', `A homepage section with key '${normalizedKey}' already exists.`);
  }

  const result = await pool.query(
    `insert into clinic_homepage_sections (
       clinic_id, section_key, section_type, title, subtitle, content_json, sort_order, status, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now(), now())
     returning *`,
    [clinicId, normalizedKey, sectionType, title, subtitle, JSON.stringify(content), sortOrder, status]
  );

  const createdSection = serializeHomepageSection(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_homepage_section',
    entityId: createdSection.id,
    actionType: 'clinic_section.created',
    actorUserId,
    contextJson: {
      summary: {
        sectionId: createdSection.id,
        sectionKey: createdSection.sectionKey,
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return createdSection;
}

async function updateHomepageSection(clinicId, actorUserId, sectionId, body) {
  const pool = getPool();

  const sectionRes = await pool.query(
    'select * from clinic_homepage_sections where id = $1 limit 1',
    [sectionId]
  );

  if (sectionRes.rowCount === 0) {
    throw new AppError(404, 'SECTION_NOT_FOUND', 'Section not found.');
  }

  const existing = sectionRes.rows[0];

  if (String(existing.clinic_id) !== String(clinicId)) {
    throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', 'You do not have permission to update this section.');
  }

  const sectionKey = body.sectionKey !== undefined ? body.sectionKey : existing.section_key;
  const sectionType = body.sectionType !== undefined ? body.sectionType : existing.section_type;
  const title = body.title !== undefined ? body.title : existing.title;
  const subtitle = body.subtitle !== undefined ? body.subtitle : existing.subtitle;
  const content = body.content !== undefined ? body.content : existing.content_json;
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order;
  const status = body.status !== undefined ? body.status : existing.status;

  const normalizedKey = normalizeSectionKey(sectionKey);

  const allowedTypes = ['hero', 'trust_badges', 'services_preview', 'promotions_preview', 'about', 'location', 'final_cta', 'custom'];
  if (!allowedTypes.includes(sectionType)) {
    throw new AppError(400, 'INVALID_SECTION_TYPE', `Invalid section type: ${sectionType}`);
  }

  if (!isValidHomepageSectionStatus(status)) {
    throw new AppError(400, 'INVALID_SECTION_STATUS', `Invalid section status: ${status}`);
  }

  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    throw new AppError(400, 'INVALID_SECTION_CONTENT', 'section content must be a structured JSON object only.');
  }

  if (normalizedKey !== existing.section_key) {
    const conflictCheck = await pool.query(
      'select 1 from clinic_homepage_sections where clinic_id = $1 and section_key = $2 and id != $3 limit 1',
      [clinicId, normalizedKey, sectionId]
    );

    if (conflictCheck.rowCount > 0) {
      throw new AppError(409, 'SECTION_KEY_CONFLICT', `A homepage section with key '${normalizedKey}' already exists.`);
    }
  }

  const result = await pool.query(
    `update clinic_homepage_sections
     set section_key = $1,
         section_type = $2,
         title = $3,
         subtitle = $4,
         content_json = $5::jsonb,
         sort_order = $6,
         status = $7,
         updated_at = now()
     where id = $8
     returning *`,
    [normalizedKey, sectionType, title, subtitle, JSON.stringify(content), sortOrder, status, sectionId]
  );

  const updatedSection = serializeHomepageSection(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_homepage_section',
    entityId: updatedSection.id,
    actionType: 'clinic_section.updated',
    actorUserId,
    contextJson: {
      summary: {
        sectionId: updatedSection.id,
        sectionKey: updatedSection.sectionKey,
        changedFields: Object.keys(body),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return updatedSection;
}

async function deleteHomepageSection(clinicId, actorUserId, sectionId) {
  const pool = getPool();

  const sectionRes = await pool.query(
    'select * from clinic_homepage_sections where id = $1 limit 1',
    [sectionId]
  );

  if (sectionRes.rowCount === 0) {
    throw new AppError(404, 'SECTION_NOT_FOUND', 'Section not found.');
  }

  const existing = sectionRes.rows[0];

  if (String(existing.clinic_id) !== String(clinicId)) {
    throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', 'You do not have permission to delete this section.');
  }

  await pool.query('delete from clinic_homepage_sections where id = $1', [sectionId]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_homepage_section',
    entityId: Number(sectionId),
    actionType: 'clinic_section.deleted',
    actorUserId,
    contextJson: {
      summary: {
        sectionId: Number(sectionId),
        sectionKey: existing.section_key,
        changedFields: ['deleted'],
        source: 'clinic_website_admin_api'
      }
    }
  });

  return { success: true };
}

async function reorderHomepageSections(clinicId, actorUserId, body) {
  const pool = getPool();
  const sections = body.sections;

  if (!Array.isArray(sections)) {
    throw new AppError(400, 'INVALID_REORDER_PAYLOAD', 'Sections must be an array of objects containing id and sortOrder.');
  }

  for (const item of sections) {
    if (item.id === undefined || item.id === null || item.sortOrder === undefined || item.sortOrder === null) {
      throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must contain id and sortOrder.');
    }

    const updateRes = await pool.query(
      'update clinic_homepage_sections set sort_order = $1, updated_at = now() where id = $2 and clinic_id = $3',
      [Number(item.sortOrder), Number(item.id), clinicId]
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of sections) {
      if (item.id === undefined || item.id === null || item.sortOrder === undefined || item.sortOrder === null) {
        throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must contain id and sortOrder.');
      }
      await client.query(
        'update clinic_homepage_sections set sort_order = $1, updated_at = now() where id = $2 and clinic_id = $3',
        [Number(item.sortOrder), Number(item.id), clinicId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_website',
    entityId: clinicId,
    actionType: 'clinic_sections.reordered',
    actorUserId,
    contextJson: {
      summary: {
        changedFields: ['reordered'],
        reorderedSections: (sections || []).map(s => ({ id: s.id, sortOrder: s.sortOrder })),
        source: 'clinic_website_admin_api'
      }
    }
  });

  return { success: true };
}

module.exports = {
  getClinicWebsitePayload,
  updateWebsiteSettings,
  updateBrandingSettings,
  updateContactSettings,
  updateLocationSettings,
  createHomepageSection,
  updateHomepageSection,
  deleteHomepageSection,
  reorderHomepageSections
};
