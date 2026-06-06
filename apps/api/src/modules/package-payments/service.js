'use strict';

const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const { recordAuditLog } = require('../audit/service');

const VALID_PACKAGE_TYPES = new Set(['service_package', 'course', 'membership', 'credit_bundle']);
const VALID_PACKAGE_STATUSES = new Set(['active', 'inactive', 'archived']);
const VALID_OWNERSHIP_STATUSES = new Set(['pending', 'active', 'paused', 'expired', 'cancelled', 'used_up']);
const VALID_PAYMENT_STATUSES = new Set(['pending', 'recorded', 'voided', 'refunded']);
const VALID_PAYMENT_METHODS = new Set(['manual', 'bank_transfer_note', 'cash_note', 'other_note']);
const PACKAGE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const FORBIDDEN_PAYMENT_FIELDS = [
  'gatewayProvider',
  'gateway_provider',
  'provider',
  'checkoutUrl',
  'checkout_url',
  'checkoutSessionId',
  'checkout_session_id',
  'qrCode',
  'qr_code',
  'webhook',
  'externalTransactionId',
  'external_transaction_id',
  'stripe',
  'omise',
  'promptPay',
  'promptpay'
];

function trimString(value, maxLength, code = 'INVALID_REQUEST', fieldName = 'value') {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, code, `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AppError(400, code, `${fieldName} must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function assertPlainObject(value, code, fieldName) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, code, `${fieldName} must be a JSON object.`);
  }
  return value;
}

function rejectClinicOverride(body, code = 'INVALID_REQUEST') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, code, 'Request body must be a JSON object.');
  }
  if (body.clinicId !== undefined || body.clinic_id !== undefined) {
    throw new AppError(400, code, 'clinicId cannot be overridden for package/payment operations.');
  }
}

function rejectClinicOverrideQuery(searchParams, code = 'INVALID_QUERY') {
  if (searchParams.has('clinicId') || searchParams.has('clinic_id')) {
    throw new AppError(400, code, 'clinicId cannot be overridden in the query string.');
  }
}

function asPositiveInteger(value, fieldName, code = 'INVALID_QUERY') {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, code, `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function asNonNegativeInteger(value, fallback, fieldName, code = 'INVALID_QUERY') {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(400, code, `${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function normalizeOptionalPositiveInteger(value, fieldName, code) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, code, `${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function normalizeOptionalNonNegativeInteger(value, fieldName, code) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError(400, code, `${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function normalizeMoneyAmount(value, fieldName, code, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.required) {
      throw new AppError(400, code, `${fieldName} is required.`);
    }
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(400, code, `${fieldName} must be a non-negative number.`);
  }
  return parsed;
}

function normalizeCurrency(value, code = 'INVALID_PACKAGE_PAYLOAD') {
  const raw = value === undefined || value === null || value === '' ? 'THB' : String(value).trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(raw)) {
    throw new AppError(400, code, 'currency must be a 3-letter code.');
  }
  return raw;
}

function normalizeOptionalTimestamp(value, fieldName, code) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, code, `${fieldName} must be a valid date/time.`);
  }
  return parsed.toISOString();
}

function assertAdminContext(context) {
  if (!context?.currentClinic?.id) {
    throw new AppError(403, 'CLINIC_CONTEXT_REQUIRED', 'Clinic context is required.');
  }
}

function normalizePackageCode(value) {
  const packageCode = trimString(value, 80, 'INVALID_PACKAGE_PAYLOAD', 'packageCode');
  if (!packageCode || !PACKAGE_CODE_PATTERN.test(packageCode)) {
    throw new AppError(400, 'INVALID_PACKAGE_PAYLOAD', 'packageCode is invalid.');
  }
  return packageCode;
}

function normalizePackageName(value) {
  const packageName = trimString(value, 160, 'INVALID_PACKAGE_PAYLOAD', 'packageName');
  if (!packageName) {
    throw new AppError(400, 'INVALID_PACKAGE_PAYLOAD', 'packageName is required.');
  }
  return packageName;
}

