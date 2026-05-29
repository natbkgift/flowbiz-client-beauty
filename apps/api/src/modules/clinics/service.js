const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');
const { normalizeClinicSlug, assertValidClinicSlug } = require('./validation');
const { hasPermission } = require('../rbac/service');

/**
 * Guard access specifically for platform administrators.
 * Verifies the user has explicit is_franchise_admin system flag from database.
 */
async function assertPlatformClinicManageAccess(context) {
  if (!context || !context.currentUser) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const pool = getPool();
  const userRes = await pool.query(
    'select is_franchise_admin from users where id = $1 limit 1',
    [context.currentUser.id]
  );
  
  const isFranchiseAdmin = userRes.rows[0]?.is_franchise_admin || false;
  if (!isFranchiseAdmin) {
    throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform admin permission is required.');
  }
  return context;
}

/**
 * List all clinics with pagination and search/status filters.
 */
async function listClinics(context, options = {}) {
  await assertPlatformClinicManageAccess(context);

  const limit = Math.min(Math.max(Number.parseInt(options.limit, 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(options.offset, 10) || 0, 0);

  let query = `
    select c.id, c.name, c.slug, c.plan, c.status, c.timezone, c.created_at as "createdAt", c.updated_at as "updatedAt",
           cws.website_status as "websiteStatus"
    from clinics c
    left join clinic_website_settings cws on cws.clinic_id = c.id
  `;
  
  const clauses = [];
  const values = [];
  let valueIndex = 1;

  if (options.status) {
    if (options.status !== 'active' && options.status !== 'inactive') {
      throw new AppError(400, 'INVALID_CLINIC_STATUS', 'Clinic status must be active or inactive.');
    }
    clauses.push(`c.status = $${valueIndex}`);
    values.push(options.status);
    valueIndex++;
  }

  if (options.search) {
    clauses.push(`(c.name ilike $${valueIndex} or c.slug ilike $${valueIndex})`);
    values.push(`%${options.search}%`);
    valueIndex++;
  }

  if (clauses.length > 0) {
    query += ` where ${clauses.join(' and ')}`;
  }

  query += ` order by c.created_at desc, c.id desc limit $${valueIndex} offset $${valueIndex + 1}`;
  values.push(limit, offset);

  // For total count
  let countQuery = 'select count(*) as count from clinics c';
  const countClauses = [];
  const countValues = [];
  let countValueIndex = 1;
  
  if (options.status) {
    countClauses.push(`c.status = $${countValueIndex}`);
    countValues.push(options.status);
    countValueIndex++;
  }
  if (options.search) {
    countClauses.push(`(c.name ilike $${countValueIndex} or c.slug ilike $${countValueIndex})`);
    countValues.push(`%${options.search}%`);
    countValueIndex++;
  }
  if (countClauses.length > 0) {
    countQuery += ` where ${countClauses.join(' and ')}`;
  }

  const pool = getPool();
  const [countResult, result] = await Promise.all([
    pool.query(countQuery, countValues),
    pool.query(query, values)
  ]);

  return {
    items: result.rows.map(row => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      status: row.status,
      timezone: row.timezone,
      websiteStatus: row.websiteStatus || 'draft',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })),
    pagination: {
      limit,
      offset,
      total: Number(countResult.rows[0].count)
    }
  };
}

/**
 * Retrieve detailed information of a single clinic.
 */
