const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../apps/api/src/config');
const { createLead } = require('../apps/api/src/modules/leads/service');
const { convertLeadToCustomer, addCustomerNote, getCustomerTimeline, listCustomers } = require('../apps/api/src/modules/customers/service');
const { createContactIdentity, sendCustomerManualMessage } = require('../apps/api/src/modules/messaging/service');

async function buildContext(pool, clinicSlug = 'demo-clinic') {
  const clinicResult = await pool.query(
    `select id, name, slug, plan, status, timezone, created_at, updated_at from clinics where slug = $1 limit 1`,
    [clinicSlug]
  );
  const membershipResult = await pool.query(
    `
      select u.id, u.email, u.name, cu.role
      from clinic_users cu
      inner join users u on u.id = cu.user_id
      where cu.clinic_id = $1 and cu.status = 'active' and u.status = 'active'
      order by cu.id asc
      limit 1
    `,
    [clinicResult.rows[0].id]
  );

  return {
    currentClinic: {
      id: clinicResult.rows[0].id,
      name: clinicResult.rows[0].name,
      slug: clinicResult.rows[0].slug,
      plan: clinicResult.rows[0].plan,
      status: clinicResult.rows[0].status,
      timezone: clinicResult.rows[0].timezone,
      createdAt: clinicResult.rows[0].created_at,
      updatedAt: clinicResult.rows[0].updated_at
    },
    currentUser: {
      id: membershipResult.rows[0].id,
      email: membershipResult.rows[0].email,
      name: membershipResult.rows[0].name,
      role: membershipResult.rows[0].role
    }
  };
}

test('lead converts to customer and duplicate conversion is idempotent', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const uniqueSuffix = Date.now();
  const lead = await createLead(context, {
    fullName: `Customer Convert ${uniqueSuffix}`,
    source: 'manual',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `089${String(uniqueSuffix).slice(-7)}`,
    lineUserId: `line-customer-${uniqueSuffix}`,
    email: `customer-convert-${uniqueSuffix}@example.com`
  });

  const customer = await convertLeadToCustomer(context, { leadId: lead.id });
  const duplicateCustomer = await convertLeadToCustomer(context, { leadId: lead.id });

  assert.equal(customer.sourceLeadId, lead.id);
  assert.equal(customer.id, duplicateCustomer.id);
  await pool.end();
});

test('customer timeline contains conversion, note, and message events', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const uniqueSuffix = Date.now() + 1;
  const lead = await createLead(context, {
    fullName: `Timeline Customer ${uniqueSuffix}`,
    source: 'manual',
    status: 'won',
    stage: 'converted',
    ownerUserId: context.currentUser.id,
    phone: `088${String(uniqueSuffix).slice(-7)}`,
    lineUserId: `line-timeline-${uniqueSuffix}`,
    email: `timeline-customer-${uniqueSuffix}@example.com`
  });
  const customer = await convertLeadToCustomer(context, { leadId: lead.id });

  await createContactIdentity(context, {
    entityType: 'customer',
    entityId: customer.id,
    channelType: 'line',
    externalId: `customer-line-${uniqueSuffix}`,
    displayName: customer.fullName,
    isPrimary: true
  });
  await addCustomerNote(context, customer.id, { noteText: 'ลูกค้าพร้อมรับ repeat revenue campaign' });

  const channelResult = await pool.query(
    `select id from channels where clinic_id = $1 and channel_type = 'line' order by is_primary desc, id asc limit 1`,
    [context.currentClinic.id]
  );

  await sendCustomerManualMessage(context, customer.id, {
    channelId: channelResult.rows[0].id,
    content: 'ข้อความทดสอบ customer timeline'
  });

  const timeline = await getCustomerTimeline(context.currentClinic.id, customer.id, new URLSearchParams());
  const titles = timeline.items.map((item) => item.title);

  assert.ok(titles.includes('customer.converted_from_lead'));
  assert.ok(titles.includes('customer.note_added'));
  assert.ok(titles.includes('customer.message_sent'));
  await pool.end();
});

test('customer note creation is tenant isolated', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const clinicSlug = `tenant-${Date.now()}`;
  const clinicInsert = await pool.query(
    `
      insert into clinics (name, slug, plan, status, timezone)
      values ($1, $2, 'starter', 'active', 'Asia/Bangkok')
      returning id
    `,
    ['Other Tenant Clinic', clinicSlug]
  );
  await pool.query(
    `insert into clinic_users (clinic_id, user_id, role, status) values ($1, $2, 'owner', 'active') on conflict (clinic_id, user_id) do nothing`,
    [clinicInsert.rows[0].id, context.currentUser.id]
  );

  const otherContext = await buildContext(pool, clinicSlug);
  const otherLead = await createLead(otherContext, {
    fullName: `Other Tenant Lead ${Date.now()}`,
    source: 'manual',
    status: 'won',
    stage: 'converted',
    ownerUserId: otherContext.currentUser.id,
    phone: `087${String(Date.now()).slice(-7)}`,
    email: `other-tenant-${Date.now()}@example.com`
  });
  const otherCustomer = await convertLeadToCustomer(otherContext, { leadId: otherLead.id });

  await assert.rejects(
    () => addCustomerNote(context, otherCustomer.id, { noteText: 'cross-tenant note should fail' }),
    { code: 'CUSTOMER_NOT_FOUND' }
  );
  await pool.end();
});

test('customer list only returns current clinic records', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const customers = await listCustomers(context.currentClinic.id, new URLSearchParams());

  assert.ok(customers.items.length >= 1);
  assert.ok(customers.items.every((item) => item.clinicId === context.currentClinic.id));
  await pool.end();
});

test('customer contact identity is allowed after Sprint 6', async () => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const context = await buildContext(pool);
  const seededCustomerResult = await pool.query(
    `select id, full_name from customers where clinic_id = $1 order by id asc limit 1`,
    [context.currentClinic.id]
  );
  const identity = await createContactIdentity(context, {
    entityType: 'customer',
    entityId: seededCustomerResult.rows[0].id,
    channelType: 'sms',
    externalId: `customer-sms-${Date.now() + 2}`,
    displayName: seededCustomerResult.rows[0].full_name,
    isPrimary: false
  });

  assert.equal(identity.entityType, 'customer');
  await pool.end();
});