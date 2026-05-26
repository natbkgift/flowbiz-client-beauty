const { getPool, closePool } = require('../apps/api/src/db');
const { hashPassword } = require('../apps/api/src/modules/auth/password');
const { login } = require('../apps/api/src/modules/auth/service');

const DEMO = {
  marker: 'flowbiz-beauty-demo',
  clinicName: 'FlowBiz Beauty Demo Clinic',
  clinicSlug: 'flowbiz-beauty-demo',
  organizationName: 'FlowBiz Beauty Demo Organization',
  organizationSlug: 'flowbiz-beauty-demo-org',
  workspaceName: 'Beauty Revenue Workspace',
  workspaceSlug: 'beauty-revenue',
  password: 'DemoPass123!',
  users: [
    { email: 'owner.demo@flowbiz.local', name: 'Demo Owner', role: 'owner' },
    { email: 'admin.demo@flowbiz.local', name: 'Demo Admin', role: 'admin' },
    { email: 'operator.demo@flowbiz.local', name: 'Demo Operator', role: 'operator' }
  ]
};

const LEADS = [
  {
    key: 'facebook-new-lead',
    source: 'facebook',
    fullName: 'ฟ้าใส สนใจโบท็อกซ์',
    phone: '0810007001',
    email: 'fahsai.demo@example.com',
    lineUserId: 'U-demo-fahsai',
    status: 'new',
    stage: 'inquiry',
    intentScore: 62,
    budgetRange: '3,000-8,000',
    preferredBranch: 'Siam',
    notesSummary: 'Lead จาก Facebook Ads สนใจ Botox ลดริ้วรอย ต้องการราคาโปร',
    interests: ['Botox', 'Wrinkle reduction'],
    tags: ['facebook', 'new-lead']
  },
  {
    key: 'line-new-lead',
    source: 'line',
    fullName: 'มายด์ ทักไลน์เรื่องฟิลเลอร์',
    phone: '0810007002',
    email: 'mind.demo@example.com',
    lineUserId: 'U-demo-mind',
    status: 'new',
    stage: 'inquiry',
    intentScore: 68,
    budgetRange: '10,000-25,000',
    preferredBranch: 'Thonglor',
    notesSummary: 'Lead จาก LINE OA สนใจ filler คางและใต้ตา',
    interests: ['Filler', 'Under-eye filler'],
    tags: ['line', 'new-lead']
  },
  {
    key: 'hot-lead',
    source: 'facebook',
    fullName: 'คุณแพร Hot Lead',
    phone: '0810007003',
    email: 'prae.demo@example.com',
    lineUserId: 'U-demo-prae',
    status: 'active',
    stage: 'qualified',
    intentScore: 92,
    budgetRange: '30,000+',
    preferredBranch: 'Siam',
    notesSummary: 'Hot lead พร้อมจอง consult สนใจ Botox + HIFU package',
    interests: ['Botox', 'HIFU'],
    tags: ['hot-lead', 'qualified']
  },
  {
    key: 'cold-lead',
    source: 'website',
    fullName: 'คุณบี Cold Lead',
    phone: '0810007004',
    email: 'bee.demo@example.com',
    lineUserId: 'U-demo-bee',
    status: 'new',
    stage: 'inquiry',
    intentScore: 28,
    budgetRange: 'ยังไม่ระบุ',
    preferredBranch: 'Online',
    notesSummary: 'Cold lead อ่าน landing page แต่ยังไม่ตอบกลับ',
    interests: ['Skin consultation'],
    tags: ['cold-lead']
  },
  {
    key: 'no-show-lead',
    source: 'line',
    fullName: 'คุณจูน No-show',
    phone: '0810007005',
    email: 'june.demo@example.com',
    lineUserId: 'U-demo-june',
    status: 'active',
    stage: 'no_show',
    intentScore: 74,
    budgetRange: '8,000-15,000',
    preferredBranch: 'Rama 9',
    notesSummary: 'No-show consult เมื่อวาน ต้อง recovery แบบนุ่มนวล',
    interests: ['Meso aura', 'Consult booking'],
    tags: ['no-show', 'recovery']
  },
  {
    key: 'uncontacted-lead',
    source: 'referral',
    fullName: 'คุณนุ่น Uncontacted',
    phone: '0810007006',
    email: 'noon.demo@example.com',
    lineUserId: 'U-demo-noon',
    status: 'new',
    stage: 'inquiry',
    intentScore: 55,
    budgetRange: '5,000-12,000',
    preferredBranch: 'Siam',
    notesSummary: 'Referral lead ยังไม่มี staff contact ต้อง alert',
    interests: ['Acne care'],
    tags: ['uncontacted', 'referral']
  }
];