function normalizePackageType(value, fallback = 'service_package') {
  const packageType = trimString(value === undefined ? fallback : value, 40, 'INVALID_PACKAGE_TYPE', 'packageType');
  if (!packageType || !VALID_PACKAGE_TYPES.has(packageType)) {
    throw new AppError(400, 'INVALID_PACKAGE_TYPE', 'packageType is invalid.');
  }
  return packageType;
}

function normalizePackageStatus(value, fallback = 'active') {
  const status = trimString(value === undefined ? fallback : value, 40, 'INVALID_PACKAGE_STATUS', 'status');
  if (!status || !VALID_PACKAGE_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_PACKAGE_STATUS', 'status is invalid.');
  }
  return status;
}

function normalizePaymentStatus(value, fallback = 'pending') {
  const status = trimString(value === undefined ? fallback : value, 40, 'INVALID_PAYMENT_STATUS', 'paymentStatus');
  if (!status || !VALID_PAYMENT_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_PAYMENT_STATUS', 'paymentStatus is invalid.');
  }
  return status;
}

function normalizePaymentMethod(value, fallback = 'manual') {
  const method = trimString(value === undefined ? fallback : value, 40, 'INVALID_PAYMENT_METHOD', 'paymentMethod');
  if (!method || !VALID_PAYMENT_METHODS.has(method)) {
    throw new AppError(400, 'INVALID_PAYMENT_METHOD', 'paymentMethod is invalid.');
  }
  return method;
}

function normalizePackageCreatePayload(body) {
  rejectClinicOverride(body, 'INVALID_PACKAGE_PAYLOAD');
  const metadata = assertPlainObject(body.metadataJson ?? body.metadata, 'INVALID_PACKAGE_PAYLOAD', 'metadataJson');
  return {
    packageCode: normalizePackageCode(body.packageCode ?? body.code),
    packageName: normalizePackageName(body.packageName ?? body.name),
    packageType: normalizePackageType(body.packageType ?? body.type),
    description: trimString(body.description, 2000, 'INVALID_PACKAGE_PAYLOAD', 'description'),
    totalUnits: normalizeOptionalPositiveInteger(body.totalUnits, 'totalUnits', 'INVALID_PACKAGE_PAYLOAD'),
    unitLabel: trimString(body.unitLabel, 40, 'INVALID_PACKAGE_PAYLOAD', 'unitLabel'),
    priceAmount: normalizeMoneyAmount(body.priceAmount ?? body.price, 'priceAmount', 'INVALID_PACKAGE_PAYLOAD'),
    currency: normalizeCurrency(body.currency, 'INVALID_PACKAGE_PAYLOAD'),
    status: normalizePackageStatus(body.status),
    metadata
  };
}

function normalizePackageUpdatePayload(body) {
  rejectClinicOverride(body, 'INVALID_PACKAGE_PAYLOAD');
  const normalized = {};

  if (body.packageName !== undefined || body.name !== undefined) {
    normalized.packageName = normalizePackageName(body.packageName ?? body.name);
  }
  if (body.packageType !== undefined || body.type !== undefined) {
    normalized.packageType = normalizePackageType(body.packageType ?? body.type);
  }
  if (body.description !== undefined) {
    normalized.description = trimString(body.description, 2000, 'INVALID_PACKAGE_PAYLOAD', 'description');
  }
  if (body.totalUnits !== undefined) {
    normalized.totalUnits = normalizeOptionalPositiveInteger(body.totalUnits, 'totalUnits', 'INVALID_PACKAGE_PAYLOAD');
  }
  if (body.unitLabel !== undefined) {
    normalized.unitLabel = trimString(body.unitLabel, 40, 'INVALID_PACKAGE_PAYLOAD', 'unitLabel');
  }
  if (body.priceAmount !== undefined || body.price !== undefined) {
    normalized.priceAmount = normalizeMoneyAmount(body.priceAmount ?? body.price, 'priceAmount', 'INVALID_PACKAGE_PAYLOAD');
  }
  if (body.currency !== undefined) {
    normalized.currency = normalizeCurrency(body.currency, 'INVALID_PACKAGE_PAYLOAD');
  }
  if (body.status !== undefined) {
    normalized.status = normalizePackageStatus(body.status);
  }
  if (body.metadataJson !== undefined || body.metadata !== undefined) {
    normalized.metadata = assertPlainObject(body.metadataJson ?? body.metadata, 'INVALID_PACKAGE_PAYLOAD', 'metadataJson');
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(400, 'INVALID_PACKAGE_PAYLOAD', 'No supported package fields supplied.');
  }

  return normalized;
}

