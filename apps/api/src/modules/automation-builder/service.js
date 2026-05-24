const { getPool } = require('../../db');
const { AppError } = require('../../common/errors');

function buildScope(scopeOrContext) {
  if (typeof scopeOrContext === 'number') {
    return {
      clinicId: scopeOrContext,
      workspaceId: null,
      userId: null
    };
  }

  return {
    clinicId: scopeOrContext?.currentClinic?.id,
    workspaceId: scopeOrContext?.currentWorkspace?.id || null,
    userId: scopeOrContext?.currentUser?.id || null
  };
}

function assertScope(scope) {
  if (!scope?.clinicId) {
    throw new AppError(400, 'INVALID_CONTEXT', 'Builder actions require clinic context.');
  }

  return scope;
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAYLOAD', `${fieldName} must be an object.`);
  }

  return value;
}

function asNodePosition(value) {
  const position = asObject(value || {}, 'node.position');
  const x = Number(position.x || 0);
  const y = Number(position.y || 0);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

function sanitizeNodeConfig(type, config) {
  const normalized = asObject(config || {}, 'node.config');

  if (type === 'trigger') {
    const eventName = asTrimmedString(normalized.eventName);
    const entityType = asTrimmedString(normalized.entityType || 'lead') || 'lead';

    if (!eventName) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Trigger nodes require config.eventName.');
    }

    return {
      ...normalized,
      eventName,
      entityType
    };
  }

  if (type === 'action') {
    const actionType = asTrimmedString(normalized.actionType || normalized.action || 'create_task');

    if (!actionType) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Action nodes require config.actionType.');
    }

    return {
      ...normalized,
      actionType
    };
  }

  if (type === 'delay') {
    const delayMinutes = Number.parseInt(normalized.delayMinutes || normalized.minutes || '1', 10);

    if (!Number.isInteger(delayMinutes) || delayMinutes <= 0) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Delay nodes require a positive delayMinutes value.');
    }

    return {
      ...normalized,
      delayMinutes
    };
  }

  if (type === 'condition') {
    const field = asTrimmedString(normalized.field);
    const operator = asTrimmedString(normalized.operator);

    if (!field || !operator) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Condition nodes require config.field and config.operator.');
    }

    return {
      ...normalized,
      field,
      operator
    };
  }

  return normalized;
}

function normalizeBuilderDefinition(payload, fallbackFlow = {}) {
  if (payload && Array.isArray(payload.nodes)) {
    const nodes = payload.nodes.map((node, index) => {
      const id = asTrimmedString(node.id || `node-${index + 1}`);
      const type = asTrimmedString(node.type);

      if (!id || !['trigger', 'condition', 'action', 'delay'].includes(type)) {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Each node requires id and a supported type.');
      }

      return {
        id,
        type,
        position: asNodePosition(node.position),
        config: sanitizeNodeConfig(type, node.config || {})
      };
    });

    const edges = (Array.isArray(payload.edges) ? payload.edges : []).map((edge, index) => {
      const id = asTrimmedString(edge.id || `edge-${index + 1}`);
      const source = asTrimmedString(edge.source);
      const target = asTrimmedString(edge.target);

      if (!id || !source || !target) {
        throw new AppError(400, 'INVALID_PAYLOAD', 'Each edge requires id, source, and target.');
      }

      return {
        id,
        source,
        target
      };
    });

    return {
      name: asTrimmedString(payload.name || fallbackFlow.name || 'Untitled Flow'),
      flowType: asTrimmedString(payload.flowType || fallbackFlow.flow_type || fallbackFlow.flowType || 'visual_builder'),
      triggerType: 'event',
      status: asTrimmedString(payload.status || fallbackFlow.status || 'draft') || 'draft',
      nodes,
      edges
    };
  }

  const triggerNodeId = 'trigger-1';
  const trigger = payload?.trigger || {};
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const nodes = [
    {
      id: triggerNodeId,
      type: 'trigger',
      position: { x: 80, y: 120 },
      config: sanitizeNodeConfig('trigger', {
        eventName: trigger.eventName || fallbackFlow.trigger_event || fallbackFlow.triggerEvent || 'lead.created',
        entityType: trigger.entityType || fallbackFlow.entry_rule_json?.entityType || fallbackFlow.entryRuleJson?.entityType || 'lead'
      })
    }
  ];
  const edges = [];
  let previousNodeId = triggerNodeId;

  steps.forEach((step, index) => {
    const nodeId = `node-${index + 1}`;
    const stepType = asTrimmedString(step.stepType);
    let type = 'action';
    let config = { ...(step.configJson || {}) };

    if (stepType === 'condition') {
      type = 'condition';
    } else if (stepType === 'wait' || stepType === 'delay') {
      type = 'delay';
      config = {
        ...config,
        delayMinutes: step.delayMinutes || config.delayMinutes || config.minutes || 1
      };
    } else {
      config = {
        ...config,
        actionType: stepType || config.actionType || 'create_task'
      };
    }

    nodes.push({
      id: nodeId,
      type,
      position: { x: 320 + index * 220, y: 120 + (index % 2) * 120 },
      config: sanitizeNodeConfig(type, config)
    });
    edges.push({
      id: `edge-${index + 1}`,
      source: previousNodeId,
      target: nodeId
    });
    previousNodeId = nodeId;
  });

  return {
    name: asTrimmedString(payload?.name || fallbackFlow.name || 'Untitled Flow'),
    flowType: asTrimmedString(payload?.flowType || fallbackFlow.flow_type || fallbackFlow.flowType || 'visual_builder'),
    triggerType: 'event',
    status: asTrimmedString(payload?.status || fallbackFlow.status || 'draft') || 'draft',
    nodes,
    edges
  };
}