const CUSTOMERS = [
  {
    key: 'botox-repeat',
    fullName: 'คุณแอน Botox Due',
    phone: '0820007101',
    email: 'ann.botox.demo@example.com',
    lineExternalId: 'U-demo-ann-botox',
    status: 'vip',
    tags: ['botox', 'repeat-due', 'vip'],
    treatment: 'Botox',
    performedMonthsAgo: 4,
    dueInMonths: 0,
    note: 'Botox customer ครบ cycle ประมาณ 4 เดือน เหมาะกับ repeat reminder'
  },
  {
    key: 'filler-repeat',
    fullName: 'คุณพลอย Filler Due',
    phone: '0820007102',
    email: 'ploy.filler.demo@example.com',
    lineExternalId: 'U-demo-ploy-filler',
    status: 'active',
    tags: ['filler', 'repeat-due'],
    treatment: 'Filler',
    performedMonthsAgo: 6,
    dueInMonths: 0,
    note: 'Filler customer ครบ cycle ประมาณ 6 เดือน ควรให้ staff follow-up'
  },
  {
    key: 'aftercare',
    fullName: 'คุณออม Aftercare',
    phone: '0820007103',
    email: 'aom.aftercare.demo@example.com',
    lineExternalId: 'U-demo-aom-aftercare',
    status: 'active',
    tags: ['aftercare', 'review-request'],
    treatment: 'Meso Aura',
    performedMonthsAgo: 0,
    dueInMonths: 1,
    note: 'Aftercare customer พร้อมส่ง review request หลังติดตามอาการ'
  }
];

const TEMPLATES = [
  ['lead_welcome_beauty', 'followup', 'สวัสดีค่ะ {{lead.fullName}} ขอบคุณที่สนใจ FlowBiz Beauty Clinic ทีมงานได้รับข้อมูลแล้วและจะช่วยดูแลขั้นตอนถัดไปค่ะ'],
  ['uncontacted_lead_alert', 'followup', 'มี lead ใหม่ {{lead.fullName}} ยังไม่มีการติดต่อกลับ กรุณาติดตามภายในวันนี้'],
  ['lead_qualification_nurture', 'followup', 'สวัสดีค่ะ {{lead.fullName}} เพื่อให้ทีมช่วยแนะนำได้ตรงขึ้น สนใจปรึกษาเรื่องใดเป็นพิเศษคะ'],
  ['no_show_recovery', 'reactivation', 'สวัสดีค่ะ {{lead.fullName}} เห็นว่าวันนัดล่าสุดอาจไม่สะดวก ทีมงานช่วยดูรอบนัดใหม่ให้ได้ค่ะ'],
  ['review_request', 'review_request', 'ขอบคุณที่ไว้วางใจคลินิกนะคะ หากสะดวกสามารถแบ่งปันประสบการณ์เพื่อช่วยให้ทีมปรับปรุงการดูแลได้ค่ะ'],
  ['botox_cycle_reminder', 'reminder', 'สวัสดีค่ะ {{customer.fullName}} ถึงรอบที่ควรปรึกษาเรื่อง Botox อีกครั้งแล้ว ทีมงานช่วยเช็กข้อมูลเดิมให้ได้ค่ะ'],
  ['filler_cycle_reminder', 'reminder', 'สวัสดีค่ะ {{customer.fullName}} ถึงรอบที่ควรปรึกษาเรื่อง Filler อีกครั้งแล้ว ทีมงานช่วยจัดเวลาปรึกษาให้ได้ค่ะ'],
  ['daily_marketing_reminder', 'followup', 'วันนี้มี lead และลูกค้าที่ควรติดตาม กรุณาตรวจ HITL queue และ automation dashboard ค่ะ']
];

const FLOWS = [
  ['new_lead_welcome', 'New Lead Welcome', 'lead.created', 'lead_welcome_beauty', 'send_message'],
  ['uncontacted_lead_alert', 'Uncontacted Lead Alert', 'lead.created', 'uncontacted_lead_alert', 'notify_user'],
  ['lead_qualification_nurture', 'Lead Qualification Nurture', 'lead.stage.updated', 'lead_qualification_nurture', 'send_message'],
  ['no_show_recovery', 'No-Show Recovery', 'lead.stage.updated', 'no_show_recovery', 'send_message'],
  ['review_request', 'Review Request', 'customer.aftercare.completed', 'review_request', 'send_message'],
  ['botox_cycle_reminder', 'Botox Cycle Reminder', 'customer.repeat_due', 'botox_cycle_reminder', 'send_message'],
  ['filler_cycle_reminder', 'Filler Cycle Reminder', 'customer.repeat_due', 'filler_cycle_reminder', 'send_message'],
  ['daily_marketing_reminder', 'Daily Marketing Reminder', 'daily.marketing_review', 'daily_marketing_reminder', 'create_task']
];

function monthsAgo(months) {
  const value = new Date();
  value.setMonth(value.getMonth() - months);
  return value;
}