function normalizePackageAssignmentPayload(body) {
  rejectClinicOverride(body, 'INVALID_MEMBER_PACKAGE');
  const source = trimString(body.source, 80, 'INVALID_MEMBER_PACKAGE', 'source') || 'manual_admin';
  if (source !== 'manual_admin') {
    throw new AppError(400, 'INVALID_MEMBER_PACKAGE', 'Only manual_admin package assignment is supported.');
  }

  return {
    packageId: asPositiveInteger(body.packageId, 'packageId', 'INVALID_MEMBER_PACKAGE'),
    totalUnits: body.totalUnits === undefined
      ? undefined
      : normalizeOptionalPositiveInteger(body.totalUnits, 'totalUnits', 'INVALID_MEMBER_PACKAGE'),
    remainingUnits: body.remainingUnits === undefined
      ? undefined
      : normalizeOptionalNonNegativeInteger(body.remainingUnits, 'remainingUnits', 'INVALID_MEMBER_PACKAGE'),
    expiresAt: normalizeOptionalTimestamp(body.expiresAt, 'expiresAt', 'INVALID_MEMBER_PACKAGE'),
    source
  };
}

function rejectForbiddenPaymentFields(body) {
  for (const field of FORBIDDEN_PAYMENT_FIELDS) {
    if (body[field] !== undefined) {
      throw new AppError(400, 'INVALID_PAYMENT_RECORD', 'External payment gateway fields are not supported in this foundation.');
    }
  }
}

function normalizePaymentRecordPayload(body) {
  rejectClinicOverride(body, 'INVALID_PAYMENT_RECORD');
  rejectForbiddenPaymentFields(body);

  const paymentStatus = normalizePaymentStatus(body.paymentStatus);
  const paidAt = normalizeOptionalTimestamp(body.paidAt, 'paidAt', 'INVALID_PAYMENT_RECORD');
  if (paidAt && paymentStatus !== 'recorded') {
    throw new AppError(400, 'INVALID_PAYMENT_RECORD', 'paidAt is only supported for recorded payment records.');
  }

  return {
    memberId: body.memberId === undefined || body.memberId === null || body.memberId === ''
      ? null
      : asPositiveInteger(body.memberId, 'memberId', 'INVALID_PAYMENT_RECORD'),
    memberPackageId: body.memberPackageId === undefined || body.memberPackageId === null || body.memberPackageId === ''
      ? null
      : asPositiveInteger(body.memberPackageId, 'memberPackageId', 'INVALID_PAYMENT_RECORD'),
    packageId: body.packageId === undefined || body.packageId === null || body.packageId === ''
      ? null
      : asPositiveInteger(body.packageId, 'packageId', 'INVALID_PAYMENT_RECORD'),
    paymentRef: trimString(body.paymentRef, 120, 'INVALID_PAYMENT_RECORD', 'paymentRef'),
    paymentStatus,
    paymentMethod: normalizePaymentMethod(body.paymentMethod),
    amount: normalizeMoneyAmount(body.amount, 'amount', 'INVALID_PAYMENT_RECORD', { required: true }),
    currency: normalizeCurrency(body.currency, 'INVALID_PAYMENT_RECORD'),
    paidAt
  };
}