function analyzeGraph(definition) {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const incoming = new Map(definition.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(definition.nodes.map((node) => [node.id, []]));

  definition.edges.forEach((edge) => {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      throw new AppError(400, 'INVALID_FLOW', 'Edges must reference existing nodes.');
    }

    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source).push(edge.target);
  });

  const triggerNodes = definition.nodes.filter((node) => node.type === 'trigger');
  const actionNodes = definition.nodes.filter((node) => node.type === 'action');

  if (triggerNodes.length !== 1) {
    throw new AppError(400, 'INVALID_FLOW', 'Flow must contain exactly 1 trigger node.');
  }

  if (actionNodes.length < 1) {
    throw new AppError(400, 'INVALID_FLOW', 'Flow must contain at least 1 action node.');
  }

  const triggerNode = triggerNodes[0];
  const visited = new Set();
  const stack = [triggerNode.id];

  while (stack.length > 0) {
    const current = stack.pop();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    (outgoing.get(current) || []).forEach((target) => {
      if (!visited.has(target)) {
        stack.push(target);
      }
    });
  }

  if (visited.size !== definition.nodes.length) {
    throw new AppError(400, 'INVALID_FLOW', 'Flow cannot contain disconnected nodes.');
  }

  const reachableIncoming = new Map();
  definition.nodes.forEach((node) => {
    reachableIncoming.set(node.id, incoming.get(node.id) || 0);
  });

  const queue = [];
  definition.nodes.forEach((node) => {
    if ((reachableIncoming.get(node.id) || 0) === 0) {
      queue.push(node.id);
    }
  });

  const orderedNodeIds = [];

  while (queue.length > 0) {
    const current = queue.shift();
    orderedNodeIds.push(current);

    (outgoing.get(current) || []).forEach((target) => {
      const nextCount = (reachableIncoming.get(target) || 0) - 1;
      reachableIncoming.set(target, nextCount);

      if (nextCount === 0) {
        queue.push(target);
      }
    });
  }

  if (orderedNodeIds.length !== definition.nodes.length) {
    throw new AppError(400, 'INVALID_FLOW', 'Flow cannot contain circular loops.');
  }

  return {
    triggerNode,
    orderedNodes: orderedNodeIds.map((nodeId) => nodesById.get(nodeId))
  };
}

function validateBuilderDefinition(payload, fallbackFlow = {}) {
  const normalized = normalizeBuilderDefinition(payload, fallbackFlow);
  analyzeGraph(normalized);
  return normalized;
}

function toRuntimeStep(node, order) {
  if (node.type === 'condition') {
    return {
      stepOrder: order,
      stepType: 'condition',
      delayMinutes: null,
      configJson: {
        nodeId: node.id,
        field: node.config.field,
        operator: node.config.operator,
        value: node.config.value
      }
    };
  }

  if (node.type === 'delay') {
    return {
      stepOrder: order,
      stepType: 'wait',
      delayMinutes: node.config.delayMinutes,
      configJson: {
        ...node.config,
        nodeId: node.id,
        delayMinutes: node.config.delayMinutes,
        minutes: node.config.delayMinutes,
        blocking: node.config.blocking !== false
      }
    };
  }

  return {
    stepOrder: order,
    stepType: node.config.actionType,
    delayMinutes: null,
    configJson: {
      ...node.config,
      nodeId: node.id
    }
  };
}