function monthsFromNow(months) {
  const value = new Date();
  value.setMonth(value.getMonth() + months);
  return value;
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

async function ensureUser(client, user) {
  const passwordHash = hashPassword(DEMO.password, `demo-${user.email}`);
  return queryOne(
    client,
    `
      insert into users (email, name, password_hash, status)
      values ($1, $2, $3, 'active')
      on conflict (email)
      do update set name = excluded.name, password_hash = excluded.password_hash, status = 'active', updated_at = now()
      returning id, email, name
    `,
    [user.email, user.name, passwordHash]
  );
}

async function ensureMembership(client, scope, userRow, roleKey) {
  const role = await queryOne(client, 'select id from roles where key = $1 limit 1', [roleKey]);

  if (!role) {
    throw new Error(`Missing role ${roleKey}. Run npm run migrate first.`);
  }

  await client.query(
    `
      insert into clinic_users (clinic_id, user_id, organization_id, workspace_id, role, role_id, status)
      values ($1, $2, $3, $4, $5, $6, 'active')
      on conflict (clinic_id, user_id)
      do update set
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        role = excluded.role,
        role_id = excluded.role_id,
        status = 'active',
        updated_at = now()
    `,
    [scope.clinicId, userRow.id, scope.organizationId, scope.workspaceId, roleKey, role.id]
  );

  await client.query(
    `
      insert into workspace_memberships (
        clinic_id,
        organization_id,
        workspace_id,
        user_id,
        role_id,
        status,
        invited_by,
        invited_at,
        joined_at
      )
      values ($1, $2, $3, $4, $5, 'active', $4, now(), now())
      on conflict do nothing
    `,
    [scope.clinicId, scope.organizationId, scope.workspaceId, userRow.id, role.id]
  );
}

async function ensureChannel(client, clinicId, channelType, name, isPrimary = false) {
  const existing = await queryOne(
    client,
    'select id from channels where clinic_id = $1 and channel_type = $2 and name = $3 limit 1',
    [clinicId, channelType, name]
  );

  if (isPrimary) {
    await client.query('update channels set is_primary = false where clinic_id = $1 and is_primary = true', [clinicId]);
  }

  if (existing) {
    return queryOne(
      client,
      'update channels set status = $3, is_primary = $4, updated_at = now() where id = $1 and clinic_id = $2 returning id',
      [existing.id, clinicId, 'active', isPrimary]
    );
  }

  return queryOne(
    client,
    `
      insert into channels (clinic_id, channel_type, name, status, is_primary, config_json)
      values ($1, $2, $3, 'active', $4, $5::jsonb)
      returning id
    `,
    [clinicId, channelType, name, isPrimary, JSON.stringify({ mode: 'simulated', demoSeed: DEMO.marker })]
  );
}

async function ensureTemplate(client, clinicId, [name, category, content]) {
  return queryOne(
    client,
    `
      insert into message_templates (clinic_id, channel_type, name, category, language, content, variables_json, approval_status)
      values ($1, 'line', $2, $3, 'th', $4, $5::jsonb, 'approved')
      on conflict (clinic_id, channel_type, name)
      do update set category = excluded.category, content = excluded.content, variables_json = excluded.variables_json, approval_status = 'approved', updated_at = now()
      returning id, name
    `,
    [
      clinicId,
      name,
      category,
      content,
      JSON.stringify({
        'lead.fullName': 'string',
        'customer.fullName': 'string'
      })
    ]
  );
}

async function ensureLead(client, scope, ownerUserId, lead) {
  const createdOffsetDays = {
    'facebook-new-lead': 0,
    'line-new-lead': 1,
    'hot-lead': 2,
    'cold-lead': 12,
    'no-show-lead': 3,
    'uncontacted-lead': 0
  }[lead.key] || 0;
  const createdAt = new Date(Date.now() - createdOffsetDays * 24 * 60 * 60 * 1000);
  const lastContactedAt = lead.key === 'uncontacted-lead' || lead.key === 'cold-lead'
    ? null
    : new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);

  const row = await queryOne(
    client,
    `
      insert into leads (
        clinic_id,
        organization_id,
        workspace_id,
        source,
        source_ref,
        full_name,
        phone,
        line_user_id,
        email,
        status,
        stage,
        owner_user_id,
        last_contacted_at,
        next_followup_at,
        intent_score,
        budget_range,
        preferred_branch,
        notes_summary,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now() + interval '1 day', $14, $15, $16, $17, $18, now())
      on conflict (clinic_id, source_ref)
      do update set
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        source = excluded.source,
        full_name = excluded.full_name,
        phone = excluded.phone,
        line_user_id = excluded.line_user_id,
        email = excluded.email,
        status = excluded.status,
        stage = excluded.stage,
        owner_user_id = excluded.owner_user_id,
        last_contacted_at = excluded.last_contacted_at,
        next_followup_at = excluded.next_followup_at,
        intent_score = excluded.intent_score,
        budget_range = excluded.budget_range,
        preferred_branch = excluded.preferred_branch,
        notes_summary = excluded.notes_summary,
        updated_at = now()
      returning id
    `,
    [
      scope.clinicId,
      scope.organizationId,
      scope.workspaceId,
      lead.source,
      `${DEMO.marker}:${lead.key}`,
      lead.fullName,
      lead.phone,
      lead.lineUserId,
      lead.email,
      lead.status,
      lead.stage,
      ownerUserId,
      lastContactedAt,
      lead.intentScore,
      lead.budgetRange,
      lead.preferredBranch,
      lead.notesSummary,
      createdAt
    ]
  );

  await client.query('delete from lead_interests where clinic_id = $1 and lead_id = $2', [scope.clinicId, row.id]);
  await client.query(
    `
      delete from lead_activity
      where clinic_id = $1
        and lead_id = $2
        and event_data_json->>'demoSeed' = $3
    `,
    [scope.clinicId, row.id, DEMO.marker]
  );
  for (const [index, interest] of lead.interests.entries()) {
    await client.query(
      `
        insert into lead_interests (clinic_id, lead_id, interest_type, interest_name, priority, urgency)
        values ($1, $2, 'treatment', $3, $4, $5)
      `,
      [scope.clinicId, row.id, interest, index + 1, lead.intentScore >= 80 ? 'high' : 'medium']
    );
  }

  for (const tag of lead.tags) {
    const tagRow = await queryOne(
      client,
      `
        insert into lead_tags (clinic_id, name, color)
        values ($1, $2, '#C8B27D')
        on conflict (clinic_id, name)
        do update set updated_at = now()
        returning id
      `,
      [scope.clinicId, tag]
    );
    await client.query(
      `
        insert into lead_tag_links (clinic_id, lead_id, tag_id)
        values ($1, $2, $3)
        on conflict (clinic_id, lead_id, tag_id)
        do nothing
      `,
      [scope.clinicId, row.id, tagRow.id]
    );
  }

  await client.query(
    `
      insert into lead_activity (clinic_id, lead_id, event_type, event_data_json, created_at)
      values ($1, $2, 'lead.created', $3::jsonb, $4)
    `,
    [scope.clinicId, row.id, JSON.stringify({ demoSeed: DEMO.marker, source: lead.source }), createdAt]
  );

  await ensureContactIdentity(client, scope.clinicId, 'lead', row.id, 'line', lead.lineUserId, lead.fullName);
  return row;
}

