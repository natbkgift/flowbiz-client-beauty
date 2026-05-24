const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

async function extractLeadFeatures(clinicId, leadId, client = getPool()) {
  const leadResult = await client.query(
    `
      select id, source, status, stage, intent_score, last_contacted_at, created_at
      from leads
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, leadId]
  );

  if (leadResult.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  const noteResult = await client.query(
    `select count(*)::int as note_count from notes where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [clinicId, leadId]
  );
  const outboundResult = await client.query(
    `select count(*)::int as outbound_count from outbound_messages where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [clinicId, leadId]
  );
  const executionResult = await client.query(
    `select count(*)::int as execution_count from automation_executions where clinic_id = $1 and entity_type = 'lead' and entity_id = $2`,
    [clinicId, leadId]
  );

  return {
    source: leadResult.rows[0].source,
    status: leadResult.rows[0].status,
    stage: leadResult.rows[0].stage,
    intentScore: leadResult.rows[0].intent_score || 0,
    noteCount: noteResult.rows[0].note_count,
    outboundCount: outboundResult.rows[0].outbound_count,
    executionCount: executionResult.rows[0].execution_count,
    lastContactedAt: leadResult.rows[0].last_contacted_at,
    createdAt: leadResult.rows[0].created_at
  };
}

async function extractCustomerFeatures(clinicId, customerId, client = getPool()) {
  const customerResult = await client.query(
    `
      select id, status, created_at, updated_at
      from customers
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, customerId]
  );

  if (customerResult.rowCount === 0) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  const eventResult = await client.query(
    `select count(*)::int as event_count, max(created_at) as last_event_at from customer_events where clinic_id = $1 and customer_id = $2`,
    [clinicId, customerId]
  );
  const noteResult = await client.query(
    `select count(*)::int as note_count from customer_notes where clinic_id = $1 and customer_id = $2`,
    [clinicId, customerId]
  );
  const outboundResult = await client.query(
    `select count(*)::int as outbound_count, max(created_at) as last_outbound_at from outbound_messages where clinic_id = $1 and entity_type = 'customer' and entity_id = $2`,
    [clinicId, customerId]
  );

  return {
    status: customerResult.rows[0].status,
    eventCount: eventResult.rows[0].event_count,
    noteCount: noteResult.rows[0].note_count,
    outboundCount: outboundResult.rows[0].outbound_count,
    lastActivityAt: outboundResult.rows[0].last_outbound_at || eventResult.rows[0].last_event_at || customerResult.rows[0].updated_at,
    createdAt: customerResult.rows[0].created_at
  };
}

module.exports = {
  extractLeadFeatures,
  extractCustomerFeatures
};