function toRuntimeArtifacts(definition) {
  const { triggerNode, orderedNodes } = analyzeGraph(definition);
  const orderedSteps = orderedNodes
    .filter((node) => node.id !== triggerNode.id)
    .map((node, index) => toRuntimeStep(node, index + 1));

  return {
    triggerEvent: triggerNode.config.eventName,
    entryRuleJson: {
      eventName: triggerNode.config.eventName,
      entityType: triggerNode.config.entityType || 'lead',
      guardConditions: {},
      rateLimits: {}
    },
    definitionJson: {
      trigger: triggerNode.config.eventName,
      entityType: triggerNode.config.entityType || 'lead',
      conditions: {},
      rateLimits: {},
      steps: orderedSteps.map((step) => {
        if (step.stepType === 'condition') {
          return {
            type: 'condition',
            field: step.configJson.field,
            operator: step.configJson.operator,
            value: step.configJson.value,
            nodeId: step.configJson.nodeId
          };
        }

        if (step.stepType === 'wait') {
          return {
            type: 'delay',
            minutes: step.delayMinutes || 1,
            blocking: step.configJson.blocking !== false,
            nodeId: step.configJson.nodeId
          };
        }

        return {
          type: 'action',
          action: step.stepType,
          ...step.configJson
        };
      }),
      graph: {
        nodes: definition.nodes,
        edges: definition.edges
      }
    },
    steps: orderedSteps
  };
}

function mapFlowVersion(row) {
  return row
    ? {
      id: row.id,
      flowId: row.flow_id,
      versionNumber: row.version_number || row.version,
      definitionJson: row.definition_json || row.config_json || {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      isPublished: row.is_published === true
    }
    : null;
}

function mapBuilderFlow(row, latestVersion, publishedVersion) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    workspaceId: row.workspace_id,
    name: row.name,
    flowType: row.flow_type,
    triggerType: row.trigger_type,
    triggerEvent: row.trigger_event,
    status: row.status,
    version: row.version,
    currentVersionId: row.current_version_id,
    isPublished: row.is_published === true,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestVersion: mapFlowVersion(latestVersion),
    publishedVersion: mapFlowVersion(publishedVersion)
  };
}

async function findFlowRow(client, scope, flowId) {
  const values = [scope.clinicId, flowId];
  const clauses = ['clinic_id = $1', 'id = $2'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`workspace_id = $${values.length}`);
  }

  const result = await client.query(
    `
      select *
      from automation_flows
      where ${clauses.join(' and ')}
      limit 1
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'FLOW_NOT_FOUND', 'Automation flow not found.');
  }

  return result.rows[0];
}

async function getLatestVersionRow(client, scope, flowId) {
  const result = await client.query(
    `
      select *
      from automation_flow_versions
      where clinic_id = $1 and flow_id = $2
      order by version_number desc, id desc
      limit 1
    `,
    [scope.clinicId, flowId]
  );

  return result.rows[0] || null;
}

async function getPublishedVersionRow(client, scope, flowId) {
  const result = await client.query(
    `
      select *
      from automation_flow_versions
      where clinic_id = $1 and flow_id = $2 and is_published = true
      order by version_number desc, id desc
      limit 1
    `,
    [scope.clinicId, flowId]
  );

  return result.rows[0] || null;
}

async function syncFlowSteps(client, clinicId, flowId, steps) {
  await client.query('delete from automation_steps where clinic_id = $1 and flow_id = $2', [clinicId, flowId]);

  for (const step of steps) {
    await client.query(
      `
        insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [clinicId, flowId, step.stepOrder, step.stepType, step.delayMinutes, JSON.stringify(step.configJson || {})]
    );
  }
}