function normalizePackageListFilters(searchParams) {
  rejectClinicOverrideQuery(searchParams, 'INVALID_PACKAGE_PAYLOAD');
  const status = trimString(searchParams.get('status'), 40, 'INVALID_PACKAGE_STATUS', 'status');
  if (status && !VALID_PACKAGE_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_PACKAGE_STATUS', 'status is invalid.');
  }
  return {
    status,
    limit: Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function normalizePaymentListFilters(searchParams) {
  rejectClinicOverrideQuery(searchParams, 'INVALID_PAYMENT_RECORD');
  const status = trimString(searchParams.get('status'), 40, 'INVALID_PAYMENT_STATUS', 'paymentStatus');
  if (status && !VALID_PAYMENT_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_PAYMENT_STATUS', 'paymentStatus is invalid.');
  }

  return {
    memberId: searchParams.has('memberId') ? asPositiveInteger(searchParams.get('memberId'), 'memberId', 'INVALID_PAYMENT_RECORD') : null,
    paymentStatus: status,
    limit: Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100),
    offset: asNonNegativeInteger(searchParams.get('offset'), 0, 'offset')
  };
}

function numberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapServicePackage(row) {
  return {
    id: Number(row.id),
    packageCode: row.package_code,
    packageName: row.package_name,
    packageType: row.package_type,
    description: row.description || null,
    totalUnits: numberOrNull(row.total_units),
    unitLabel: row.unit_label || null,
    priceAmount: numberOrNull(row.price_amount),
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function packageSnapshotFromRow(row) {
  const snapshot = row.package_snapshot_json || {};
  return {
    packageId: snapshot.packageId ?? numberOrNull(row.package_id),
    packageCode: snapshot.packageCode || row.package_code || null,
    packageName: snapshot.packageName || row.package_name || null,
    packageType: snapshot.packageType || row.package_type || null,
    totalUnits: snapshot.totalUnits ?? numberOrNull(row.snapshot_total_units ?? row.package_total_units),
    unitLabel: snapshot.unitLabel || row.snapshot_unit_label || row.package_unit_label || null,
    priceAmount: snapshot.priceAmount ?? numberOrNull(row.snapshot_price_amount ?? row.package_price_amount),
    currency: snapshot.currency || row.package_currency || null
  };
}

function mapMemberPackage(row) {
  const snapshot = packageSnapshotFromRow(row);
  return {
    id: Number(row.id),
    packageId: numberOrNull(row.package_id),
    packageCode: snapshot.packageCode,
    packageName: snapshot.packageName,
    packageType: snapshot.packageType,
    ownershipStatus: row.ownership_status,
    totalUnits: numberOrNull(row.total_units),
    remainingUnits: numberOrNull(row.remaining_units),
    unitLabel: snapshot.unitLabel,
    activatedAt: row.activated_at || null,
    expiresAt: row.expires_at || null,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPaymentRecord(row) {
  return {
    id: Number(row.id),
    memberId: numberOrNull(row.member_id),
    memberPackageId: numberOrNull(row.member_package_id),
    packageId: numberOrNull(row.package_id),
    paymentRef: row.payment_ref || null,
    paymentRefProvided: Boolean(row.payment_ref),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    amount: Number(row.amount),
    currency: row.currency,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPublicMemberPackage(row) {
  const snapshot = packageSnapshotFromRow(row);
  return {
    id: Number(row.id),
    packageCode: snapshot.packageCode,
    packageName: snapshot.packageName,
    packageType: snapshot.packageType,
    ownershipStatus: row.ownership_status,
    totalUnits: numberOrNull(row.total_units),
    remainingUnits: numberOrNull(row.remaining_units),
    unitLabel: snapshot.unitLabel,
    activatedAt: row.activated_at || null,
    expiresAt: row.expires_at || null,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPublicPaymentRecord(row) {
  return {
    id: Number(row.id),
    memberPackageId: numberOrNull(row.member_package_id),
    packageId: numberOrNull(row.package_id),
    paymentRefProvided: Boolean(row.payment_ref),
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    amount: Number(row.amount),
    currency: row.currency,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildPackageSnapshot(packageRow) {
  return {
    packageId: Number(packageRow.id),
    packageCode: packageRow.package_code,
    packageName: packageRow.package_name,
    packageType: packageRow.package_type,
    totalUnits: numberOrNull(packageRow.total_units),
    unitLabel: packageRow.unit_label || null,
    priceAmount: numberOrNull(packageRow.price_amount),
    currency: packageRow.currency
  };
}

function packageAssignmentSummary(memberPackage, memberId) {
  return {
    source: 'manual_admin_package_assignment',
    memberId,
    memberPackageId: memberPackage.id,
    packageId: memberPackage.packageId,
    packageCode: memberPackage.packageCode,
    ownershipStatus: memberPackage.ownershipStatus
  };
}

function paymentRecordSummary(paymentRecord) {
  return {
    source: 'manual_admin_payment_record',
    paymentRecordId: paymentRecord.id,
    memberId: paymentRecord.memberId,
    memberPackageId: paymentRecord.memberPackageId,
    packageId: paymentRecord.packageId,
    paymentStatus: paymentRecord.paymentStatus,
    paymentMethod: paymentRecord.paymentMethod,
    amount: paymentRecord.amount,
    currency: paymentRecord.currency,
    paymentRefProvided: paymentRecord.paymentRefProvided
  };
}

async function recordMemberEvent(client, clinicId, memberId, leadId, eventType, summary) {
  await client.query(
    `
      insert into clinic_member_events (
        clinic_id,
        member_id,
        lead_id,
        event_type,
        event_summary_json
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [clinicId, memberId, leadId || null, eventType, JSON.stringify({ summary })]
  );
}

async function findMemberForClinic(client, clinicId, memberId) {
  const result = await client.query(
    `
      select id, clinic_id, lead_id, status
      from clinic_members
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, memberId]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found.');
  }
  return result.rows[0];
}

async function findServicePackageForClinic(client, clinicId, packageId, options = {}) {
  const result = await client.query(
    `
      select *
      from clinic_service_packages
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, packageId]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'SERVICE_PACKAGE_NOT_FOUND', 'Service package not found.');
  }
  const row = result.rows[0];
  if (options.requireActive && row.status !== 'active') {
    throw new AppError(409, 'SERVICE_PACKAGE_NOT_ACTIVE', 'Service package is not active.');
  }
  return row;
}

async function findMemberPackageForClinic(client, clinicId, memberPackageId) {
  const result = await client.query(
    `
      select
        mp.*,
        m.lead_id as member_lead_id
      from clinic_member_packages mp
      inner join clinic_members m on m.clinic_id = mp.clinic_id and m.id = mp.member_id
      where mp.clinic_id = $1 and mp.id = $2
      limit 1
    `,
    [clinicId, memberPackageId]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'MEMBER_PACKAGE_NOT_FOUND', 'Member package not found.');
  }
  return result.rows[0];
}

async function listServicePackages(context, searchParams = new URLSearchParams()) {
  assertAdminContext(context);
  const filters = normalizePackageListFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await getPool().query(
    `
      select *, count(*) over()::int as total_count
      from clinic_service_packages
      where ${clauses.join(' and ')}
      order by created_at desc, id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map(mapServicePackage),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function createServicePackage(context, body) {
  assertAdminContext(context);
  const payload = normalizePackageCreatePayload(body);
  const clinicId = context.currentClinic.id;
  const actorUserId = context.currentUser?.id || null;
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const result = await client.query(
      `
        insert into clinic_service_packages (
          clinic_id,
          package_code,
          package_name,
          package_type,
          description,
          total_units,
          unit_label,
          price_amount,
          currency,
          status,
          metadata_json,
          created_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        returning *
      `,
      [
        clinicId,
        payload.packageCode,
        payload.packageName,
        payload.packageType,
        payload.description,
        payload.totalUnits,
        payload.unitLabel,
        payload.priceAmount,
        payload.currency,
        payload.status,
        JSON.stringify(payload.metadata),
        actorUserId
      ]
    );

    const created = mapServicePackage(result.rows[0]);
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_service_package',
        entityId: created.id,
        actionType: 'clinic_service_package.created',
        actorUserId,
        contextJson: {
          summary: {
            source: 'package_payment_foundation',
            packageId: created.id,
            packageCode: created.packageCode,
            status: created.status,
            changedFields: Object.keys(payload).filter((key) => key !== 'metadata')
          }
        }
      },
      client
    );

    await client.query('commit');
    return created;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    if (error?.code === '23505') {
      throw new AppError(409, 'SERVICE_PACKAGE_CODE_CONFLICT', 'Service package code already exists for this clinic.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function updateServicePackage(context, packageId, body) {
  assertAdminContext(context);
  const normalizedId = asPositiveInteger(packageId, 'packageId', 'INVALID_PACKAGE_PAYLOAD');
  const payload = normalizePackageUpdatePayload(body);
  const clinicId = context.currentClinic.id;
  const actorUserId = context.currentUser?.id || null;
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const existing = await client.query(
      'select * from clinic_service_packages where clinic_id = $1 and id = $2 for update',
      [clinicId, normalizedId]
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, 'SERVICE_PACKAGE_NOT_FOUND', 'Service package not found.');
    }

    const assignments = [];
    const values = [clinicId, normalizedId];
    const addAssignment = (columnName, value) => {
      values.push(value);
      assignments.push(`${columnName} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'packageName')) addAssignment('package_name', payload.packageName);
    if (Object.prototype.hasOwnProperty.call(payload, 'packageType')) addAssignment('package_type', payload.packageType);
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) addAssignment('description', payload.description);
    if (Object.prototype.hasOwnProperty.call(payload, 'totalUnits')) addAssignment('total_units', payload.totalUnits);
    if (Object.prototype.hasOwnProperty.call(payload, 'unitLabel')) addAssignment('unit_label', payload.unitLabel);
    if (Object.prototype.hasOwnProperty.call(payload, 'priceAmount')) addAssignment('price_amount', payload.priceAmount);
    if (Object.prototype.hasOwnProperty.call(payload, 'currency')) addAssignment('currency', payload.currency);
    if (Object.prototype.hasOwnProperty.call(payload, 'status')) addAssignment('status', payload.status);
    if (Object.prototype.hasOwnProperty.call(payload, 'metadata')) {
      values.push(JSON.stringify(payload.metadata));
      assignments.push(`metadata_json = $${values.length}::jsonb`);
    }
    assignments.push('updated_at = now()');

    const result = await client.query(
      `
        update clinic_service_packages
        set ${assignments.join(', ')}
        where clinic_id = $1 and id = $2
        returning *
      `,
      values
    );

    const updated = mapServicePackage(result.rows[0]);
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_service_package',
        entityId: updated.id,
        actionType: 'clinic_service_package.updated',
        actorUserId,
        contextJson: {
          summary: {
            source: 'package_payment_foundation',
            packageId: updated.id,
            packageCode: updated.packageCode,
            status: updated.status,
            changedFields: Object.keys(payload).filter((key) => key !== 'metadata')
          }
        }
      },
      client
    );

    await client.query('commit');
    return updated;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function assignPackageToMember(context, memberId, body) {
  assertAdminContext(context);
  const normalizedMemberId = asPositiveInteger(memberId, 'memberId', 'INVALID_MEMBER_PACKAGE');
  const payload = normalizePackageAssignmentPayload(body);
  const clinicId = context.currentClinic.id;
  const actorUserId = context.currentUser?.id || null;
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const member = await findMemberForClinic(client, clinicId, normalizedMemberId);
    const servicePackage = await findServicePackageForClinic(client, clinicId, payload.packageId, { requireActive: true });
    const totalUnits = payload.totalUnits !== undefined
      ? payload.totalUnits
      : numberOrNull(servicePackage.total_units);
    const remainingUnits = payload.remainingUnits !== undefined
      ? payload.remainingUnits
      : totalUnits;

    if (remainingUnits !== null && totalUnits === null) {
      throw new AppError(400, 'INVALID_MEMBER_PACKAGE', 'remainingUnits requires totalUnits.');
    }
    if (remainingUnits !== null && totalUnits !== null && remainingUnits > totalUnits) {
      throw new AppError(400, 'INVALID_MEMBER_PACKAGE', 'remainingUnits cannot exceed totalUnits.');
    }

    const packageSnapshot = buildPackageSnapshot(servicePackage);
    const insertResult = await client.query(
      `
        insert into clinic_member_packages (
          clinic_id,
          member_id,
          lead_id,
          package_id,
          package_snapshot_json,
          ownership_status,
          total_units,
          remaining_units,
          activated_at,
          expires_at,
          source,
          created_by_user_id,
          metadata_json
        )
        values ($1, $2, $3, $4, $5::jsonb, 'active', $6, $7, now(), $8, $9, $10, $11::jsonb)
        returning *
      `,
      [
        clinicId,
        normalizedMemberId,
        member.lead_id || null,
        servicePackage.id,
        JSON.stringify(packageSnapshot),
        totalUnits,
        remainingUnits,
        payload.expiresAt,
        payload.source,
        actorUserId,
        JSON.stringify({ assignedVia: 'manual_admin' })
      ]
    );

    const memberPackage = mapMemberPackage(insertResult.rows[0]);
    const summary = packageAssignmentSummary(memberPackage, normalizedMemberId);
    await recordMemberEvent(client, clinicId, normalizedMemberId, member.lead_id, 'member_package.assigned', summary);
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_member_package',
        entityId: memberPackage.id,
        actionType: 'clinic_member_package.assigned',
        actorUserId,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    return memberPackage;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listMemberPackagesForAdmin(context, memberId, searchParams = new URLSearchParams()) {
  assertAdminContext(context);
  rejectClinicOverrideQuery(searchParams, 'INVALID_MEMBER_PACKAGE');
  const normalizedMemberId = asPositiveInteger(memberId, 'memberId', 'INVALID_MEMBER_PACKAGE');
  const status = trimString(searchParams.get('status'), 40, 'INVALID_MEMBER_PACKAGE_STATUS', 'status');
  if (status && !VALID_OWNERSHIP_STATUSES.has(status)) {
    throw new AppError(400, 'INVALID_MEMBER_PACKAGE_STATUS', 'ownership status is invalid.');
  }

  const values = [context.currentClinic.id, normalizedMemberId];
  const clauses = ['mp.clinic_id = $1', 'mp.member_id = $2'];
  if (status) {
    values.push(status);
    clauses.push(`mp.ownership_status = $${values.length}`);
  }
  values.push(Math.min(asPositiveInteger(searchParams.get('limit') || '50', 'limit'), 100));
  const limitPosition = values.length;
  values.push(asNonNegativeInteger(searchParams.get('offset'), 0, 'offset'));
  const offsetPosition = values.length;

  const client = getPool();
  await findMemberForClinic(client, context.currentClinic.id, normalizedMemberId);
  const result = await client.query(
    `
      select mp.*, count(*) over()::int as total_count
      from clinic_member_packages mp
      where ${clauses.join(' and ')}
      order by mp.created_at desc, mp.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map(mapMemberPackage),
    total: result.rows[0]?.total_count || 0,
    limit: values[limitPosition - 1],
    offset: values[offsetPosition - 1]
  };
}

async function createPaymentRecord(context, body) {
  assertAdminContext(context);
  const payload = normalizePaymentRecordPayload(body);
  const clinicId = context.currentClinic.id;
  const actorUserId = context.currentUser?.id || null;
  const client = await getPool().connect();

  try {
    await client.query('begin');
    let member = null;
    let memberPackage = null;
    let packageId = payload.packageId;
    let memberId = payload.memberId;

    if (payload.memberPackageId) {
      memberPackage = await findMemberPackageForClinic(client, clinicId, payload.memberPackageId);
      if (memberId && Number(memberPackage.member_id) !== memberId) {
        throw new AppError(400, 'INVALID_PAYMENT_RECORD', 'memberPackageId does not belong to memberId.');
      }
      memberId = Number(memberPackage.member_id);
      if (packageId && memberPackage.package_id && Number(memberPackage.package_id) !== packageId) {
        throw new AppError(400, 'INVALID_PAYMENT_RECORD', 'memberPackageId does not belong to packageId.');
      }
      packageId = packageId || numberOrNull(memberPackage.package_id);
    }

    if (memberId) {
      member = await findMemberForClinic(client, clinicId, memberId);
    }
    if (packageId) {
      await findServicePackageForClinic(client, clinicId, packageId);
    }

    const insertResult = await client.query(
      `
        insert into clinic_payment_records (
          clinic_id,
          member_id,
          lead_id,
          member_package_id,
          package_id,
          payment_ref,
          payment_status,
          payment_method,
          amount,
          currency,
          paid_at,
          recorded_by_user_id,
          metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        returning *
      `,
      [
        clinicId,
        memberId,
        member?.lead_id || memberPackage?.member_lead_id || null,
        payload.memberPackageId,
        packageId,
        payload.paymentRef,
        payload.paymentStatus,
        payload.paymentMethod,
        payload.amount,
        payload.currency,
        payload.paidAt,
        actorUserId,
        JSON.stringify({ recordedVia: 'manual_admin' })
      ]
    );

    const paymentRecord = mapPaymentRecord(insertResult.rows[0]);
    const summary = paymentRecordSummary(paymentRecord);
    if (memberId) {
      await recordMemberEvent(client, clinicId, memberId, member?.lead_id || memberPackage?.member_lead_id || null, 'member_payment.recorded', summary);
    }
    await recordAuditLog(
      {
        clinicId,
        entityType: 'clinic_payment_record',
        entityId: paymentRecord.id,
        actionType: 'clinic_payment_record.created',
        actorUserId,
        contextJson: { summary }
      },
      client
    );

    await client.query('commit');
    return paymentRecord;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listPaymentRecords(context, searchParams = new URLSearchParams()) {
  assertAdminContext(context);
  const filters = normalizePaymentListFilters(searchParams);
  const values = [context.currentClinic.id];
  const clauses = ['clinic_id = $1'];

  if (filters.memberId) {
    values.push(filters.memberId);
    clauses.push(`member_id = $${values.length}`);
  }
  if (filters.paymentStatus) {
    values.push(filters.paymentStatus);
    clauses.push(`payment_status = $${values.length}`);
  }

  values.push(filters.limit);
  const limitPosition = values.length;
  values.push(filters.offset);
  const offsetPosition = values.length;

  const result = await getPool().query(
    `
      select *, count(*) over()::int as total_count
      from clinic_payment_records
      where ${clauses.join(' and ')}
      order by created_at desc, id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `,
    values
  );

  return {
    items: result.rows.map(mapPaymentRecord),
    total: result.rows[0]?.total_count || 0,
    limit: filters.limit,
    offset: filters.offset
  };
}

async function listPublicMemberPackagesForMember(client, clinicId, memberId) {
  const result = await client.query(
    `
      select
        mp.id,
        mp.package_id,
        mp.package_snapshot_json,
        mp.ownership_status,
        mp.total_units,
        mp.remaining_units,
        mp.activated_at,
        mp.expires_at,
        mp.source,
        mp.created_at,
        mp.updated_at
      from clinic_member_packages mp
      where mp.clinic_id = $1
        and mp.member_id = $2
      order by mp.created_at desc, mp.id desc
      limit 50
    `,
    [clinicId, memberId]
  );

  return result.rows.map(mapPublicMemberPackage);
}

async function listPublicPaymentRecordsForMember(client, clinicId, memberId) {
  const result = await client.query(
    `
      select
        id,
        member_package_id,
        package_id,
        payment_ref,
        payment_status,
        payment_method,
        amount,
        currency,
        paid_at,
        created_at,
        updated_at
      from clinic_payment_records
      where clinic_id = $1
        and member_id = $2
      order by created_at desc, id desc
      limit 50
    `,
    [clinicId, memberId]
  );

  return result.rows.map(mapPublicPaymentRecord);
}

module.exports = {
  VALID_PACKAGE_TYPES,
  VALID_PACKAGE_STATUSES,
  VALID_PAYMENT_STATUSES,
  VALID_PAYMENT_METHODS,
  listServicePackages,
  createServicePackage,
  updateServicePackage,
  assignPackageToMember,
  listMemberPackagesForAdmin,
  createPaymentRecord,
  listPaymentRecords,
  listPublicMemberPackagesForMember,
  listPublicPaymentRecordsForMember,
  mapServicePackage,
  mapMemberPackage,
  mapPaymentRecord,
  mapPublicMemberPackage,
  mapPublicPaymentRecord
};