async function ensureContactIdentity(client, clinicId, entityType, entityId, channelType, externalId, displayName) {
  const existing = await queryOne(
    client,
    `
      select id
      from contact_identities
      where clinic_id = $1 and entity_type = $2 and entity_id = $3 and channel_type = $4 and is_primary = true
      limit 1
    `,
    [clinicId, entityType, entityId, channelType]
  );

  if (existing) {
    await client.query(
      'update contact_identities set external_id = $1, display_name = $2, updated_at = now() where id = $3',
      [externalId, displayName, existing.id]
    );
    return existing;
  }

  return queryOne(
    client,
    `
      insert into contact_identities (clinic_id, entity_type, entity_id, channel_type, external_id, display_name, is_primary)
      values ($1, $2, $3, $4, $5, $6, true)
      returning id
    `,
    [clinicId, entityType, entityId, channelType, externalId, displayName]
  );
}

async function ensureCustomer(client, scope, ownerUserId, customer) {
  const row = await queryOne(
    client,
    `
      insert into customers (clinic_id, source_lead_id, full_name, phone, email, status)
      values ($1, null, $2, $3, $4, $5)
      on conflict (clinic_id, email)
      do update set full_name = excluded.full_name, phone = excluded.phone, status = excluded.status, updated_at = now()
      returning id
    `,
    [scope.clinicId, customer.fullName, customer.phone, customer.email, customer.status]
  );

  await client.query(
    `
      insert into customer_profiles (clinic_id, customer_id, preferred_channel, tags, meta_json)
      values ($1, $2, 'line', $3::text[], $4::jsonb)
      on conflict (customer_id)
      do update set tags = excluded.tags, meta_json = excluded.meta_json
    `,
    [
      scope.clinicId,
      row.id,
      customer.tags,
      JSON.stringify({
        demoSeed: DEMO.marker,
        treatmentCycle: customer.treatment,
        nextDueAt: monthsFromNow(customer.dueInMonths).toISOString()
      })
    ]
  );

  await ensureContactIdentity(client, scope.clinicId, 'customer', row.id, 'line', customer.lineExternalId, customer.fullName);
  await client.query(
    `
      delete from customer_events
      where clinic_id = $1
        and customer_id = $2
        and event_source = 'demo_seed'
        and event_payload_json->>'demoSeed' = $3
    `,
    [scope.clinicId, row.id, DEMO.marker]
  );

  await client.query(
    `
      insert into customer_events (clinic_id, customer_id, event_type, event_source, event_payload_json, created_at)
      values ($1, $2, 'treatment.performed', 'demo_seed', $3::jsonb, $4)
    `,
    [
      scope.clinicId,
      row.id,
      JSON.stringify({
        demoSeed: DEMO.marker,
        treatment: customer.treatment,
        nextDueAt: monthsFromNow(customer.dueInMonths).toISOString()
      }),
      monthsAgo(customer.performedMonthsAgo)
    ]
  );

  await client.query(
    `
      insert into customer_notes (clinic_id, customer_id, note_text, created_by_user_id)
      select $1, $2, $3, $4
      where not exists (
        select 1 from customer_notes where clinic_id = $1 and customer_id = $2 and note_text = $3
      )
    `,
    [scope.clinicId, row.id, customer.note, ownerUserId]
  );

  return row;
}