async function insertVersionRow(client, scope, flowId, definition, versionNumber, createdBy) {
  const result = await client.query(
    `
      insert into automation_flow_versions (
        clinic_id,
        flow_id,
        version,
        version_number,
        config_json,
        definition_json,
        created_by,
        is_published
      )
      values ($1, $2, $3, $3, $4::jsonb, $4::jsonb, $5, false)
      returning *
    `,
    [scope.clinicId, flowId, versionNumber, JSON.stringify(definition), createdBy || null]
  );

  return result.rows[0];
}

async function recordAudit(client, scope, flowId, actionType, actorUserId, contextJson = {}) {
  const { recordAuditLog } = require('../audit/service');
  await recordAuditLog(
    {
      clinicId: scope.clinicId,
      entityType: 'automation_flow',
      entityId: flowId,
      actionType,
      actorUserId: actorUserId || null,
      contextJson: {
        workspaceId: scope.workspaceId || null,
        ...contextJson
      }
    },
    client
  );
}

function emitBuilderEvent(eventType, scope, flowId, payloadJson) {
  try {
    const { publishDomainEvent } = require('../event-bus/publisher');
    publishDomainEvent({
      clinicId: scope.clinicId,
      eventType,
      entityType: 'automation_flow',
      entityId: flowId,
      payloadJson: {
        workspaceId: scope.workspaceId || null,
        ...payloadJson
      }
    }).catch(() => {});
  } catch (error) {
    console.error(`Builder event publish failed for ${eventType}:`, error.message);
  }
}

async function listBuilderFlows(scopeOrContext) {
  const scope = assertScope(buildScope(scopeOrContext));
  const result = await getPool().query(
    `
      select af.*,
        lv.id as latest_version_id,
        lv.version_number as latest_version_number,
        lv.definition_json as latest_definition_json,
        lv.created_by as latest_created_by,
        lv.created_at as latest_created_at,
        lv.is_published as latest_is_published,
        pv.id as published_version_id,
        pv.version_number as published_version_number,
        pv.definition_json as published_definition_json,
        pv.created_by as published_created_by,
        pv.created_at as published_created_at,
        pv.is_published as published_is_published
      from automation_flows af
      left join lateral (
        select *
        from automation_flow_versions afv
        where afv.flow_id = af.id
        order by afv.version_number desc, afv.id desc
        limit 1
      ) lv on true
      left join lateral (
        select *
        from automation_flow_versions afv
        where afv.flow_id = af.id
          and afv.is_published = true
        order by afv.version_number desc, afv.id desc
        limit 1
      ) pv on true
      where af.clinic_id = $1
        ${scope.workspaceId ? 'and af.workspace_id = $2' : ''}
      order by af.updated_at desc, af.id desc
    `,
    scope.workspaceId ? [scope.clinicId, scope.workspaceId] : [scope.clinicId]
  );

  return {
    items: result.rows.map((row) => mapBuilderFlow(
      row,
      row.latest_version_id ? {
        id: row.latest_version_id,
        flow_id: row.id,
        version_number: row.latest_version_number,
        definition_json: row.latest_definition_json,
        created_by: row.latest_created_by,
        created_at: row.latest_created_at,
        is_published: row.latest_is_published
      } : null,
      row.published_version_id ? {
        id: row.published_version_id,
        flow_id: row.id,
        version_number: row.published_version_number,
        definition_json: row.published_definition_json,
        created_by: row.published_created_by,
        created_at: row.published_created_at,
        is_published: row.published_is_published
      } : null
    ))
  };
}

async function getBuilderFlow(scopeOrContext, flowId) {
  const scope = assertScope(buildScope(scopeOrContext));
  const client = getPool();
  const flowRow = await findFlowRow(client, scope, flowId);
  const [latestVersion, publishedVersion] = await Promise.all([
    getLatestVersionRow(client, scope, flowId),
    getPublishedVersionRow(client, scope, flowId)
  ]);

  return mapBuilderFlow(flowRow, latestVersion, publishedVersion);
}