async function getClinicDetail(context, clinicId) {
  await assertPlatformClinicManageAccess(context);

  const parsedId = Number.parseInt(clinicId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Clinic ID must be a positive integer.');
  }

  const pool = getPool();
  const clinicResult = await pool.query(
    'select * from clinics where id = $1 limit 1',
    [parsedId]
  );

  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const clinic = clinicResult.rows[0];

  const [websiteResult, brandingResult, contactResult, locationResult, sectionsResult] = await Promise.all([
    pool.query('select * from clinic_website_settings where clinic_id = $1 limit 1', [parsedId]),
    pool.query('select * from clinic_branding_settings where clinic_id = $1 limit 1', [parsedId]),
    pool.query('select * from clinic_contact_settings where clinic_id = $1 limit 1', [parsedId]),
    pool.query('select * from clinic_location_settings where clinic_id = $1 limit 1', [parsedId]),
    pool.query('select section_key, section_type, title, subtitle, sort_order, status from clinic_homepage_sections where clinic_id = $1 order by sort_order asc', [parsedId])
  ]);

  return {
    id: Number(clinic.id),
    name: clinic.name,
    slug: clinic.slug,
    plan: clinic.plan,
    status: clinic.status,
    timezone: clinic.timezone,
    createdAt: clinic.created_at,
    updatedAt: clinic.updated_at,
    websiteSettings: websiteResult.rows[0] ? {
      id: Number(websiteResult.rows[0].id),
      websiteStatus: websiteResult.rows[0].website_status,
      publicDisplayName: websiteResult.rows[0].public_display_name,
      tagline: websiteResult.rows[0].tagline,
      shortDescription: websiteResult.rows[0].short_description,
      defaultLocale: websiteResult.rows[0].default_locale,
      publishedAt: websiteResult.rows[0].published_at,
      createdAt: websiteResult.rows[0].created_at,
      updatedAt: websiteResult.rows[0].updated_at
    } : null,
    brandingSettings: brandingResult.rows[0] ? {
      id: Number(brandingResult.rows[0].id),
      logoUrl: brandingResult.rows[0].logo_url,
      faviconUrl: brandingResult.rows[0].favicon_url,
      heroImageUrl: brandingResult.rows[0].hero_image_url,
      primaryColor: brandingResult.rows[0].primary_color,
      secondaryColor: brandingResult.rows[0].secondary_color,
      accentColor: brandingResult.rows[0].accent_color,
      fontFamily: brandingResult.rows[0].font_family,
      createdAt: brandingResult.rows[0].created_at,
      updatedAt: brandingResult.rows[0].updated_at
    } : null,
    contactSettings: contactResult.rows[0] ? {
      id: Number(contactResult.rows[0].id),
      phone: contactResult.rows[0].phone,
      email: contactResult.rows[0].email,
      lineUrl: contactResult.rows[0].line_url,
      lineOaId: contactResult.rows[0].line_oa_id,
      facebookUrl: contactResult.rows[0].facebook_url,
      instagramUrl: contactResult.rows[0].instagram_url,
      tiktokUrl: contactResult.rows[0].tiktok_url,
      websiteUrl: contactResult.rows[0].website_url,
      createdAt: contactResult.rows[0].created_at,
      updatedAt: contactResult.rows[0].updated_at
    } : null,
    locationSettings: locationResult.rows[0] ? {
      id: Number(locationResult.rows[0].id),
      addressLine1: locationResult.rows[0].address_line1,
      addressLine2: locationResult.rows[0].address_line2,
      district: locationResult.rows[0].district,
      province: locationResult.rows[0].province,
      postalCode: locationResult.rows[0].postal_code,
      country: locationResult.rows[0].country,
      googleMapUrl: locationResult.rows[0].google_map_url,
      googleMapEmbedUrl: locationResult.rows[0].google_map_embed_url,
      latitude: locationResult.rows[0].latitude ? Number(locationResult.rows[0].latitude) : null,
      longitude: locationResult.rows[0].longitude ? Number(locationResult.rows[0].longitude) : null,
      businessHoursJson: locationResult.rows[0].business_hours_json,
      createdAt: locationResult.rows[0].created_at,
      updatedAt: locationResult.rows[0].updated_at
    } : null,
    homepageSections: sectionsResult.rows.map(row => ({
      sectionKey: row.section_key,
      sectionType: row.section_type,
      title: row.title,
      subtitle: row.subtitle,
      sortOrder: row.sort_order,
      status: row.status
    }))
  };
}

/**
 * Create a default set of related website records inside a database transaction.
 */