async function ensureFlow(client, scope, ownerUserId, lineChannelId, templatesByName, flowSeed) {
  const [presetKey, name, eventName, templateName, primaryAction] = flowSeed;
  const definition = {
    trigger: eventName,
    entityType: eventName.startsWith('customer') ? 'customer' : 'lead',
    conditions: { demoSeed: DEMO.marker, presetKey },
    rateLimits: { maxExecutionsPerEntity: 1, maxMessagesPerDayPerLead: 2 },
    steps: [
      primaryAction === 'create_task'
        ? { type: 'action', action: 'create_task', title: name, taskType: presetKey }
        : primaryAction === 'notify_user'
          ? { type: 'action', action: 'notify_user', title: name, assignedUserField: 'ownerUserId' }
          : { type: 'action', action: 'send_message', templateName, channelId: lineChannelId }
    ]
  };
  const existing = await queryOne(
    client,
    `
      select id
      from automation_flows
      where clinic_id = $1
        and workspace_id = $2
        and entry_rule_json->>'presetKey' = $3
      limit 1
    `,
    [scope.clinicId, scope.workspaceId, presetKey]
  );
  const flow = existing
    ? await queryOne(
      client,
      `
        update automation_flows
        set name = $3,
            status = 'active',
            trigger_event = $4,
            entry_rule_json = $5::jsonb,
            definition_json = $6::jsonb,
            is_published = true,
            updated_at = now()
        where id = $1
          and clinic_id = $2
        returning id
      `,
      [
        existing.id,
        scope.clinicId,
        name,
        eventName,
        JSON.stringify({
          presetKey,
          eventName,
          entityType: definition.entityType,
          guardConditions: definition.conditions,
          rateLimits: definition.rateLimits
        }),
        JSON.stringify(definition)
      ]
    )
    : await queryOne(
      client,
      `
        insert into automation_flows (
          clinic_id,
          workspace_id,
          name,
          flow_type,
          trigger_type,
          status,
          version,
          entry_rule_json,
          definition_json,
          trigger_event,
          created_by,
          is_published
        )
        values ($1, $2, $3, 'demo_lifecycle', 'event', 'active', 1, $4::jsonb, $5::jsonb, $6, $7, true)
        returning id
      `,
      [
        scope.clinicId,
        scope.workspaceId,
        name,
        JSON.stringify({
          presetKey,
          eventName,
          entityType: definition.entityType,
          guardConditions: definition.conditions,
          rateLimits: definition.rateLimits
        }),
        JSON.stringify(definition),
        eventName,
        ownerUserId
      ]
    );
  const resolvedFlow = flow;

  await client.query('delete from automation_steps where flow_id = $1', [resolvedFlow.id]);
  const templateId = templatesByName.get(templateName) || null;
  await client.query(
    `
      insert into automation_steps (clinic_id, flow_id, step_order, step_type, delay_minutes, config_json)
      values ($1, $2, 1, $3, null, $4::jsonb)
    `,
    [
      scope.clinicId,
      resolvedFlow.id,
      primaryAction === 'create_task' ? 'create_task' : primaryAction === 'notify_user' ? 'notify_user' : 'send_message',
      JSON.stringify({
        demoSeed: DEMO.marker,
        templateId,
        channelId: lineChannelId,
        title: name,
        taskType: presetKey
      })
    ]
  );

  await client.query('update automation_flow_versions set is_published = false where flow_id = $1', [resolvedFlow.id]);
  const version = await queryOne(
    client,
    `
      insert into automation_flow_versions (clinic_id, flow_id, version, version_number, config_json, definition_json, created_by, is_published)
      values ($1, $2, 1, 1, $3::jsonb, $3::jsonb, $4, true)
      on conflict (flow_id, version)
      do update set config_json = excluded.config_json, definition_json = excluded.definition_json, created_by = excluded.created_by, is_published = true
      returning id
    `,
    [scope.clinicId, resolvedFlow.id, JSON.stringify(definition), ownerUserId]
  );

  await client.query(
    'update automation_flows set current_version_id = $1, is_published = true where id = $2',
    [version.id, resolvedFlow.id]
  );

  return resolvedFlow;
}