async function createBuilderFlow(clinicContext, payload) {
  const scope = assertScope(buildScope(clinicContext));
  const definition = validateBuilderDefinition(payload);
  const runtime = toRuntimeArtifacts(definition);
  const shouldPublishImmediately = asTrimmedString(payload?.status || definition.status) === 'active';
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const flowResult = await client.query(
      `
        insert into automation_flows (
          clinic_id,
          workspace_id,
          name,
          flow_type,
          trigger_type,
          trigger_event,
          status,
          version,
          definition_json,
          entry_rule_json,
          created_by,
          current_version_id,
          is_published
        )
        values ($1, $2, $3, $4, 'event', $5, 'draft', 1, $6::jsonb, $7::jsonb, $8, null, false)
        returning *
      `,
      [
        scope.clinicId,
        scope.workspaceId,
        definition.name,
        definition.flowType,
        runtime.triggerEvent,
        JSON.stringify(runtime.definitionJson),
        JSON.stringify(runtime.entryRuleJson),
        scope.userId
      ]
    );

    await syncFlowSteps(client, scope.clinicId, flowResult.rows[0].id, runtime.steps);
    const versionRow = await insertVersionRow(client, scope, flowResult.rows[0].id, definition, 1, scope.userId);

    if (shouldPublishImmediately) {
      await client.query('update automation_flow_versions set is_published = true where id = $1', [versionRow.id]);
      await client.query(
        `
          update automation_flows
          set status = 'active',
              current_version_id = $3,
              is_published = true,
              updated_at = now()
          where clinic_id = $1 and id = $2
        `,
        [scope.clinicId, flowResult.rows[0].id, versionRow.id]
      );
    }

    await recordAudit(client, scope, flowResult.rows[0].id, 'flow.created', scope.userId, {
      versionId: versionRow.id,
      versionNumber: 1
    });
    await recordAudit(client, scope, flowResult.rows[0].id, 'flow.version_created', scope.userId, {
      versionId: versionRow.id,
      versionNumber: 1
    });
    if (shouldPublishImmediately) {
      await recordAudit(client, scope, flowResult.rows[0].id, 'flow.published', scope.userId, {
        versionId: versionRow.id,
        versionNumber: 1
      });
    }
    await client.query('commit');
    emitBuilderEvent('flow.version_created', scope, flowResult.rows[0].id, {
      versionId: versionRow.id,
      versionNumber: 1,
      actorUserId: scope.userId
    });
    if (shouldPublishImmediately) {
      emitBuilderEvent('flow.published', scope, flowResult.rows[0].id, {
        versionId: versionRow.id,
        versionNumber: 1,
        actorUserId: scope.userId
      });
    }

    return getBuilderFlow(clinicContext, flowResult.rows[0].id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createFlowVersion(clinicContext, flowId, payload) {
  const scope = assertScope(buildScope(clinicContext));
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const flowRow = await findFlowRow(client, scope, flowId);
    const definition = validateBuilderDefinition(payload, flowRow);
    const versionResult = await client.query(
      `
        select coalesce(max(version_number), 0) as latest_version_number
        from automation_flow_versions
        where clinic_id = $1 and flow_id = $2
      `,
      [scope.clinicId, flowId]
    );
    const nextVersionNumber = Number(versionResult.rows[0].latest_version_number || 0) + 1;
    const runtime = toRuntimeArtifacts(definition);
    const versionRow = await insertVersionRow(client, scope, flowId, definition, nextVersionNumber, scope.userId);

    if (scope.workspaceId) {
      await client.query(
        `
          update automation_flows
          set name = $4,
              flow_type = $5,
              trigger_event = $6,
              version = $7,
              updated_at = now()
          where clinic_id = $1 and id = $2 and workspace_id = $3
        `,
        [scope.clinicId, flowId, scope.workspaceId, definition.name, definition.flowType, runtime.triggerEvent, nextVersionNumber]
      );
    } else {
      await client.query(
        `
          update automation_flows
          set name = $3,
              flow_type = $4,
              trigger_event = $5,
              version = $6,
              updated_at = now()
          where clinic_id = $1 and id = $2
        `,
        [scope.clinicId, flowId, definition.name, definition.flowType, runtime.triggerEvent, nextVersionNumber]
      );
    }

    if (!flowRow.is_published) {
      await client.query(
        `
          update automation_flows
          set definition_json = $3::jsonb,
              entry_rule_json = $4::jsonb,
              updated_at = now()
          where clinic_id = $1 and id = $2
        `,
        [scope.clinicId, flowId, JSON.stringify(runtime.definitionJson), JSON.stringify(runtime.entryRuleJson)]
      );
      await syncFlowSteps(client, scope.clinicId, flowId, runtime.steps);
    }

    await recordAudit(client, scope, flowId, 'flow.updated', scope.userId, {
      versionId: versionRow.id,
      versionNumber: nextVersionNumber,
      draftOnly: true
    });
    await recordAudit(client, scope, flowId, 'flow.version_created', scope.userId, {
      versionId: versionRow.id,
      versionNumber: nextVersionNumber
    });
    await client.query('commit');
    emitBuilderEvent('flow.version_created', scope, flowId, {
      versionId: versionRow.id,
      versionNumber: nextVersionNumber,
      actorUserId: scope.userId
    });

    return mapFlowVersion(versionRow);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function updateBuilderFlow(clinicContext, flowId, payload) {
  return createFlowVersion(clinicContext, flowId, payload);
}

async function addBuilderFlowStep(clinicContext, flowId, payload) {
  const scope = assertScope(buildScope(clinicContext));
  const client = getPool();
  const flowRow = await findFlowRow(client, scope, flowId);
  const latestVersion = await getLatestVersionRow(client, scope, flowId);
  const definition = validateBuilderDefinition(latestVersion?.definition_json || {}, flowRow);
  const stepType = asTrimmedString(payload.stepType);
  const nodeType = stepType === 'condition' ? 'condition' : stepType === 'wait' || stepType === 'delay' ? 'delay' : 'action';
  const newNodeId = `node-${Date.now()}`;
  const lastNode = definition.nodes[definition.nodes.length - 1];
  const config = nodeType === 'action'
    ? { ...(payload.configJson || {}), actionType: stepType || payload.configJson?.actionType || 'create_task' }
    : nodeType === 'delay'
      ? { ...(payload.configJson || {}), delayMinutes: payload.delayMinutes || payload.configJson?.delayMinutes || 1 }
      : { ...(payload.configJson || {}) };

  definition.nodes.push({
    id: newNodeId,
    type: nodeType,
    position: { x: (lastNode?.position?.x || 80) + 220, y: lastNode?.position?.y || 120 },
    config: sanitizeNodeConfig(nodeType, config)
  });
  definition.edges.push({
    id: `edge-${Date.now()}`,
    source: lastNode.id,
    target: newNodeId
  });

  return createFlowVersion(clinicContext, flowId, definition);
}

async function listFlowVersions(scopeOrContext, flowId) {
  const scope = assertScope(buildScope(scopeOrContext));
  const client = getPool();
  await findFlowRow(client, scope, flowId);
  const result = await client.query(
    `
      select *
      from automation_flow_versions
      where clinic_id = $1 and flow_id = $2
      order by version_number desc, id desc
    `,
    [scope.clinicId, flowId]
  );

  return {
    items: result.rows.map(mapFlowVersion)
  };
}

async function getFlowVersionDetail(scopeOrContext, flowId, versionId) {
  const scope = assertScope(buildScope(scopeOrContext));
  const client = getPool();
  await findFlowRow(client, scope, flowId);
  const result = await client.query(
    `
      select *
      from automation_flow_versions
      where clinic_id = $1 and flow_id = $2 and id = $3
      limit 1
    `,
    [scope.clinicId, flowId, versionId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'FLOW_VERSION_NOT_FOUND', 'Automation flow version not found.');
  }

  return mapFlowVersion(result.rows[0]);
}

async function publishFlowVersion(clinicContext, flowId, versionId) {
  const scope = assertScope(buildScope(clinicContext));
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const flowRow = await findFlowRow(client, scope, flowId);
    const versionResult = await client.query(
      `
        select *
        from automation_flow_versions
        where clinic_id = $1 and flow_id = $2 and id = $3
        limit 1
      `,
      [scope.clinicId, flowId, versionId]
    );

    if (versionResult.rowCount === 0) {
      throw new AppError(404, 'FLOW_VERSION_NOT_FOUND', 'Automation flow version not found.');
    }

    const versionRow = versionResult.rows[0];
    const definition = validateBuilderDefinition(versionRow.definition_json || {}, flowRow);
    const runtime = toRuntimeArtifacts(definition);

    await client.query(
      `
        update automation_flow_versions
        set is_published = false
        where clinic_id = $1 and flow_id = $2 and is_published = true
      `,
      [scope.clinicId, flowId]
    );
    await client.query(
      `
        update automation_flow_versions
        set is_published = true
        where id = $1
      `,
      [versionId]
    );

    if (scope.workspaceId) {
      await client.query(
        `
          update automation_flows
          set name = $4,
              flow_type = $5,
              trigger_type = 'event',
              trigger_event = $6,
              status = 'active',
              version = $7,
              definition_json = $8::jsonb,
              entry_rule_json = $9::jsonb,
              current_version_id = $10,
              is_published = true,
              updated_at = now()
          where clinic_id = $1 and id = $2 and workspace_id = $3
        `,
        [
          scope.clinicId,
          flowId,
          scope.workspaceId,
          definition.name,
          definition.flowType,
          runtime.triggerEvent,
          versionRow.version_number,
          JSON.stringify(runtime.definitionJson),
          JSON.stringify(runtime.entryRuleJson),
          versionId
        ]
      );
    } else {
      await client.query(
        `
          update automation_flows
          set name = $3,
              flow_type = $4,
              trigger_type = 'event',
              trigger_event = $5,
              status = 'active',
              version = $6,
              definition_json = $7::jsonb,
              entry_rule_json = $8::jsonb,
              current_version_id = $9,
              is_published = true,
              updated_at = now()
          where clinic_id = $1 and id = $2
        `,
        [
          scope.clinicId,
          flowId,
          definition.name,
          definition.flowType,
          runtime.triggerEvent,
          versionRow.version_number,
          JSON.stringify(runtime.definitionJson),
          JSON.stringify(runtime.entryRuleJson),
          versionId
        ]
      );
    }

    await syncFlowSteps(client, scope.clinicId, flowId, runtime.steps);
    await recordAudit(client, scope, flowId, 'flow.published', scope.userId, {
      versionId,
      versionNumber: versionRow.version_number
    });
    await client.query('commit');
    emitBuilderEvent('flow.published', scope, flowId, {
      versionId,
      versionNumber: versionRow.version_number,
      actorUserId: scope.userId
    });

    return getBuilderFlow(clinicContext, flowId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function getExecutionSteps(scopeOrContext, executionId) {
  const scope = assertScope(buildScope(scopeOrContext));
  const values = [scope.clinicId, executionId];
  const clauses = ['ae.clinic_id = $1', 'ae.id = $2'];

  if (scope.workspaceId) {
    values.push(scope.workspaceId);
    clauses.push(`ae.workspace_id = $${values.length}`);
  }

  const executionResult = await getPool().query(
    `
      select ae.id
      from automation_executions ae
      where ${clauses.join(' and ')}
      limit 1
    `,
    values
  );

  if (executionResult.rowCount === 0) {
    throw new AppError(404, 'EXECUTION_NOT_FOUND', 'Automation execution not found.');
  }

  const stepsResult = await getPool().query(
    `
      select
        ase.id as step_execution_id,
        ase.execution_id,
        ase.step_id,
        ase.status,
        ase.result_json,
        ase.started_at,
        ase.completed_at,
        s.step_order,
        s.step_type,
        s.config_json,
        log.detail_json
      from automation_step_executions ase
      left join automation_steps s on s.id = ase.step_id
      left join lateral (
        select l.detail_json
        from automation_execution_logs l
        where l.execution_id = ase.execution_id
          and l.step_order = s.step_order
        order by l.id desc
        limit 1
      ) log on true
      where ase.execution_id = $1
      order by coalesce(s.step_order, 0) asc, ase.id asc
    `,
    [executionId]
  );

  return {
    items: stepsResult.rows.map((row) => {
      const inputData = row.result_json?.inputData || row.detail_json?.inputData || row.config_json || {};
      const outputData = row.result_json?.outputData
        || row.result_json?.output
        || (row.status === 'completed' ? row.result_json : null)
        || null;
      const error = row.result_json?.error || row.detail_json?.message || (row.status === 'failed' ? row.detail_json : null) || null;
      const duration = row.started_at && row.completed_at
        ? Math.max(new Date(row.completed_at).getTime() - new Date(row.started_at).getTime(), 0)
        : null;

      return {
        step_execution_id: Number(row.step_execution_id),
        step_id: Number(row.step_id),
        step_type: row.step_type,
        status: row.status,
        input_data: inputData,
        output_data: outputData,
        error,
        duration
      };
    })
  };
}

module.exports = {
  validateBuilderDefinition,
  listBuilderFlows,
  getBuilderFlow,
  createBuilderFlow,
  updateBuilderFlow,
  addBuilderFlowStep,
  createFlowVersion,
  listFlowVersions,
  getFlowVersionDetail,
  publishFlowVersion,
  getExecutionSteps
};
