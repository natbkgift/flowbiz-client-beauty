const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const {
  validateCustomerPayload,
  validateLeadConversionPayload,
  validateCustomerNotePayload,
  parseCustomerListFilters,
  validateTimelineQuery
} = require('./validation');

function mapCustomer(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    sourceLeadId: row.source_lead_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: row.profile_id
      ? {
        id: row.profile_id,
        preferredChannel: row.preferred_channel,
        tags: row.tags || [],
        metaJson: row.meta_json || {},
        createdAt: row.profile_created_at
      }
      : null
  };
}

async function findLeadRow(client, clinicId, leadId) {
  const result = await client.query(
    `
      select id, clinic_id, full_name, phone, email, line_user_id, status, stage, owner_user_id, source, source_ref, created_at, updated_at
      from leads
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, leadId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  return result.rows[0];
}

async function findCustomerRow(client, clinicId, customerId) {
  const result = await client.query(
    `
      select
        c.*, cp.id as profile_id, cp.preferred_channel, cp.tags, cp.meta_json, cp.created_at as profile_created_at
      from customers c
      left join customer_profiles cp on cp.customer_id = c.id
      where c.clinic_id = $1 and c.id = $2
      limit 1
    `,
    [clinicId, customerId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  return result.rows[0];
}

async function ensureCustomerProfile(client, clinicId, customerId, payload = {}) {
  const normalized = validateCustomerPayload(payload, { partial: true });

  await client.query(
    `
      insert into customer_profiles (clinic_id, customer_id, preferred_channel, tags, meta_json)
      values ($1, $2, $3, $4::text[], $5::jsonb)
      on conflict (customer_id)
      do update set
        preferred_channel = coalesce(excluded.preferred_channel, customer_profiles.preferred_channel),
        tags = case when cardinality(excluded.tags) > 0 then excluded.tags else customer_profiles.tags end,
        meta_json = customer_profiles.meta_json || excluded.meta_json
    `,
    [
      clinicId,
      customerId,
      normalized.preferredChannel || null,
      normalized.tags || [],
      JSON.stringify(normalized.metaJson || {})
    ]
  );
}

async function recordCustomerEvent(client, clinicId, customerId, eventType, eventSource, eventPayloadJson = {}) {
  await client.query(
    `
      insert into customer_events (clinic_id, customer_id, event_type, event_source, event_payload_json)
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [clinicId, customerId, eventType, eventSource, JSON.stringify(eventPayloadJson)]
  );
}

