const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

function asPositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function asDateFilter(value, fieldName) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'INVALID_QUERY', `${fieldName} must be a valid date or ISO timestamp.`);
  }

  return parsed.toISOString();
}

function mapAuditLog(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionType: row.action_type,
    actorUserId: row.actor_user_id,
    contextJson: row.context_json,
    createdAt: row.created_at
  };
}

async function recordAuditLog(input, client = getPool()) {
  const result = await client.query(
    `
      insert into audit_logs (clinic_id, entity_type, entity_id, action_type, actor_user_id, context_json)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning *
    `,
    [
      input.clinicId,
      input.entityType,
      input.entityId,
      input.actionType,
      input.actorUserId || null,
      JSON.stringify(input.contextJson || {})
    ]
  );

  return mapAuditLog(result.rows[0]);
}

async function listAuditLogs(clinicId, searchParams) {
  const values = [clinicId];
  const clauses = ['clinic_id = $1'];

  if (searchParams.get('actionType')) {
    values.push(searchParams.get('actionType'));
    clauses.push(`action_type = $${values.length}`);
  }

  if (searchParams.get('entityType')) {
    values.push(searchParams.get('entityType'));
    clauses.push(`entity_type = $${values.length}`);
  }

  if (searchParams.get('entityId')) {
    values.push(asPositiveInteger(searchParams.get('entityId'), 'entityId'));
    clauses.push(`entity_id = $${values.length}`);
  }

  const from = asDateFilter(searchParams.get('from'), 'from');
  const to = asDateFilter(searchParams.get('to'), 'to');

  if (from) {
    values.push(from);
    clauses.push(`created_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    clauses.push(`created_at <= $${values.length}`);
  }

  values.push(Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200));

  const result = await getPool().query(
    `
      select *
      from audit_logs
      where ${clauses.join(' and ')}
      order by created_at desc, id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapAuditLog)
  };
}

async function listAuditLogsByEntity(clinicId, entityType, entityId) {
  const normalizedEntityId = asPositiveInteger(entityId, 'entityId');
  const result = await getPool().query(
    `
      select *
      from audit_logs
      where clinic_id = $1 and entity_type = $2 and entity_id = $3
      order by created_at desc, id desc
    `,
    [clinicId, entityType, normalizedEntityId]
  );

  return {
    items: result.rows.map(mapAuditLog)
  };
}

module.exports = {
  recordAuditLog,
  listAuditLogs,
  listAuditLogsByEntity
};