async function createDefaultClinicWebsiteRecords(client, clinicId, payload = {}) {
  // Defensive check on website payload attributes
  const publicDisplayName = payload ? payload.publicDisplayName : null;
  const tagline = payload ? payload.tagline : null;
  const shortDescription = payload ? payload.shortDescription : null;

  // 1. clinic_website_settings
  await client.query(
    `
      insert into clinic_website_settings (clinic_id, website_status, public_display_name, tagline, short_description, default_locale)
      values ($1, 'draft', $2, $3, $4, 'th-TH')
      on conflict (clinic_id) do nothing
    `,
    [
      clinicId,
      publicDisplayName || null,
      tagline || null,
      shortDescription || null
    ]
  );

  // 2. clinic_branding_settings
  await client.query(
    `
      insert into clinic_branding_settings (clinic_id)
      values ($1)
      on conflict (clinic_id) do nothing
    `,
    [clinicId]
  );

  // 3. clinic_contact_settings
  await client.query(
    `
      insert into clinic_contact_settings (clinic_id)
      values ($1)
      on conflict (clinic_id) do nothing
    `,
    [clinicId]
  );

  // 4. clinic_location_settings
  await client.query(
    `
      insert into clinic_location_settings (clinic_id, country, business_hours_json)
      values ($1, 'Thailand', '{}'::jsonb)
      on conflict (clinic_id) do nothing
    `,
    [clinicId]
  );

  // 5. clinic_homepage_sections
  const defaultSections = [
    { key: 'hero', type: 'hero', title: 'Welcome to our Clinic', subtitle: 'Best beauty treatment' },
    { key: 'trust_badges', type: 'trust_badges', title: 'Why Choose Us', subtitle: 'Certified professionals' },
    { key: 'services_preview', type: 'services_preview', title: 'Our Services', subtitle: 'Premium treatments' },
    { key: 'promotions_preview', type: 'promotions_preview', title: 'Special Offers', subtitle: 'Limited time promotions' },
    { key: 'location', type: 'location', title: 'Our Location', subtitle: 'Find us here' },
    { key: 'final_cta', type: 'final_cta', title: 'Book an Appointment', subtitle: 'Contact us today' }
  ];

  for (let index = 0; index < defaultSections.length; index++) {
    const sec = defaultSections[index];
    await client.query(
      `
        insert into clinic_homepage_sections (clinic_id, section_key, section_type, title, subtitle, sort_order, status, content_json)
        values ($1, $2, $3, $4, $5, $6, 'draft', '{}'::jsonb)
        on conflict (clinic_id, section_key) do nothing
      `,
      [clinicId, sec.key, sec.type, sec.title, sec.subtitle, index + 1]
    );
  }
}

/**
 * Provision a new clinic.
 */