async function createHitlSuggestion(client, scope, ownerUserId, leadId, agentType, inboundText, responseText, riskLabel = 'medium') {
  const existing = await queryOne(
    client,
    `
      select id, ai_message_id
      from ai_hitl_approval_queue
      where clinic_id = $1 and lead_id = $2 and agent_type = $3 and status = 'pending'
      limit 1
    `,
    [scope.clinicId, leadId, agentType]
  );

  if (existing) {
    if (existing.ai_message_id) {
      await client.query(
        `
          update ai_chat_messages
          set message_text = $1,
              confidence_score = 0.82,
              status = 'pending_approval'
          where id = $2
        `,
        [responseText, existing.ai_message_id]
      );
    }
    await client.query(
      `
        update ai_hitl_approval_queue
        set workspace_id = $2,
            message_text = $3,
            ai_response_text = $4,
            original_text = $4,
            modified_text = null,
            confidence_score = 0.82,
            risk_label = $5,
            reviewed_by = null,
            reviewed_at = null,
            outbound_message_id = null
        where id = $1
      `,
      [existing.id, scope.workspaceId, inboundText, responseText, riskLabel]
    );
    return existing;
  }

  const thread = await queryOne(
    client,
    `
      insert into ai_chat_threads (clinic_id, lead_id, status)
      values ($1, $2, 'active')
      on conflict (lead_id)
      do update set status = 'active', updated_at = now()
      returning id
    `,
    [scope.clinicId, leadId]
  );
  const message = await queryOne(
    client,
    `
      insert into ai_chat_messages (thread_id, sender_type, message_text, confidence_score, status)
      values ($1, 'ai_agent', $2, 0.82, 'pending_approval')
      returning id
    `,
    [thread.id, responseText]
  );

  await client.query(
    `
      insert into ai_hitl_approval_queue (
        clinic_id,
        workspace_id,
        lead_id,
        ai_message_id,
        message_text,
        ai_response_text,
        original_text,
        confidence_score,
        status,
        agent_type,
        risk_label
      )
      values ($1, $2, $3, $4, $5, $6, $6, 0.82, 'pending', $7, $8)
    `,
    [scope.clinicId, scope.workspaceId, leadId, message.id, inboundText, responseText, agentType, riskLabel]
  );

  await client.query(
    `
      insert into audit_logs (clinic_id, entity_type, entity_id, action_type, actor_user_id, context_json)
      values ($1, 'ai_message', $2, 'ai.demo_suggestion_seeded', $3, $4::jsonb)
    `,
    [scope.clinicId, message.id, ownerUserId, JSON.stringify({ demoSeed: DEMO.marker, leadId, riskLabel })]
  );

  return message;
}