async function listCustomers(clinicId, searchParams) {
  const filters = parseCustomerListFilters(searchParams);
  const values = [clinicId];
  const clauses = ['c.clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`c.status = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search.toLowerCase()}%`);
    clauses.push(`(lower(c.full_name) like $${values.length} or lower(coalesce(c.phone, '')) like $${values.length} or lower(coalesce(c.email, '')) like $${values.length})`);
  }

  values.push(filters.limit);

  const result = await getPool().query(
    `
      select
        c.*, cp.id as profile_id, cp.preferred_channel, cp.tags, cp.meta_json, cp.created_at as profile_created_at
      from customers c
      left join customer_profiles cp on cp.customer_id = c.id
      where ${clauses.join(' and ')}
      order by c.created_at desc, c.id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapCustomer),
    filters
  };
}

async function getCustomerDetail(clinicId, customerId) {
  const row = await findCustomerRow(getPool(), clinicId, customerId);
  return mapCustomer(row);
}

async function createCustomer(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = validateCustomerPayload(payload);
  await client.query('begin');

  try {
    const result = await client.query(
      `
        insert into customers (clinic_id, source_lead_id, full_name, phone, email, status)
        values ($1, null, $2, $3, $4, $5)
        returning *
      `,
      [clinicContext.currentClinic.id, normalized.fullName, normalized.phone, normalized.email, normalized.status]
    );

    await ensureCustomerProfile(client, clinicContext.currentClinic.id, result.rows[0].id, payload);
    await recordCustomerEvent(client, clinicContext.currentClinic.id, result.rows[0].id, 'customer.created', 'customer_service', {
      createdByUserId: clinicContext.currentUser.id
    });
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'customer',
        entityId: result.rows[0].id,
        actionType: 'customer.create',
        actorUserId: clinicContext.currentUser.id,
        contextJson: { status: normalized.status }
      },
      client
    );

    await client.query('commit');

    try {
      const { publishDomainEvent } = require('../event-bus/publisher');
      await publishDomainEvent({
        clinicId: clinicContext.currentClinic.id,
        eventType: 'customer.created',
        entityType: 'customer',
        entityId: result.rows[0].id,
        payloadJson: {
          status: normalized.status,
          actorUserId: clinicContext.currentUser.id
        }
      });
    } catch (error) {
      console.error('Event bus customer.created publish failed:', error.message);
    }

    return getCustomerDetail(clinicContext.currentClinic.id, result.rows[0].id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function convertLeadToCustomer(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = payload && typeof payload === 'object' && payload.leadId !== undefined
    ? validateLeadConversionPayload(payload)
    : { leadId: Number.parseInt(payload, 10) };

  if (!normalized.leadId) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'leadId is required.');
  }

  await client.query('begin');

  try {
    const lead = await findLeadRow(client, clinicContext.currentClinic.id, normalized.leadId);
    const existingCustomer = await client.query(
      `
        select
          c.*, cp.id as profile_id, cp.preferred_channel, cp.tags, cp.meta_json, cp.created_at as profile_created_at
        from customers c
        left join customer_profiles cp on cp.customer_id = c.id
        where c.clinic_id = $1 and c.source_lead_id = $2
        limit 1
      `,
      [clinicContext.currentClinic.id, lead.id]
    );

    if (existingCustomer.rowCount > 0) {
      await client.query('commit');
      return mapCustomer(existingCustomer.rows[0]);
    }

    const customerResult = await client.query(
      `
        insert into customers (clinic_id, source_lead_id, full_name, phone, email, status)
        values ($1, $2, $3, $4, $5, 'active')
        returning *
      `,
      [clinicContext.currentClinic.id, lead.id, lead.full_name, lead.phone, lead.email]
    );

    const customer = customerResult.rows[0];

    await ensureCustomerProfile(client, clinicContext.currentClinic.id, customer.id, {
      preferredChannel: lead.line_user_id ? 'line' : lead.email ? 'email' : lead.phone ? 'sms' : null,
      tags: ['converted_from_lead'],
      metaJson: {
        sourceLeadId: lead.id,
        sourceLeadStatus: lead.status,
        sourceLeadStage: lead.stage,
        sourceLeadRef: lead.source_ref
      }
    });

    await recordCustomerEvent(client, clinicContext.currentClinic.id, customer.id, 'customer.created', 'lead_conversion', {
      leadId: lead.id,
      source: lead.source,
      sourceRef: lead.source_ref
    });
    await recordCustomerEvent(client, clinicContext.currentClinic.id, customer.id, 'customer.converted_from_lead', 'lead_conversion', {
      leadId: lead.id,
      leadStatus: lead.status,
      leadStage: lead.stage
    });

    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'customer',
        entityId: customer.id,
        actionType: 'customer.convert',
        actorUserId: clinicContext.currentUser.id,
        contextJson: {
          sourceLeadId: lead.id,
          leadStatus: lead.status,
          leadStage: lead.stage
        }
      },
      client
    );

    await client.query('commit');

    try {
      const { publishDomainEvent } = require('../event-bus/publisher');
      await publishDomainEvent({
        clinicId: clinicContext.currentClinic.id,
        eventType: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        payloadJson: {
          sourceLeadId: lead.id,
          leadStatus: lead.status,
          leadStage: lead.stage,
          actorUserId: clinicContext.currentUser.id
        }
      });
    } catch (error) {
      console.error('Event bus customer.created publish failed:', error.message);
    }

    return getCustomerDetail(clinicContext.currentClinic.id, customer.id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function addCustomerNote(clinicContext, customerId, payload) {
  const client = await getPool().connect();
  const normalized = validateCustomerNotePayload(payload);
  await client.query('begin');

  try {
    await findCustomerRow(client, clinicContext.currentClinic.id, customerId);

    const noteResult = await client.query(
      `
        insert into customer_notes (clinic_id, customer_id, note_text, created_by_user_id)
        values ($1, $2, $3, $4)
        returning *
      `,
      [clinicContext.currentClinic.id, customerId, normalized.noteText, clinicContext.currentUser.id]
    );

    await recordCustomerEvent(client, clinicContext.currentClinic.id, customerId, 'customer.note_added', 'customer_notes', {
      noteId: noteResult.rows[0].id,
      createdByUserId: clinicContext.currentUser.id
    });

    await client.query('commit');

    return {
      id: noteResult.rows[0].id,
      clinicId: noteResult.rows[0].clinic_id,
      customerId: noteResult.rows[0].customer_id,
      noteText: noteResult.rows[0].note_text,
      createdByUserId: noteResult.rows[0].created_by_user_id,
      createdAt: noteResult.rows[0].created_at
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function recordCustomerMessageEvent(clinicId, customerId, payload, client = getPool()) {
  await recordCustomerEvent(client, clinicId, customerId, 'customer.message_sent', 'messaging', payload);
}

async function getCustomerTimeline(clinicId, customerId, searchParams) {
  const client = getPool();
  const filters = validateTimelineQuery(searchParams);
  const customer = await findCustomerRow(client, clinicId, customerId);
  const sourceLeadId = customer.source_lead_id;

  const result = await client.query(
    `
      with timeline as (
        select
          ce.created_at,
          'customer_event'::text as entry_type,
          ce.event_type as title,
          ce.event_source as source,
          ce.id::text as reference_id,
          ce.event_payload_json as payload_json
        from customer_events ce
        where ce.clinic_id = $1 and ce.customer_id = $2

        union all

        select
          cn.created_at,
          'customer_note'::text as entry_type,
          'customer.note_added'::text as title,
          'customer_notes'::text as source,
          cn.id::text as reference_id,
          jsonb_build_object('noteText', cn.note_text, 'createdByUserId', cn.created_by_user_id) as payload_json
        from customer_notes cn
        where cn.clinic_id = $1 and cn.customer_id = $2

        union all

        select
          om.created_at,
          'outbound_message'::text as entry_type,
          'message.sent'::text as title,
          'outbound_messages'::text as source,
          om.id::text as reference_id,
          jsonb_build_object(
            'entityType', om.entity_type,
            'messageType', om.message_type,
            'status', om.status,
            'channelId', om.channel_id,
            'contentRendered', om.content_rendered,
            'scheduledAt', om.scheduled_at,
            'automationExecutionId', om.automation_execution_id
          ) as payload_json
        from outbound_messages om
        where om.clinic_id = $1
          and (
            (om.entity_type = 'customer' and om.entity_id = $2)
            or ($3::bigint is not null and om.entity_type = 'lead' and om.entity_id = $3)
          )

        union all

        select
          ae.created_at,
          'automation_execution'::text as entry_type,
          concat('automation.', ae.trigger_event) as title,
          'automation_executions'::text as source,
          ae.id::text as reference_id,
          jsonb_build_object(
            'entityType', ae.entity_type,
            'status', ae.status,
            'flowId', ae.flow_id,
            'triggerEvent', ae.trigger_event,
            'lastStepOrder', ae.last_step_order
          ) as payload_json
        from automation_executions ae
        where ae.clinic_id = $1
          and (
            (ae.entity_type = 'customer' and ae.entity_id = $2)
            or ($3::bigint is not null and ae.entity_type = 'lead' and ae.entity_id = $3)
          )

        union all

        select
          lead_notes.created_at,
          'lead_history'::text as entry_type,
          coalesce(lead_notes.note_type, 'lead.note')::text as title,
          'lead_notes'::text as source,
          lead_notes.id::text as reference_id,
          jsonb_build_object('content', lead_notes.content, 'noteType', lead_notes.note_type, 'leadId', $3::bigint) as payload_json
        from notes lead_notes
        where $3::bigint is not null
          and lead_notes.clinic_id = $1
          and lead_notes.entity_type = 'lead'
          and lead_notes.entity_id = $3

        union all

        select
          lead_history.created_at,
          'lead_history'::text as entry_type,
          'lead.snapshot'::text as title,
          'lead_record'::text as source,
          lead_history.id::text as reference_id,
          jsonb_build_object(
            'leadId', lead_history.id,
            'fullName', lead_history.full_name,
            'status', lead_history.status,
            'stage', lead_history.stage,
            'sourceRef', lead_history.source_ref
          ) as payload_json
        from leads lead_history
        where $3::bigint is not null
          and lead_history.clinic_id = $1
          and lead_history.id = $3
      )
      select created_at, entry_type, title, source, reference_id, payload_json
      from timeline
      order by created_at desc, reference_id desc
      limit $4
    `,
    [clinicId, customerId, sourceLeadId, filters.limit]
  );

  return {
    customer: mapCustomer(customer),
    items: result.rows.map((row) => ({
      createdAt: row.created_at,
      entryType: row.entry_type,
      title: row.title,
      source: row.source,
      referenceId: row.reference_id,
      payloadJson: row.payload_json
    })),
    filters
  };
}

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerDetail,
  convertLeadToCustomer,
  addCustomerNote,
  getCustomerTimeline,
  recordCustomerEvent,
  recordCustomerMessageEvent
};