async function createClinic(context, payload) {
  await assertPlatformClinicManageAccess(context);

  // Defensive check on empty/null/undefined payload
  if (!payload) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Request payload is required.');
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Clinic name is required.');
  }

  let slug = payload.slug;
  if (slug === undefined || slug === null || (typeof slug === 'string' && slug.trim() === '')) {
    slug = normalizeClinicSlug(name);
  } else {
    slug = normalizeClinicSlug(slug);
  }

  assertValidClinicSlug(slug);

  const plan = typeof payload.plan === 'string' ? payload.plan.trim() : 'starter';
  const allowedPlans = ['starter', 'pro', 'premium', 'enterprise'];
  if (!allowedPlans.includes(plan)) {
    throw new AppError(400, 'INVALID_CLINIC_PLAN', 'Clinic plan is invalid.');
  }

  const status = typeof payload.status === 'string' ? payload.status.trim() : 'active';
  if (status !== 'active' && status !== 'inactive') {
    throw new AppError(400, 'INVALID_CLINIC_STATUS', 'Clinic status must be active or inactive.');
  }

  const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : 'Asia/Bangkok';
  if (!timezone) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Timezone must be a non-empty string.');
  }

  const pool = getPool();
  
  // Check if slug conflicts
  const slugCheck = await pool.query('select 1 from clinics where slug = $1 limit 1', [slug]);
  if (slugCheck.rowCount > 0) {
    throw new AppError(409, 'CLINIC_SLUG_CONFLICT', 'Clinic slug is already in use.');
  }

  const client = await pool.connect();
  await client.query('begin');

  try {
    const clinicResult = await client.query(
      `
        insert into clinics (name, slug, plan, status, timezone)
        values ($1, $2, $3, $4, $5)
        returning id, name, slug, plan, status, timezone, created_at, updated_at
      `,
      [name, slug, plan, status, timezone]
    );

    const clinic = clinicResult.rows[0];

    // Create default website records
    await createDefaultClinicWebsiteRecords(client, clinic.id, {
      publicDisplayName: name,
      tagline: payload.tagline || null,
      shortDescription: payload.shortDescription || null
    });

    await recordAuditLog(
      {
        clinicId: Number(clinic.id),
        entityType: 'clinic',
        entityId: Number(clinic.id),
        actionType: 'clinic.created',
        actorUserId: context.currentUser?.id || null,
        contextJson: {
          clinicId: Number(clinic.id),
          slug: clinic.slug,
          source: 'super_admin_clinic_api'
        }
      },
      client
    );

    await client.query('commit');

    return {
      id: Number(clinic.id),
      name: clinic.name,
      slug: clinic.slug,
      plan: clinic.plan,
      status: clinic.status,
      timezone: clinic.timezone,
      createdAt: clinic.created_at,
      updatedAt: clinic.updated_at
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Partially update a clinic configuration.
 */
async function updateClinic(context, clinicId, payload) {
  await assertPlatformClinicManageAccess(context);

  const parsedId = Number.parseInt(clinicId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Clinic ID must be a positive integer.');
  }

  // Defensive check on payload
  if (!payload) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Request payload is required.');
  }

  const pool = getPool();
  const clinicResult = await pool.query('select * from clinics where id = $1 limit 1', [parsedId]);
  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }
  const existingClinic = clinicResult.rows[0];

  const client = await pool.connect();
  await client.query('begin');

  try {
    const changedFields = [];
    const clinicUpdates = {};

    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Clinic name cannot be empty.');
      }
      if (name !== existingClinic.name) {
        clinicUpdates.name = name;
        changedFields.push('name');
      }
    }

    if (payload.slug !== undefined) {
      const slug = normalizeClinicSlug(payload.slug);
      assertValidClinicSlug(slug);

      if (slug !== existingClinic.slug) {
        const slugCheck = await client.query('select 1 from clinics where slug = $1 and id <> $2 limit 1', [slug, parsedId]);
        if (slugCheck.rowCount > 0) {
          throw new AppError(409, 'CLINIC_SLUG_CONFLICT', 'Clinic slug is already in use.');
        }
        clinicUpdates.slug = slug;
        changedFields.push('slug');
      }
    }

    if (payload.plan !== undefined) {
      const plan = typeof payload.plan === 'string' ? payload.plan.trim() : '';
      const allowedPlans = ['starter', 'pro', 'premium', 'enterprise'];
      if (!allowedPlans.includes(plan)) {
        throw new AppError(400, 'INVALID_CLINIC_PLAN', 'Clinic plan is invalid.');
      }
      if (plan !== existingClinic.plan) {
        clinicUpdates.plan = plan;
        changedFields.push('plan');
      }
    }

    if (payload.timezone !== undefined) {
      const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : '';
      if (!timezone) {
        throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Timezone cannot be empty.');
      }
      if (timezone !== existingClinic.timezone) {
        clinicUpdates.timezone = timezone;
        changedFields.push('timezone');
      }
    }

    // Perform clinic update if there are changes
    if (Object.keys(clinicUpdates).length > 0) {
      const keys = Object.keys(clinicUpdates);
      const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
      const values = keys.map(key => clinicUpdates[key]);
      await client.query(
        `update clinics set ${setClause}, updated_at = now() where id = $1`,
        [parsedId, ...values]
      );
    }

    // Update website settings if payload has website settings fields
    const websiteUpdates = {};
    if (payload.publicDisplayName !== undefined) {
      websiteUpdates.public_display_name = typeof payload.publicDisplayName === 'string' ? payload.publicDisplayName.trim() : null;
      changedFields.push('publicDisplayName');
    }
    if (payload.tagline !== undefined) {
      websiteUpdates.tagline = typeof payload.tagline === 'string' ? payload.tagline.trim() : null;
      changedFields.push('tagline');
    }
    if (payload.shortDescription !== undefined) {
      websiteUpdates.short_description = typeof payload.shortDescription === 'string' ? payload.shortDescription.trim() : null;
      changedFields.push('shortDescription');
    }

    if (Object.keys(websiteUpdates).length > 0) {
      const keys = Object.keys(websiteUpdates);
      const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
      const values = keys.map(key => websiteUpdates[key]);
      
      await client.query(
        `update clinic_website_settings set ${setClause}, updated_at = now() where clinic_id = $1`,
        [parsedId, ...values]
      );
    }

    if (changedFields.length > 0) {
      await recordAuditLog(
        {
          clinicId: parsedId,
          entityType: 'clinic',
          entityId: parsedId,
          actionType: 'clinic.updated',
          actorUserId: context.currentUser?.id || null,
          contextJson: {
            clinicId: parsedId,
            changedFields,
            source: 'super_admin_clinic_api'
          }
        },
        client
      );
    }

    await client.query('commit');

    const updatedClinicResult = await pool.query('select * from clinics where id = $1 limit 1', [parsedId]);
    const updatedClinic = updatedClinicResult.rows[0];

    return {
      id: Number(updatedClinic.id),
      name: updatedClinic.name,
      slug: updatedClinic.slug,
      plan: updatedClinic.plan,
      status: updatedClinic.status,
      timezone: updatedClinic.timezone,
      createdAt: updatedClinic.created_at,
      updatedAt: updatedClinic.updated_at
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Toggle active status of a clinic.
 */
async function updateClinicStatus(context, clinicId, payload) {
  await assertPlatformClinicManageAccess(context);

  const parsedId = Number.parseInt(clinicId, 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new AppError(400, 'INVALID_CLINIC_PAYLOAD', 'Clinic ID must be a positive integer.');
  }

  const status = typeof payload?.status === 'string' ? payload.status.trim() : '';
  if (status !== 'active' && status !== 'inactive') {
    throw new AppError(400, 'INVALID_CLINIC_STATUS', 'Clinic status must be active or inactive.');
  }

  const pool = getPool();
  const clinicResult = await pool.query('select * from clinics where id = $1 limit 1', [parsedId]);
  if (clinicResult.rowCount === 0) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }
  const existingClinic = clinicResult.rows[0];

  if (existingClinic.status === status) {
    return {
      id: Number(existingClinic.id),
      name: existingClinic.name,
      slug: existingClinic.slug,
      plan: existingClinic.plan,
      status: existingClinic.status,
      timezone: existingClinic.timezone,
      createdAt: existingClinic.created_at,
      updatedAt: existingClinic.updated_at
    };
  }

  const client = await pool.connect();
  await client.query('begin');

  try {
    await client.query(
      'update clinics set status = $1, updated_at = now() where id = $2',
      [status, parsedId]
    );

    if (status === 'inactive') {
      await client.query(
        "update clinic_website_settings set website_status = 'inactive', updated_at = now() where clinic_id = $1",
        [parsedId]
      );
    }

    await recordAuditLog(
      {
        clinicId: parsedId,
        entityType: 'clinic',
        entityId: parsedId,
        actionType: 'clinic.status_changed',
        actorUserId: context.currentUser?.id || null,
        contextJson: {
          clinicId: parsedId,
          statusBefore: existingClinic.status,
          statusAfter: status,
          source: 'super_admin_clinic_api'
        }
      },
      client
    );

    await client.query('commit');

    const updatedClinicResult = await pool.query('select * from clinics where id = $1 limit 1', [parsedId]);
    const updatedClinic = updatedClinicResult.rows[0];

    return {
      id: Number(updatedClinic.id),
      name: updatedClinic.name,
      slug: updatedClinic.slug,
      plan: updatedClinic.plan,
      status: updatedClinic.status,
      timezone: updatedClinic.timezone,
      createdAt: updatedClinic.created_at,
      updatedAt: updatedClinic.updated_at
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listClinics,
  getClinicDetail,
  createClinic,
  updateClinic,
  updateClinicStatus,
  createDefaultClinicWebsiteRecords,
  assertPlatformClinicManageAccess
};