async function seedDemoClinic() {
  const client = await getPool().connect();

  try {
    await client.query('begin');

    const clinic = await queryOne(
      client,
      `
        insert into clinics (name, slug, plan, status, timezone)
        values ($1, $2, 'growth', 'active', 'Asia/Bangkok')
        on conflict (slug)
        do update set name = excluded.name, plan = excluded.plan, status = 'active', updated_at = now()
        returning id
      `,
      [DEMO.clinicName, DEMO.clinicSlug]
    );
    const organization = await queryOne(
      client,
      `
        insert into organizations (clinic_id, name, slug, status)
        values ($1, $2, $3, 'active')
        on conflict (clinic_id)
        do update set name = excluded.name, slug = excluded.slug, status = 'active', updated_at = now()
        returning id
      `,
      [clinic.id, DEMO.organizationName, DEMO.organizationSlug]
    );
    const workspace = await queryOne(
      client,
      `
        insert into workspaces (clinic_id, organization_id, name, slug, status)
        values ($1, $2, $3, $4, 'active')
        on conflict (clinic_id, slug)
        do update set organization_id = excluded.organization_id, name = excluded.name, status = 'active', updated_at = now()
        returning id
      `,
      [clinic.id, organization.id, DEMO.workspaceName, DEMO.workspaceSlug]
    );
    const scope = {
      clinicId: Number(clinic.id),
      organizationId: Number(organization.id),
      workspaceId: Number(workspace.id)
    };

    const users = new Map();
    for (const user of DEMO.users) {
      const row = await ensureUser(client, user);
      users.set(user.role, row);
      await ensureMembership(client, scope, row, user.role);
    }
    const ownerUserId = Number(users.get('owner').id);
    const lineChannel = await ensureChannel(client, scope.clinicId, 'line', 'Demo LINE OA', true);
    await ensureChannel(client, scope.clinicId, 'email', 'Demo Email', false);
    await ensureChannel(client, scope.clinicId, 'facebook', 'Demo Facebook Page', false);

    const templatesByName = new Map();
    for (const template of TEMPLATES) {
      const row = await ensureTemplate(client, scope.clinicId, template);
      templatesByName.set(row.name, Number(row.id));
    }

    const leadsByKey = new Map();
    for (const lead of LEADS) {
      const row = await ensureLead(client, scope, ownerUserId, lead);
      leadsByKey.set(lead.key, Number(row.id));
    }

    const customersByKey = new Map();
    for (const customer of CUSTOMERS) {
      const row = await ensureCustomer(client, scope, ownerUserId, customer);
      customersByKey.set(customer.key, Number(row.id));
    }

    const flowsByKey = new Map();
    for (const flow of FLOWS) {
      const row = await ensureFlow(client, scope, ownerUserId, Number(lineChannel.id), templatesByName, flow);
      flowsByKey.set(flow[0], Number(row.id));
    }

    await client.query(
      `
        delete from automation_executions
        where clinic_id = $1
          and workspace_id = $2
          and context_json->>'demoSeed' = $3
      `,
      [scope.clinicId, scope.workspaceId, DEMO.marker]
    );
    await client.query(
      `
        insert into automation_executions (clinic_id, workspace_id, flow_id, entity_type, entity_id, lead_id, trigger_event, status, started_at, completed_at, context_json)
        values
          ($1, $2, $3, 'lead', $4, $4, 'lead.created', 'completed', now() - interval '2 hours', now() - interval '115 minutes', $5::jsonb),
          ($1, $2, $6, 'lead', $7, $7, 'lead.stage.updated', 'waiting', now() - interval '1 hour', null, $8::jsonb)
      `,
      [
        scope.clinicId,
        scope.workspaceId,
        flowsByKey.get('new_lead_welcome'),
        leadsByKey.get('facebook-new-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, storyStep: 'new_lead_welcome' }),
        flowsByKey.get('no_show_recovery'),
        leadsByKey.get('no-show-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, storyStep: 'no_show_recovery' })
      ]
    );

    await client.query(
      `
        delete from ai_recommendations
        where clinic_id = $1
          and context_json->>'demoSeed' = $2
      `,
      [scope.clinicId, DEMO.marker]
    );
    await client.query(
      `
        insert into ai_recommendations (clinic_id, entity_type, entity_id, recommendation_type, recommendation_text, priority, confidence, context_json)
        values
          ($1, 'lead', $2, 'reply_suggestion', 'ตอบกลับ lead ใหม่พร้อมชวนปรึกษาและเก็บความสนใจหลัก', 'high', 0.84, $3::jsonb),
          ($1, 'lead', $4, 'no_show_recovery_copy', 'ส่งข้อความ recovery แบบนุ่มนวลเพื่อชวนเลือกเวลานัดใหม่', 'urgent', 0.88, $5::jsonb),
          ($1, 'customer', $6, 'repeat_treatment_reminder_copy', 'Botox repeat reminder ควรให้ staff ตรวจข้อความก่อนส่ง', 'high', 0.82, $7::jsonb)
        on conflict (clinic_id, entity_type, entity_id, recommendation_type)
        do update set recommendation_text = excluded.recommendation_text, priority = excluded.priority, confidence = excluded.confidence, context_json = excluded.context_json
      `,
      [
        scope.clinicId,
        leadsByKey.get('facebook-new-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, useCase: 'reply_suggestion' }),
        leadsByKey.get('no-show-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, useCase: 'no_show_recovery_copy' }),
        customersByKey.get('botox-repeat'),
        JSON.stringify({ demoSeed: DEMO.marker, useCase: 'repeat_treatment_reminder_copy' })
      ]
    );

    await createHitlSuggestion(
      client,
      scope,
      ownerUserId,
      leadsByKey.get('facebook-new-lead'),
      'demo_reply_suggestion',
      'Lead ใหม่ถามราคา Botox จาก Facebook',
      'สวัสดีค่ะคุณฟ้าใส ขอบคุณที่สนใจโปรแกรม Botox ทีมงานขอเช็กข้อมูลเบื้องต้นและส่งรายละเอียดให้เจ้าหน้าที่ตรวจทานก่อนตอบกลับนะคะ',
      'low'
    );
    await createHitlSuggestion(
      client,
      scope,
      ownerUserId,
      leadsByKey.get('no-show-lead'),
      'demo_no_show_recovery',
      'Lead no-show consult เมื่อวาน',
      'สวัสดีค่ะคุณจูน เห็นว่าวันนัดล่าสุดอาจไม่สะดวก ทีมงานช่วยดูรอบนัดใหม่ให้ได้ค่ะ สะดวกช่วงไหนคะ',
      'medium'
    );
    await createHitlSuggestion(
      client,
      scope,
      ownerUserId,
      leadsByKey.get('hot-lead'),
      'demo_medical_review',
      'Lead สนใจ Botox และแจ้งว่ามีโรคประจำตัว',
      'ขอบคุณที่แจ้งข้อมูลค่ะ เนื่องจากมีข้อมูลด้านสุขภาพ ทีมงานจะส่งให้เจ้าหน้าที่หรือแพทย์ตรวจสอบก่อนให้คำแนะนำเพิ่มเติมนะคะ',
      'high'
    );

    await client.query(
      `
        insert into ai_lead_scores (clinic_id, lead_id, score, confidence, reason_json, generated_at)
        values
          ($1, $2, 92, 0.91, $3::jsonb, now()),
          ($1, $4, 74, 0.80, $5::jsonb, now())
        on conflict (clinic_id, lead_id)
        do update set score = excluded.score, confidence = excluded.confidence, reason_json = excluded.reason_json, generated_at = now()
      `,
      [
        scope.clinicId,
        leadsByKey.get('hot-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, signals: ['qualified', 'high_intent'] }),
        leadsByKey.get('no-show-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, signals: ['no_show', 'recovery_candidate'] })
      ]
    );

    await client.query(
      `
        insert into ai_customer_scores (clinic_id, customer_id, score, lifetime_value_estimate, engagement_score, generated_at)
        values
          ($1, $2, 88, 42000, 84, now()),
          ($1, $3, 76, 56000, 72, now())
        on conflict (clinic_id, customer_id)
        do update set score = excluded.score, lifetime_value_estimate = excluded.lifetime_value_estimate, engagement_score = excluded.engagement_score, generated_at = now()
      `,
      [scope.clinicId, customersByKey.get('botox-repeat'), customersByKey.get('filler-repeat')]
    );

    await client.query(
      `
        insert into analytics_daily_metrics (clinic_id, metric_date, leads_created, customers_created, messages_sent, automation_executions, ai_recommendations_generated)
        values ($1, current_date, 6, 3, 4, 2, 3)
        on conflict (clinic_id, metric_date)
        do update set leads_created = 6, customers_created = 3, messages_sent = 4, automation_executions = 2, ai_recommendations_generated = 3, updated_at = now()
      `,
      [scope.clinicId]
    );
    await client.query('delete from analytics_funnel_metrics where clinic_id = $1', [scope.clinicId]);
    await client.query(
      `
        insert into analytics_funnel_metrics (clinic_id, stage_name, lead_count, conversion_rate)
        values
          ($1, 'inquiry', 4, 0.6667),
          ($1, 'qualified', 1, 0.1667),
          ($1, 'no_show', 1, 0.1667),
          ($1, 'repeat_due', 2, 0.3333)
      `,
      [scope.clinicId]
    );
    await client.query(
      `
        insert into analytics_ai_metrics (clinic_id, metric_date, leads_scored, customers_scored, recommendations_generated, recommendations_accepted)
        values ($1, current_date, 2, 2, 3, 0)
        on conflict (clinic_id, metric_date)
        do update set leads_scored = 2, customers_scored = 2, recommendations_generated = 3, recommendations_accepted = 0, updated_at = now()
      `,
      [scope.clinicId]
    );

    await client.query(
      `
        delete from audit_logs
        where clinic_id = $1
          and context_json->>'demoSeed' = $2
      `,
      [scope.clinicId, DEMO.marker]
    );
    await client.query(
      `
        insert into audit_logs (clinic_id, entity_type, entity_id, action_type, actor_user_id, context_json)
        values
          ($1, 'tenant', $1, 'demo.seeded', $2, $3::jsonb),
          ($1, 'ai_message', $4, 'ai.hitl_pending_demo', $2, $5::jsonb),
          ($1, 'automation_flow', $6, 'automation.demo_ready', $2, $7::jsonb)
      `,
      [
        scope.clinicId,
        ownerUserId,
        JSON.stringify({ demoSeed: DEMO.marker, workspaceId: scope.workspaceId }),
        leadsByKey.get('facebook-new-lead'),
        JSON.stringify({ demoSeed: DEMO.marker, hitlQueueReady: true }),
        flowsByKey.get('new_lead_welcome'),
        JSON.stringify({ demoSeed: DEMO.marker, flowCount: FLOWS.length })
      ]
    );

    await client.query('commit');

    return {
      clinicId: scope.clinicId,
      workspaceId: scope.workspaceId,
      ownerEmail: DEMO.users[0].email,
      password: DEMO.password
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function verifyDemoClinic(summary) {
  const pool = getPool();
  const loginResult = await login({
    email: DEMO.users[0].email,
    password: DEMO.password,
    clinicSlug: DEMO.clinicSlug
  });
  const checks = await pool.query(
    `
      select
        (select count(*)::int from leads where clinic_id = $1) as lead_count,
        (select count(*)::int from customers where clinic_id = $1) as customer_count,
        (select count(*)::int from automation_flows where clinic_id = $1 and workspace_id = $2 and status = 'active') as flow_count,
        (select count(*)::int from ai_hitl_approval_queue where clinic_id = $1 and workspace_id = $2 and status = 'pending') as hitl_count,
        (select count(*)::int from audit_logs where clinic_id = $1 and context_json->>'demoSeed' = $3) as audit_count,
        (select count(*)::int from analytics_daily_metrics where clinic_id = $1 and metric_date = current_date) as dashboard_count
    `,
    [summary.clinicId, summary.workspaceId, DEMO.marker]
  );
  const row = checks.rows[0];
  const failures = [];

  if (!loginResult.token) failures.push('demo login failed');
  if (row.lead_count < 6) failures.push('expected at least 6 demo leads');
  if (row.customer_count < 3) failures.push('expected at least 3 demo customers');
  if (row.flow_count < 8) failures.push('expected at least 8 active demo automation flows');
  if (row.hitl_count < 3) failures.push('expected at least 3 pending HITL items');
  if (row.audit_count < 3) failures.push('expected demo audit trail events');
  if (row.dashboard_count < 1) failures.push('expected dashboard daily metrics');

  if (failures.length > 0) {
    throw new Error(`Demo clinic verification failed: ${failures.join('; ')}`);
  }

  return {
    loginEmail: DEMO.users[0].email,
    loginPassword: DEMO.password,
    clinicSlug: DEMO.clinicSlug,
    workspaceSlug: DEMO.workspaceSlug,
    ...row
  };
}

async function main() {
  const summary = await seedDemoClinic();
  const verification = await verifyDemoClinic(summary);
  process.stdout.write(`Demo clinic seeded: ${JSON.stringify(verification, null, 2)}\n`);
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    await closePool();
    process.exit(1);
  });
