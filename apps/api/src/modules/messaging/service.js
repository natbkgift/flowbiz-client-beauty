const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');
const {
  validateChannelPayload,
  validateContactIdentityPayload,
  validateTemplatePayload,
  validateManualMessagePayload,
  parseOutboundFilters,
  parseContactIdentityFilters
} = require('./validation');
const { sendMessage } = require('./provider');

function mapChannel(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    channelType: row.channel_type,
    name: row.name,
    status: row.status,
    isPrimary: row.is_primary,
    configJson: row.config_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContactIdentity(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    channelType: row.channel_type,
    externalId: row.external_id,
    displayName: row.display_name,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTemplate(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    channelType: row.channel_type,
    name: row.name,
    category: row.category,
    language: row.language,
    content: row.content,
    variablesJson: row.variables_json,
    approvalStatus: row.approval_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOutboundMessage(row) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    channelId: row.channel_id,
    automationExecutionId: row.automation_execution_id,
    channelType: row.channel_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    templateId: row.template_id,
    messageType: row.message_type,
    recipientRef: row.recipient_ref,
    contentRendered: row.content_rendered,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    providerMessageId: row.provider_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listChannels(clinicId) {
  const result = await getPool().query(
    'select * from channels where clinic_id = $1 order by is_primary desc, channel_type asc, id asc',
    [clinicId]
  );

  return {
    items: result.rows.map(mapChannel)
  };
}

async function createChannel(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = validateChannelPayload(payload);
  await client.query('begin');

  try {
    if (normalized.isPrimary) {
      await client.query('update channels set is_primary = false, updated_at = now() where clinic_id = $1 and is_primary = true', [
        clinicContext.currentClinic.id
      ]);
    }

    const result = await client.query(
      `
        insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
        values ($1, $2, $3, $4, $5, $6::jsonb)
        returning *
      `,
      [
        clinicContext.currentClinic.id,
        normalized.channelType,
        normalized.name,
        normalized.status,
        normalized.isPrimary,
        JSON.stringify(normalized.configJson)
      ]
    );

    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'channel',
        entityId: result.rows[0].id,
        actionType: 'channel.create',
        actorUserId: clinicContext.currentUser.id,
        contextJson: {
          channelType: result.rows[0].channel_type,
          name: result.rows[0].name,
          isPrimary: result.rows[0].is_primary,
          status: result.rows[0].status
        }
      },
      client
    );

    await client.query('commit');
    return mapChannel(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function assertEntityBelongsToClinic(client, clinicId, entityType, entityId) {
  if (entityType === 'lead') {
    const result = await client.query('select id from leads where clinic_id = $1 and id = $2 limit 1', [clinicId, entityId]);

    if (result.rowCount === 0) {
      throw new AppError(404, 'ENTITY_NOT_FOUND', 'Lead not found in current clinic.');
    }

    return;
  }

  const result = await client.query('select id from customers where clinic_id = $1 and id = $2 limit 1', [clinicId, entityId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'ENTITY_NOT_FOUND', 'Customer not found in current clinic.');
  }
}

async function listContactIdentities(clinicId, searchParams) {
  const filters = parseContactIdentityFilters(searchParams);
  const result = await getPool().query(
    `
      select *
      from contact_identities
      where clinic_id = $1 and entity_type = $2 and entity_id = $3
      order by is_primary desc, id asc
    `,
    [clinicId, filters.entityType, filters.entityId]
  );

  return {
    items: result.rows.map(mapContactIdentity)
  };
}

async function createContactIdentity(clinicContext, payload) {
  const client = await getPool().connect();
  const normalized = validateContactIdentityPayload(payload);
  await client.query('begin');

  try {
    await assertEntityBelongsToClinic(client, clinicContext.currentClinic.id, normalized.entityType, normalized.entityId);

    if (normalized.isPrimary) {
      await client.query(
        `
          update contact_identities
          set is_primary = false, updated_at = now()
          where clinic_id = $1 and entity_type = $2 and entity_id = $3 and channel_type = $4 and is_primary = true
        `,
        [clinicContext.currentClinic.id, normalized.entityType, normalized.entityId, normalized.channelType]
      );
    }

    const result = await client.query(
      `
        insert into contact_identities (
          clinic_id,
          entity_type,
          entity_id,
          channel_type,
          external_id,
          display_name,
          is_primary
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        clinicContext.currentClinic.id,
        normalized.entityType,
        normalized.entityId,
        normalized.channelType,
        normalized.externalId,
        normalized.displayName,
        normalized.isPrimary
      ]
    );

    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: normalized.entityType,
        entityId: normalized.entityId,
        actionType: 'contact_identity.create',
        actorUserId: clinicContext.currentUser.id,
        contextJson: {
          contactIdentityId: result.rows[0].id,
          channelType: result.rows[0].channel_type,
          externalId: result.rows[0].external_id,
          isPrimary: result.rows[0].is_primary
        }
      },
      client
    );

    await client.query('commit');
    return mapContactIdentity(result.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function listTemplates(clinicId) {
  const result = await getPool().query(
    'select * from message_templates where clinic_id = $1 order by channel_type asc, name asc',
    [clinicId]
  );

  return {
    items: result.rows.map(mapTemplate)
  };
}

async function createTemplate(clinicContext, payload) {
  const normalized = validateTemplatePayload(payload, { partial: false });
  const result = await getPool().query(
    `
      insert into message_templates (
        clinic_id,
        channel_type,
        name,
        category,
        language,
        content,
        variables_json,
        approval_status
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      returning *
    `,
    [
      clinicContext.currentClinic.id,
      normalized.channelType,
      normalized.name,
      normalized.category,
      normalized.language,
      normalized.content,
      JSON.stringify(normalized.variablesJson),
      normalized.approvalStatus
    ]
  );

  return mapTemplate(result.rows[0]);
}

async function updateTemplate(clinicContext, templateId, payload) {
  const normalized = validateTemplatePayload(payload, { partial: true });
  const setClauses = [];
  const values = [clinicContext.currentClinic.id, templateId];
  const mappings = [
    ['channel_type', 'channelType'],
    ['name', 'name'],
    ['category', 'category'],
    ['language', 'language'],
    ['content', 'content'],
    ['approval_status', 'approvalStatus']
  ];

  for (const [column, key] of mappings) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      values.push(normalized[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'variablesJson')) {
    values.push(JSON.stringify(normalized.variablesJson));
    setClauses.push(`variables_json = $${values.length}::jsonb`);
  }

  if (setClauses.length === 0) {
    throw new AppError(400, 'INVALID_PAYLOAD', 'No valid template fields provided.');
  }

  values.push('now()');
  setClauses.push(`updated_at = ${'$'}${values.length}`);

  const result = await getPool().query(
    `
      update message_templates
      set ${setClauses.join(', ')}
      where clinic_id = $1 and id = $2
      returning *
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');
  }

  return mapTemplate(result.rows[0]);
}

async function resolveLeadRecipient(client, clinicId, leadId, channelType) {
  const identityResult = await client.query(
    `
      select external_id
      from contact_identities
      where clinic_id = $1 and entity_type = 'lead' and entity_id = $2 and channel_type = $3
      order by is_primary desc, id asc
      limit 1
    `,
    [clinicId, leadId, channelType]
  );

  if (identityResult.rowCount > 0) {
    return identityResult.rows[0].external_id;
  }

  const leadResult = await client.query(
    `
      select id, full_name, phone, line_user_id, email
      from leads
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, leadId]
  );

  if (leadResult.rowCount === 0) {
    throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
  }

  const lead = leadResult.rows[0];

  if (channelType === 'line') {
    return lead.line_user_id;
  }

  if (channelType === 'email') {
    return lead.email;
  }

  if (channelType === 'sms') {
    return lead.phone;
  }

  return null;
}

async function resolveCustomerRecipient(client, clinicId, customerId, channelType) {
  const identityResult = await client.query(
    `
      select external_id
      from contact_identities
      where clinic_id = $1 and entity_type = 'customer' and entity_id = $2 and channel_type = $3
      order by is_primary desc, id asc
      limit 1
    `,
    [clinicId, customerId, channelType]
  );

  if (identityResult.rowCount > 0) {
    return identityResult.rows[0].external_id;
  }

  const customerResult = await client.query(
    `
      select id, full_name, phone, email
      from customers
      where clinic_id = $1 and id = $2
      limit 1
    `,
    [clinicId, customerId]
  );

  if (customerResult.rowCount === 0) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
  }

  const customer = customerResult.rows[0];

  if (channelType === 'email') {
    return customer.email;
  }

  if (channelType === 'sms') {
    return customer.phone;
  }

  return null;
}

async function getMessageChannel(client, clinicId, channelId) {
  const result = await client.query('select * from channels where clinic_id = $1 and id = $2 limit 1', [clinicId, channelId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found.');
  }

  const channel = result.rows[0];

  if (channel.status !== 'active') {
    throw new AppError(400, 'CHANNEL_INACTIVE', 'Channel must be active to send messages.');
  }

  return channel;
}

async function getTemplate(client, clinicId, templateId) {
  const result = await client.query('select * from message_templates where clinic_id = $1 and id = $2 limit 1', [clinicId, templateId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');
  }

  return result.rows[0];
}

function resolveTemplateExpression(variables, expression) {
  return expression.split('.').reduce((currentValue, segment) => {
    if (!currentValue || typeof currentValue !== 'object') {
      return '';
    }

    return currentValue[segment];
  }, variables);
}

function renderContent(templateContent, variables) {
  return templateContent.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, expression) => {
    const resolved = resolveTemplateExpression(variables, expression);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

async function sendLeadOutboundMessage(clinicContext, leadId, payload, options = {}) {
  const client = await getPool().connect();
  const normalized = validateManualMessagePayload(payload);
  await client.query('begin');

  try {
    const channel = await getMessageChannel(client, clinicContext.currentClinic.id, normalized.channelId);
    const recipientRef = await resolveLeadRecipient(client, clinicContext.currentClinic.id, leadId, channel.channel_type);

    if (!recipientRef) {
      throw new AppError(400, 'RECIPIENT_NOT_FOUND', 'No recipient identity found for the requested channel.');
    }

    const leadResult = await client.query(
      'select id, workspace_id, full_name, nickname, phone, line_user_id, email, status, stage from leads where clinic_id = $1 and id = $2 limit 1',
      [clinicContext.currentClinic.id, leadId]
    );

    if (leadResult.rowCount === 0) {
      throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
    }

    const lead = leadResult.rows[0];

    let contentRendered = normalized.content;
    let templateId = null;
    let messageType = options.messageType || 'manual';

    if (normalized.templateId) {
      const template = await getTemplate(client, clinicContext.currentClinic.id, normalized.templateId);

      if (template.channel_type !== channel.channel_type) {
        throw new AppError(400, 'INVALID_TEMPLATE_CHANNEL', 'Template channelType must match the selected channel.');
      }

      const variables = {
        clinic: clinicContext.currentClinic,
        lead: {
          id: lead.id,
          fullName: lead.full_name,
          nickname: lead.nickname,
          phone: lead.phone,
          lineUserId: lead.line_user_id,
          email: lead.email,
          status: lead.status,
          stage: lead.stage
        },
        user: clinicContext.currentUser,
        ...normalized.variables
      };

      contentRendered = renderContent(template.content, variables);
      templateId = template.id;
      if (!options.messageType) {
        messageType = 'template';
      }
    }

    let providerResult;

    if (normalized.scheduledAt && new Date(normalized.scheduledAt).getTime() > Date.now()) {
      providerResult = {
        providerMessageId: null,
        status: 'pending',
        sentAt: null,
        deliveredAt: null,
        failureReason: null
      };
    } else {
      providerResult = await sendMessage({
        channelType: channel.channel_type,
        recipientRef,
        contentRendered
      });
    }

    const result = await client.query(
      `
        insert into outbound_messages (
          clinic_id,
          channel_id,
          entity_type,
          entity_id,
          automation_execution_id,
          template_id,
          message_type,
          recipient_ref,
          content_rendered,
          status,
          scheduled_at,
          sent_at,
          delivered_at,
          failed_at,
          failure_reason,
          provider_message_id
        )
        values ($1, $2, 'lead', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        returning *
      `,
      [
        clinicContext.currentClinic.id,
        channel.id,
        leadId,
        options.executionId || null,
        templateId,
        messageType,
        recipientRef,
        contentRendered,
        providerResult.status,
        normalized.scheduledAt,
        providerResult.sentAt,
        providerResult.deliveredAt,
        providerResult.status === 'failed' ? providerResult.sentAt : null,
        providerResult.failureReason,
        providerResult.providerMessageId
      ]
    );

    await client.query('commit');
    const outbound = mapOutboundMessage({ ...result.rows[0], channel_type: channel.channel_type });

    try {
      const { publishDomainEvent } = require('../event-bus/publisher');
      publishDomainEvent({
        clinicId: clinicContext.currentClinic.id,
        eventType: 'message.sent',
        entityType: 'lead',
        entityId: leadId,
        payloadJson: {
          outboundMessageId: outbound.id,
          channelType: channel.channel_type,
          messageType,
          status: outbound.status,
          workspaceId: lead.workspace_id,
          actorUserId: clinicContext.currentUser.id
        }
      }).catch((error) => {
        console.error('Event bus message.sent publish failed for lead:', error.message);
      });
    } catch (error) {
      console.error('Event bus message.sent publish failed for lead:', error.message);
    }

    return outbound;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function sendLeadManualMessage(clinicContext, leadId, payload) {
  return sendLeadOutboundMessage(clinicContext, leadId, payload);
}

async function sendCustomerOutboundMessage(clinicContext, customerId, payload, options = {}) {
  const client = await getPool().connect();
  const normalized = validateManualMessagePayload(payload);
  await client.query('begin');

  try {
    const channel = await getMessageChannel(client, clinicContext.currentClinic.id, normalized.channelId);
    const recipientRef = await resolveCustomerRecipient(client, clinicContext.currentClinic.id, customerId, channel.channel_type);

    if (!recipientRef) {
      throw new AppError(400, 'RECIPIENT_NOT_FOUND', 'No recipient identity found for the requested channel.');
    }

    const customerResult = await client.query(
      'select id, full_name, phone, email, status from customers where clinic_id = $1 and id = $2 limit 1',
      [clinicContext.currentClinic.id, customerId]
    );

    if (customerResult.rowCount === 0) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    }

    const customer = customerResult.rows[0];

    let contentRendered = normalized.content;
    let templateId = null;
    let messageType = options.messageType || 'manual';

    if (normalized.templateId) {
      const template = await getTemplate(client, clinicContext.currentClinic.id, normalized.templateId);

      if (template.channel_type !== channel.channel_type) {
        throw new AppError(400, 'INVALID_TEMPLATE_CHANNEL', 'Template channelType must match the selected channel.');
      }

      const variables = {
        clinic: clinicContext.currentClinic,
        customer: {
          id: customer.id,
          fullName: customer.full_name,
          phone: customer.phone,
          email: customer.email,
          status: customer.status
        },
        user: clinicContext.currentUser,
        ...normalized.variables
      };

      contentRendered = renderContent(template.content, variables);
      templateId = template.id;
      if (!options.messageType) {
        messageType = 'template';
      }
    }

    let providerResult;

    if (normalized.scheduledAt && new Date(normalized.scheduledAt).getTime() > Date.now()) {
      providerResult = {
        providerMessageId: null,
        status: 'pending',
        sentAt: null,
        deliveredAt: null,
        failureReason: null
      };
    } else {
      providerResult = await sendMessage({
        channelType: channel.channel_type,
        recipientRef,
        contentRendered
      });
    }

    const result = await client.query(
      `
        insert into outbound_messages (
          clinic_id,
          channel_id,
          entity_type,
          entity_id,
          automation_execution_id,
          template_id,
          message_type,
          recipient_ref,
          content_rendered,
          status,
          scheduled_at,
          sent_at,
          delivered_at,
          failed_at,
          failure_reason,
          provider_message_id
        )
        values ($1, $2, 'customer', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        returning *
      `,
      [
        clinicContext.currentClinic.id,
        channel.id,
        customerId,
        options.executionId || null,
        templateId,
        messageType,
        recipientRef,
        contentRendered,
        providerResult.status,
        normalized.scheduledAt,
        providerResult.sentAt,
        providerResult.deliveredAt,
        providerResult.status === 'failed' ? providerResult.sentAt : null,
        providerResult.failureReason,
        providerResult.providerMessageId
      ]
    );

    const { recordCustomerMessageEvent } = require('../customers/service');
    await recordCustomerMessageEvent(clinicContext.currentClinic.id, customerId, {
      outboundMessageId: result.rows[0].id,
      messageType,
      status: result.rows[0].status,
      channelType: channel.channel_type
    }, client);
    const { recordAuditLog } = require('../audit/service');
    await recordAuditLog(
      {
        clinicId: clinicContext.currentClinic.id,
        entityType: 'customer',
        entityId: customerId,
        actionType: 'message.send',
        actorUserId: clinicContext.currentUser.id,
        contextJson: {
          channelId: channel.id,
          channelType: channel.channel_type,
          messageType,
          outboundMessageId: result.rows[0].id,
          status: result.rows[0].status,
          integrationStatus: providerResult.integrationStatus || 'unknown'
        }
      },
      client
    );

    await client.query('commit');
    const outbound = mapOutboundMessage({ ...result.rows[0], channel_type: channel.channel_type });

    try {
      const { publishDomainEvent } = require('../event-bus/publisher');
      publishDomainEvent({
        clinicId: clinicContext.currentClinic.id,
        eventType: 'message.sent',
        entityType: 'customer',
        entityId: customerId,
        payloadJson: {
          outboundMessageId: outbound.id,
          channelType: channel.channel_type,
          messageType,
          status: outbound.status,
          actorUserId: clinicContext.currentUser.id
        }
      }).catch((error) => {
        console.error('Event bus message.sent publish failed for customer:', error.message);
      });
    } catch (error) {
      console.error('Event bus message.sent publish failed for customer:', error.message);
    }

    return outbound;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function sendCustomerManualMessage(clinicContext, customerId, payload) {
  return sendCustomerOutboundMessage(clinicContext, customerId, payload);
}

async function listOutboundMessages(clinicId, searchParams) {
  const filters = parseOutboundFilters(searchParams);
  const values = [clinicId];
  const clauses = ['om.clinic_id = $1'];

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`om.status = $${values.length}`);
  }

  if (filters.entityId) {
    values.push(filters.entityId);
    clauses.push(`om.entity_id = $${values.length}`);
  }

  if (filters.channelType) {
    values.push(filters.channelType);
    clauses.push(`ch.channel_type = $${values.length}`);
  }

  values.push(filters.limit);

  const result = await getPool().query(
    `
      select om.*, ch.channel_type
      from outbound_messages om
      inner join channels ch on ch.id = om.channel_id
      where ${clauses.join(' and ')}
      order by om.created_at desc, om.id desc
      limit $${values.length}
    `,
    values
  );

  return {
    items: result.rows.map(mapOutboundMessage),
    filters
  };
}

module.exports = {
  listChannels,
  createChannel,
  listContactIdentities,
  createContactIdentity,
  listTemplates,
  createTemplate,
  updateTemplate,
  sendLeadOutboundMessage,
  sendLeadManualMessage,
  sendCustomerOutboundMessage,
  sendCustomerManualMessage,
  listOutboundMessages
};
