'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['draft', 'active', 'inactive', 'archived'];

function isValidStatus(val) {
  return typeof val === 'string' && VALID_STATUSES.includes(val);
}

function isSafeUrl(val) {
  if (!val) return true;
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function validateSafeUrl(url, fieldName) {
  if (!url) return;
  if (!isSafeUrl(url)) {
    throw new AppError(400, 'INVALID_OFFERING_URL', `${fieldName} must be a safe http or https URL.`);
  }
}

function validateMetadata(meta, fieldName) {
  if (meta === undefined || meta === null) return;
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    throw new AppError(400, 'INVALID_OFFERING_METADATA', `${fieldName} must be a JSON object.`);
  }
}

/**
 * Convert a name/title to a URL-safe kebab-case slug.
 * Falls back to a timestamp if result is empty.
 */
function toSlug(text) {
  if (typeof text !== 'string') return `item-${Date.now()}`;
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `item-${Date.now()}`;
}

/**
 * Convert a name/title to a snake_case key.
 */
function toKey(text) {
  if (typeof text !== 'string') return `item_${Date.now()}`;
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || `item_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeService(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    serviceKey: row.service_key,
    name: row.name,
    slug: row.slug,
    category: row.category || null,
    shortDescription: row.short_description || null,
    description: row.description || null,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    priceMin: row.price_min != null ? Number(row.price_min) : null,
    priceMax: row.price_max != null ? Number(row.price_max) : null,
    currency: row.currency || 'THB',
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializePromotion(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    promotionKey: row.promotion_key,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle || null,
    description: row.description || null,
    badgeLabel: row.badge_label || null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null,
    ctaLabel: row.cta_label || null,
    ctaUrl: row.cta_url || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializePackage(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clinicId: Number(row.clinic_id),
    packageKey: row.package_key,
    name: row.name,
    slug: row.slug,
    summary: row.summary || null,
    description: row.description || null,
    price: row.price != null ? Number(row.price) : null,
    currency: row.currency || 'THB',
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ---------------------------------------------------------------------------
// Tenant guard helpers
// ---------------------------------------------------------------------------

/**
 * Verify a row belongs to clinicId. Throws 404 or 403 on failure.
 */
function assertSameClinic(row, clinicId, entityLabel) {
  if (!row) {
    throw new AppError(404, `${entityLabel.toUpperCase()}_NOT_FOUND`, `${entityLabel} not found.`);
  }
  if (String(row.clinic_id) !== String(clinicId)) {
    throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', `You do not have permission to access this ${entityLabel}.`);
  }
}

// ---------------------------------------------------------------------------
// SERVICES – Admin CRUD
// ---------------------------------------------------------------------------

async function listServices(clinicId, queryParams) {
  const pool = getPool();
  const status = queryParams?.get?.('status') || null;

  let sql = `
    select * from clinic_services
    where clinic_id = $1
  `;
  const params = [clinicId];

  if (status) {
    params.push(status);
    sql += ` and status = $${params.length}`;
  }

  sql += ' order by sort_order asc, id asc';

  const result = await pool.query(sql, params);
  return result.rows.map(serializeService);
}

async function createService(clinicId, actorUserId, body) {
  const pool = getPool();

  const name = typeof body.name === 'string' ? body.name.trim() : null;
  if (!name) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'name is required for a service.');
  }

  const serviceKey = typeof body.serviceKey === 'string' && body.serviceKey.trim()
    ? toKey(body.serviceKey)
    : toKey(name);

  const slug = typeof body.slug === 'string' && body.slug.trim()
    ? toSlug(body.slug)
    : toSlug(name);

  const status = body.status !== undefined ? body.status : 'draft';
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl || null;
  validateSafeUrl(imageUrl, 'imageUrl');

  const metadata = body.metadata !== undefined ? body.metadata : {};
  validateMetadata(metadata, 'metadata');

  const priceMin = body.priceMin != null ? Number(body.priceMin) : null;
  const priceMax = body.priceMax != null ? Number(body.priceMax) : null;

  if (priceMin != null && (isNaN(priceMin) || priceMin < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMin must be a non-negative number.');
  }
  if (priceMax != null && (isNaN(priceMax) || priceMax < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMax must be a non-negative number.');
  }
  if (priceMin != null && priceMax != null && priceMax < priceMin) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMax must be >= priceMin.');
  }

  const durationMinutes = body.durationMinutes != null ? Number(body.durationMinutes) : null;
  if (durationMinutes != null && (isNaN(durationMinutes) || durationMinutes < 0 || !Number.isInteger(durationMinutes))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'durationMinutes must be a non-negative integer.');
  }

  const isFeatured = body.isFeatured !== undefined ? Boolean(body.isFeatured) : false;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;

  const result = await pool.query(
    `insert into clinic_services (
       clinic_id, service_key, name, slug, category, short_description, description,
       duration_minutes, price_min, price_max, currency, status, is_featured, sort_order,
       image_url, metadata_json, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,now(),now())
     returning *`,
    [
      clinicId,
      serviceKey,
      name,
      slug,
      body.category || null,
      body.shortDescription || null,
      body.description || null,
      durationMinutes,
      priceMin,
      priceMax,
      body.currency || 'THB',
      status,
      isFeatured,
      sortOrder,
      imageUrl,
      JSON.stringify(metadata)
    ]
  );

  const created = serializeService(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_service',
    entityId: created.id,
    actionType: 'clinic_service.created',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'service',
        entityId: created.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return created;
}

async function getService(clinicId, serviceId) {
  const pool = getPool();
  const result = await pool.query('select * from clinic_services where id = $1 limit 1', [serviceId]);
  const row = result.rows[0] || null;
  assertSameClinic(row, clinicId, 'SERVICE');
  return serializeService(row);
}

async function updateService(clinicId, actorUserId, serviceId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_services where id = $1 limit 1', [serviceId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'SERVICE');

  const name = body.name !== undefined
    ? (typeof body.name === 'string' ? body.name.trim() : null)
    : existing.name;

  if (!name) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'name is required for a service.');
  }

  const status = body.status !== undefined ? body.status : existing.status;
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl !== undefined ? body.imageUrl : existing.image_url;
  validateSafeUrl(imageUrl, 'imageUrl');

  const metadata = body.metadata !== undefined ? body.metadata : existing.metadata_json;
  validateMetadata(metadata, 'metadata');

  const priceMin = body.priceMin !== undefined ? (body.priceMin != null ? Number(body.priceMin) : null) : (existing.price_min != null ? Number(existing.price_min) : null);
  const priceMax = body.priceMax !== undefined ? (body.priceMax != null ? Number(body.priceMax) : null) : (existing.price_max != null ? Number(existing.price_max) : null);

  if (priceMin != null && (isNaN(priceMin) || priceMin < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMin must be a non-negative number.');
  }
  if (priceMax != null && (isNaN(priceMax) || priceMax < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMax must be a non-negative number.');
  }
  if (priceMin != null && priceMax != null && priceMax < priceMin) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'priceMax must be >= priceMin.');
  }

  const durationMinutes = body.durationMinutes !== undefined
    ? (body.durationMinutes != null ? Number(body.durationMinutes) : null)
    : (existing.duration_minutes != null ? Number(existing.duration_minutes) : null);

  if (durationMinutes != null && (isNaN(durationMinutes) || durationMinutes < 0 || !Number.isInteger(durationMinutes))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'durationMinutes must be a non-negative integer.');
  }

  const result = await pool.query(
    `update clinic_services set
       name = $1, category = $2, short_description = $3, description = $4,
       duration_minutes = $5, price_min = $6, price_max = $7, currency = $8,
       status = $9, is_featured = $10, sort_order = $11, image_url = $12,
       metadata_json = $13::jsonb, updated_at = now()
     where id = $14
     returning *`,
    [
      name,
      body.category !== undefined ? body.category : existing.category,
      body.shortDescription !== undefined ? body.shortDescription : existing.short_description,
      body.description !== undefined ? body.description : existing.description,
      durationMinutes,
      priceMin,
      priceMax,
      body.currency !== undefined ? body.currency : existing.currency,
      status,
      body.isFeatured !== undefined ? Boolean(body.isFeatured) : existing.is_featured,
      body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order,
      imageUrl,
      JSON.stringify(metadata),
      serviceId
    ]
  );

  const updated = serializeService(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_service',
    entityId: updated.id,
    actionType: 'clinic_service.updated',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'service',
        entityId: updated.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return updated;
}

async function deleteService(clinicId, actorUserId, serviceId) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_services where id = $1 limit 1', [serviceId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'SERVICE');

  await pool.query('delete from clinic_services where id = $1', [serviceId]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_service',
    entityId: Number(serviceId),
    actionType: 'clinic_service.deleted',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'service',
        entityId: Number(serviceId),
        changedFields: ['deleted'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

async function reorderServices(clinicId, actorUserId, body) {
  const pool = getPool();
  const items = body.items;

  if (!Array.isArray(items)) {
    throw new AppError(400, 'INVALID_REORDER_PAYLOAD', 'items must be an array of { id, sortOrder }.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      if (item.id == null || item.sortOrder == null) {
        throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must have id and sortOrder.');
      }

      const updateRes = await client.query(
        'update clinic_services set sort_order = $1, updated_at = now() where id = $2 and clinic_id = $3',
        [Number(item.sortOrder), Number(item.id), clinicId]
      );

      if (updateRes.rowCount !== 1) {
        const existsCheck = await client.query('select clinic_id from clinic_services where id = $1 limit 1', [Number(item.id)]);
        if (existsCheck.rowCount === 0) {
          throw new AppError(404, 'SERVICE_NOT_FOUND', `Service with ID ${item.id} not found.`);
        } else {
          throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', `You do not have permission to access Service with ID ${item.id}.`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_service',
    entityId: clinicId,
    actionType: 'clinic_services.reordered',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'service',
        changedFields: ['reordered'],
        reorderedItems: (items || []).map(s => ({ id: s.id, sortOrder: s.sortOrder })),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// PROMOTIONS – Admin CRUD
// ---------------------------------------------------------------------------

async function listPromotions(clinicId, queryParams) {
  const pool = getPool();
  const status = queryParams?.get?.('status') || null;

  let sql = `select * from clinic_promotions where clinic_id = $1`;
  const params = [clinicId];

  if (status) {
    params.push(status);
    sql += ` and status = $${params.length}`;
  }

  sql += ' order by sort_order asc, id asc';

  const result = await pool.query(sql, params);
  return result.rows.map(serializePromotion);
}

async function createPromotion(clinicId, actorUserId, body) {
  const pool = getPool();

  const title = typeof body.title === 'string' ? body.title.trim() : null;
  if (!title) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'title is required for a promotion.');
  }

  const promotionKey = typeof body.promotionKey === 'string' && body.promotionKey.trim()
    ? toKey(body.promotionKey)
    : toKey(title);

  const slug = typeof body.slug === 'string' && body.slug.trim()
    ? toSlug(body.slug)
    : toSlug(title);

  const status = body.status !== undefined ? body.status : 'draft';
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl || null;
  validateSafeUrl(imageUrl, 'imageUrl');
  const ctaUrl = body.ctaUrl || null;
  validateSafeUrl(ctaUrl, 'ctaUrl');

  const metadata = body.metadata !== undefined ? body.metadata : {};
  validateMetadata(metadata, 'metadata');

  // Date validation
  const startsAt = body.startsAt || null;
  const endsAt = body.endsAt || null;

  if (startsAt && isNaN(Date.parse(startsAt))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'startsAt must be a valid date.');
  }
  if (endsAt && isNaN(Date.parse(endsAt))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'endsAt must be a valid date.');
  }
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'endsAt must be >= startsAt.');
  }

  const isFeatured = body.isFeatured !== undefined ? Boolean(body.isFeatured) : false;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;

  const result = await pool.query(
    `insert into clinic_promotions (
       clinic_id, promotion_key, title, slug, subtitle, description, badge_label,
       starts_at, ends_at, status, is_featured, sort_order, image_url, cta_label, cta_url,
       metadata_json, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,now(),now())
     returning *`,
    [
      clinicId,
      promotionKey,
      title,
      slug,
      body.subtitle || null,
      body.description || null,
      body.badgeLabel || null,
      startsAt,
      endsAt,
      status,
      isFeatured,
      sortOrder,
      imageUrl,
      body.ctaLabel || null,
      ctaUrl,
      JSON.stringify(metadata)
    ]
  );

  const created = serializePromotion(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_promotion',
    entityId: created.id,
    actionType: 'clinic_promotion.created',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'promotion',
        entityId: created.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return created;
}

async function getPromotion(clinicId, promotionId) {
  const pool = getPool();
  const result = await pool.query('select * from clinic_promotions where id = $1 limit 1', [promotionId]);
  const row = result.rows[0] || null;
  assertSameClinic(row, clinicId, 'PROMOTION');
  return serializePromotion(row);
}

async function updatePromotion(clinicId, actorUserId, promotionId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_promotions where id = $1 limit 1', [promotionId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'PROMOTION');

  const title = body.title !== undefined
    ? (typeof body.title === 'string' ? body.title.trim() : null)
    : existing.title;

  if (!title) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'title is required for a promotion.');
  }

  const status = body.status !== undefined ? body.status : existing.status;
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl !== undefined ? body.imageUrl : existing.image_url;
  validateSafeUrl(imageUrl, 'imageUrl');
  const ctaUrl = body.ctaUrl !== undefined ? body.ctaUrl : existing.cta_url;
  validateSafeUrl(ctaUrl, 'ctaUrl');

  const metadata = body.metadata !== undefined ? body.metadata : existing.metadata_json;
  validateMetadata(metadata, 'metadata');

  const startsAt = body.startsAt !== undefined ? (body.startsAt || null) : existing.starts_at;
  const endsAt = body.endsAt !== undefined ? (body.endsAt || null) : existing.ends_at;

  if (startsAt && isNaN(Date.parse(startsAt))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'startsAt must be a valid date.');
  }
  if (endsAt && isNaN(Date.parse(endsAt))) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'endsAt must be a valid date.');
  }
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'endsAt must be >= startsAt.');
  }

  const result = await pool.query(
    `update clinic_promotions set
       title = $1, subtitle = $2, description = $3, badge_label = $4,
       starts_at = $5, ends_at = $6, status = $7, is_featured = $8, sort_order = $9,
       image_url = $10, cta_label = $11, cta_url = $12, metadata_json = $13::jsonb,
       updated_at = now()
     where id = $14
     returning *`,
    [
      title,
      body.subtitle !== undefined ? body.subtitle : existing.subtitle,
      body.description !== undefined ? body.description : existing.description,
      body.badgeLabel !== undefined ? body.badgeLabel : existing.badge_label,
      startsAt,
      endsAt,
      status,
      body.isFeatured !== undefined ? Boolean(body.isFeatured) : existing.is_featured,
      body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order,
      imageUrl,
      body.ctaLabel !== undefined ? body.ctaLabel : existing.cta_label,
      ctaUrl,
      JSON.stringify(metadata),
      promotionId
    ]
  );

  const updated = serializePromotion(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_promotion',
    entityId: updated.id,
    actionType: 'clinic_promotion.updated',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'promotion',
        entityId: updated.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return updated;
}

async function deletePromotion(clinicId, actorUserId, promotionId) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_promotions where id = $1 limit 1', [promotionId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'PROMOTION');

  await pool.query('delete from clinic_promotions where id = $1', [promotionId]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_promotion',
    entityId: Number(promotionId),
    actionType: 'clinic_promotion.deleted',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'promotion',
        entityId: Number(promotionId),
        changedFields: ['deleted'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

async function reorderPromotions(clinicId, actorUserId, body) {
  const pool = getPool();
  const items = body.items;

  if (!Array.isArray(items)) {
    throw new AppError(400, 'INVALID_REORDER_PAYLOAD', 'items must be an array of { id, sortOrder }.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      if (item.id == null || item.sortOrder == null) {
        throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must have id and sortOrder.');
      }

      const updateRes = await client.query(
        'update clinic_promotions set sort_order = $1, updated_at = now() where id = $2 and clinic_id = $3',
        [Number(item.sortOrder), Number(item.id), clinicId]
      );

      if (updateRes.rowCount !== 1) {
        const existsCheck = await client.query('select clinic_id from clinic_promotions where id = $1 limit 1', [Number(item.id)]);
        if (existsCheck.rowCount === 0) {
          throw new AppError(404, 'PROMOTION_NOT_FOUND', `Promotion with ID ${item.id} not found.`);
        } else {
          throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', `You do not have permission to access Promotion with ID ${item.id}.`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_promotion',
    entityId: clinicId,
    actionType: 'clinic_promotions.reordered',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'promotion',
        changedFields: ['reordered'],
        reorderedItems: (items || []).map(s => ({ id: s.id, sortOrder: s.sortOrder })),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// PACKAGES – Admin CRUD
// ---------------------------------------------------------------------------

async function listPackages(clinicId, queryParams) {
  const pool = getPool();
  const status = queryParams?.get?.('status') || null;

  let sql = `select * from clinic_packages where clinic_id = $1`;
  const params = [clinicId];

  if (status) {
    params.push(status);
    sql += ` and status = $${params.length}`;
  }

  sql += ' order by sort_order asc, id asc';

  const result = await pool.query(sql, params);
  return result.rows.map(serializePackage);
}

async function createPackage(clinicId, actorUserId, body) {
  const pool = getPool();

  const name = typeof body.name === 'string' ? body.name.trim() : null;
  if (!name) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'name is required for a package.');
  }

  const packageKey = typeof body.packageKey === 'string' && body.packageKey.trim()
    ? toKey(body.packageKey)
    : toKey(name);

  const slug = typeof body.slug === 'string' && body.slug.trim()
    ? toSlug(body.slug)
    : toSlug(name);

  const status = body.status !== undefined ? body.status : 'draft';
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl || null;
  validateSafeUrl(imageUrl, 'imageUrl');

  const metadata = body.metadata !== undefined ? body.metadata : {};
  validateMetadata(metadata, 'metadata');

  const price = body.price != null ? Number(body.price) : null;
  if (price != null && (isNaN(price) || price < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'price must be a non-negative number.');
  }

  const isFeatured = body.isFeatured !== undefined ? Boolean(body.isFeatured) : false;
  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;

  const result = await pool.query(
    `insert into clinic_packages (
       clinic_id, package_key, name, slug, summary, description, price, currency,
       status, is_featured, sort_order, image_url, metadata_json, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now(),now())
     returning *`,
    [
      clinicId,
      packageKey,
      name,
      slug,
      body.summary || null,
      body.description || null,
      price,
      body.currency || 'THB',
      status,
      isFeatured,
      sortOrder,
      imageUrl,
      JSON.stringify(metadata)
    ]
  );

  const created = serializePackage(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: created.id,
    actionType: 'clinic_package.created',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: created.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return created;
}

async function getPackage(clinicId, packageId) {
  const pool = getPool();
  const result = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const row = result.rows[0] || null;
  assertSameClinic(row, clinicId, 'PACKAGE');
  return serializePackage(row);
}

async function updatePackage(clinicId, actorUserId, packageId, body) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'PACKAGE');

  const name = body.name !== undefined
    ? (typeof body.name === 'string' ? body.name.trim() : null)
    : existing.name;

  if (!name) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'name is required for a package.');
  }

  const status = body.status !== undefined ? body.status : existing.status;
  if (!isValidStatus(status)) {
    throw new AppError(400, 'INVALID_OFFERING_STATUS', `Invalid status: ${status}`);
  }

  const imageUrl = body.imageUrl !== undefined ? body.imageUrl : existing.image_url;
  validateSafeUrl(imageUrl, 'imageUrl');

  const metadata = body.metadata !== undefined ? body.metadata : existing.metadata_json;
  validateMetadata(metadata, 'metadata');

  const price = body.price !== undefined
    ? (body.price != null ? Number(body.price) : null)
    : (existing.price != null ? Number(existing.price) : null);

  if (price != null && (isNaN(price) || price < 0)) {
    throw new AppError(400, 'INVALID_PRICE_RANGE', 'price must be a non-negative number.');
  }

  const result = await pool.query(
    `update clinic_packages set
       name = $1, summary = $2, description = $3, price = $4, currency = $5,
       status = $6, is_featured = $7, sort_order = $8, image_url = $9,
       metadata_json = $10::jsonb, updated_at = now()
     where id = $11
     returning *`,
    [
      name,
      body.summary !== undefined ? body.summary : existing.summary,
      body.description !== undefined ? body.description : existing.description,
      price,
      body.currency !== undefined ? body.currency : existing.currency,
      status,
      body.isFeatured !== undefined ? Boolean(body.isFeatured) : existing.is_featured,
      body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order,
      imageUrl,
      JSON.stringify(metadata),
      packageId
    ]
  );

  const updated = serializePackage(result.rows[0]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: updated.id,
    actionType: 'clinic_package.updated',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: updated.id,
        changedFields: Object.keys(body),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return updated;
}

async function deletePackage(clinicId, actorUserId, packageId) {
  const pool = getPool();

  const existingRes = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const existing = existingRes.rows[0] || null;
  assertSameClinic(existing, clinicId, 'PACKAGE');

  await pool.query('delete from clinic_packages where id = $1', [packageId]);

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: Number(packageId),
    actionType: 'clinic_package.deleted',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: Number(packageId),
        changedFields: ['deleted'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

async function reorderPackages(clinicId, actorUserId, body) {
  const pool = getPool();
  const items = body.items;

  if (!Array.isArray(items)) {
    throw new AppError(400, 'INVALID_REORDER_PAYLOAD', 'items must be an array of { id, sortOrder }.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      if (item.id == null || item.sortOrder == null) {
        throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must have id and sortOrder.');
      }

      const updateRes = await client.query(
        'update clinic_packages set sort_order = $1, updated_at = now() where id = $2 and clinic_id = $3',
        [Number(item.sortOrder), Number(item.id), clinicId]
      );

      if (updateRes.rowCount !== 1) {
        const existsCheck = await client.query('select clinic_id from clinic_packages where id = $1 limit 1', [Number(item.id)]);
        if (existsCheck.rowCount === 0) {
          throw new AppError(404, 'PACKAGE_NOT_FOUND', `Package with ID ${item.id} not found.`);
        } else {
          throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', `You do not have permission to access Package with ID ${item.id}.`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: clinicId,
    actionType: 'clinic_packages.reordered',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        changedFields: ['reordered'],
        reorderedItems: (items || []).map(s => ({ id: s.id, sortOrder: s.sortOrder })),
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// PACKAGE-SERVICE LINKS
// ---------------------------------------------------------------------------

async function addServiceToPackage(clinicId, actorUserId, packageId, body) {
  const pool = getPool();

  // Verify package belongs to this clinic
  const pkgRes = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const pkg = pkgRes.rows[0] || null;
  assertSameClinic(pkg, clinicId, 'PACKAGE');

  const serviceId = body.serviceId;
  if (!serviceId) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'serviceId is required.');
  }

  // Verify service belongs to same clinic (cross-tenant safety)
  const svcRes = await pool.query('select * from clinic_services where id = $1 limit 1', [serviceId]);
  const svc = svcRes.rows[0] || null;

  if (!svc) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service not found.');
  }
  if (String(svc.clinic_id) !== String(clinicId)) {
    throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', 'Service does not belong to this clinic.');
  }

  const quantity = body.quantity != null ? Number(body.quantity) : 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_OFFERING_PAYLOAD', 'quantity must be a positive integer.');
  }

  const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0;

  const result = await pool.query(
    `insert into clinic_package_services (clinic_id, package_id, service_id, quantity, sort_order)
     values ($1, $2, $3, $4, $5)
     on conflict (clinic_id, package_id, service_id) do update
       set quantity = excluded.quantity, sort_order = excluded.sort_order
     returning *`,
    [clinicId, packageId, serviceId, quantity, sortOrder]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: Number(packageId),
    actionType: 'clinic_package_service.added',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: Number(packageId),
        changedFields: ['serviceId', 'quantity'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return {
    id: Number(result.rows[0].id),
    packageId: Number(packageId),
    serviceId: Number(serviceId),
    quantity,
    sortOrder: Number(result.rows[0].sort_order)
  };
}

async function removeServiceFromPackage(clinicId, actorUserId, packageId, serviceId) {
  const pool = getPool();

  // Verify package belongs to this clinic
  const pkgRes = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const pkg = pkgRes.rows[0] || null;
  assertSameClinic(pkg, clinicId, 'PACKAGE');

  const linkRes = await pool.query(
    'select id from clinic_package_services where package_id = $1 and service_id = $2 and clinic_id = $3 limit 1',
    [packageId, serviceId, clinicId]
  );

  if (linkRes.rowCount === 0) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service link not found in this package.');
  }

  await pool.query(
    'delete from clinic_package_services where package_id = $1 and service_id = $2 and clinic_id = $3',
    [packageId, serviceId, clinicId]
  );

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: Number(packageId),
    actionType: 'clinic_package_service.removed',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: Number(packageId),
        changedFields: ['serviceId'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

async function reorderPackageServices(clinicId, actorUserId, packageId, body) {
  const pool = getPool();
  const items = body.items;

  if (!Array.isArray(items)) {
    throw new AppError(400, 'INVALID_REORDER_PAYLOAD', 'items must be an array of { serviceId, sortOrder }.');
  }

  // Verify package belongs to this clinic
  const pkgRes = await pool.query('select * from clinic_packages where id = $1 limit 1', [packageId]);
  const pkg = pkgRes.rows[0] || null;
  assertSameClinic(pkg, clinicId, 'PACKAGE');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      if (item.serviceId == null || item.sortOrder == null) {
        throw new AppError(400, 'INVALID_REORDER_ITEM', 'Each reorder item must have serviceId and sortOrder.');
      }

      const updateRes = await client.query(
        'update clinic_package_services set sort_order = $1 where package_id = $2 and service_id = $3 and clinic_id = $4',
        [Number(item.sortOrder), Number(packageId), Number(item.serviceId), clinicId]
      );

      if (updateRes.rowCount !== 1) {
        const existsCheck = await client.query(
          'select clinic_id from clinic_package_services where package_id = $1 and service_id = $2 limit 1',
          [Number(packageId), Number(item.serviceId)]
        );

        if (existsCheck.rowCount === 0) {
          throw new AppError(404, 'PACKAGE_SERVICE_NOT_FOUND', `Service link with ID ${item.serviceId} not found in this package.`);
        }

        throw new AppError(403, 'CROSS_TENANT_FORBIDDEN', `You do not have permission to reorder Service with ID ${item.serviceId} in this package.`);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recordAuditLog({
    clinicId,
    entityType: 'clinic_package',
    entityId: Number(packageId),
    actionType: 'clinic_package_services.reordered',
    actorUserId,
    contextJson: {
      summary: {
        entity: 'package',
        entityId: Number(packageId),
        changedFields: ['reordered'],
        source: 'clinic_offerings_admin_api'
      }
    }
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// PUBLIC API – Active offerings only, filtered by clinic slug
// ---------------------------------------------------------------------------

/**
 * Resolve an active clinic ID from slug.
 * Returns null if not found or not active (never 400 - always 404 for public).
 */
async function resolveActiveClinicIdBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;

  const pool = getPool();
  const normalized = slug.toLowerCase().trim();

  const result = await pool.query(
    'select id, status from clinics where slug = $1 limit 1',
    [normalized]
  );

  if (result.rowCount === 0) return null;
  const clinic = result.rows[0];
  if (clinic.status !== 'active') return null;
  return Number(clinic.id);
}

async function getPublicServices(slug) {
  const clinicId = await resolveActiveClinicIdBySlug(slug);
  if (!clinicId) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const pool = getPool();
  const result = await pool.query(
    `select id, service_key, name, slug, category, short_description,
            duration_minutes, price_min, price_max, currency,
            status, is_featured, sort_order, image_url
     from clinic_services
     where clinic_id = $1 and status = 'active'
     order by is_featured desc, sort_order asc, id asc`,
    [clinicId]
  );

  return result.rows.map(row => ({
    id: Number(row.id),
    serviceKey: row.service_key,
    name: row.name,
    slug: row.slug,
    category: row.category || null,
    shortDescription: row.short_description || null,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    priceMin: row.price_min != null ? Number(row.price_min) : null,
    priceMax: row.price_max != null ? Number(row.price_max) : null,
    currency: row.currency || 'THB',
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null
  }));
}

async function getPublicPromotions(slug) {
  const clinicId = await resolveActiveClinicIdBySlug(slug);
  if (!clinicId) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const pool = getPool();
  const result = await pool.query(
    `select id, promotion_key, title, slug, subtitle, badge_label,
            starts_at, ends_at, status, is_featured, sort_order, image_url,
            cta_label, cta_url
     from clinic_promotions
     where clinic_id = $1 and status = 'active'
     order by is_featured desc, sort_order asc, id asc`,
    [clinicId]
  );

  return result.rows.map(row => ({
    id: Number(row.id),
    promotionKey: row.promotion_key,
    title: row.title,
    slug: row.slug,
    subtitle: row.subtitle || null,
    badgeLabel: row.badge_label || null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null,
    ctaLabel: row.cta_label || null,
    ctaUrl: row.cta_url || null
  }));
}

async function getPublicPackages(slug) {
  const clinicId = await resolveActiveClinicIdBySlug(slug);
  if (!clinicId) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const pool = getPool();
  const result = await pool.query(
    `select id, package_key, name, slug, summary, price, currency,
            status, is_featured, sort_order, image_url
     from clinic_packages
     where clinic_id = $1 and status = 'active'
     order by is_featured desc, sort_order asc, id asc`,
    [clinicId]
  );

  return result.rows.map(row => ({
    id: Number(row.id),
    packageKey: row.package_key,
    name: row.name,
    slug: row.slug,
    summary: row.summary || null,
    price: row.price != null ? Number(row.price) : null,
    currency: row.currency || 'THB',
    isFeatured: Boolean(row.is_featured),
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || null
  }));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Services
  listServices,
  createService,
  getService,
  updateService,
  deleteService,
  reorderServices,

  // Promotions
  listPromotions,
  createPromotion,
  getPromotion,
  updatePromotion,
  deletePromotion,
  reorderPromotions,

  // Packages
  listPackages,
  createPackage,
  getPackage,
  updatePackage,
  deletePackage,
  reorderPackages,

  // Package-service links
  addServiceToPackage,
  removeServiceFromPackage,
  reorderPackageServices,

  // Public
  getPublicServices,
  getPublicPromotions,
  getPublicPackages
};
