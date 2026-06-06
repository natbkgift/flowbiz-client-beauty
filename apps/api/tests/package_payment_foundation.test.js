'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { loadConfig } = require('../src/config');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { handlePackagePaymentRoutes } = require('../src/modules/package-payments/routes');
const { handleMemberAccessRoutes } = require('../src/modules/member-access/routes');

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

function parseResponse(response) {
  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

async function routePackageJson({ method = 'GET', path, authenticateRequest, body = {}, searchParams = {} }) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    const handled = await handlePackagePaymentRoutes(
      { method, headers: {}, socket: { remoteAddress: `127.19.0.${Math.floor(Math.random() * 200) + 1}` } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
        parseJsonBody: async () => body,
        json
      }
    );
    if (!handled && response.statusCode === null) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
    }
  } catch (error) {
    if (error instanceof AppError) {
      response.writeHead(error.statusCode);
      response.end(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details || null } }));
    } else {
      response.writeHead(500);
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } }));
    }
  }

  return parseResponse(response);
}

async function routeMemberAccessJson({
  method = 'GET',
  path,
  body = {},
  searchParams = {},
  remoteAddress,
  userAgent = 'package-payment-foundation-test-agent'
}) {
  const response = createMockResponse();
  const suffix = Object.keys(searchParams).length ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = new URL(`http://localhost${path}${suffix}`);

  try {
    const handled = await handleMemberAccessRoutes(
      {
        method,
        headers: { 'user-agent': userAgent },
        socket: { remoteAddress: remoteAddress || `127.19.1.${Math.floor(Math.random() * 200) + 1}` }
      },
      response,
      url,
      {
        parseJsonBody: async () => body,
        json
      }
    );
    if (!handled && response.statusCode === null) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
    }
  } catch (error) {
    if (error instanceof AppError) {
      response.writeHead(error.statusCode);
      response.end(JSON.stringify({ error: { code: error.code, message: error.message, details: error.details || null } }));
    } else {
      response.writeHead(500);
      response.end(JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } }));
    }
  }

  return parseResponse(response);
}

async function createTenant(pool, uniqueId, suffix) {
  const clinic = await pool.query(
    "insert into clinics (name, slug, plan, status) values ($1, $2, 'starter', 'active') returning id",
    [`PR19A Clinic ${suffix} ${uniqueId}`, `pr19a-${suffix}-${uniqueId}`]
  );
  const clinicId = Number(clinic.rows[0].id);
  const organization = await pool.query(
    "insert into organizations (clinic_id, name, slug, status) values ($1, $2, $3, 'active') returning id",
    [clinicId, `PR19A Org ${suffix}`, `pr19a-org-${suffix}-${uniqueId}`]
  );
  const workspace = await pool.query(
    "insert into workspaces (clinic_id, organization_id, name, slug, status) values ($1, $2, $3, $4, 'active') returning id",
    [clinicId, organization.rows[0].id, `PR19A Workspace ${suffix}`, `pr19a-ws-${suffix}-${uniqueId}`]
  );

  return {
    clinicId,
    clinicSlug: `pr19a-${suffix}-${uniqueId}`,
    organizationId: Number(organization.rows[0].id),
    workspaceId: Number(workspace.rows[0].id)
  };
}

async function createUser(pool, uniqueId, suffix) {
  const result = await pool.query(
    "insert into users (email, name, password_hash, status) values ($1, $2, 'hash', 'active') returning id",
    [`pr19a-${suffix}-${uniqueId}@flowbiz.local`, `PR19A ${suffix}`]
  );
  return Number(result.rows[0].id);
}

async function createLead(pool, tenant, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into leads (
        clinic_id, organization_id, workspace_id, source, source_ref,
        full_name, phone, email, line_user_id, status, stage
      )
      values ($1, $2, $3, 'website', $4, $5, $6, $7, $8, 'new', 'inquiry')
      returning id
    `,
    [
      tenant.clinicId,
      tenant.organizationId,
      tenant.workspaceId,
      `pr19a-lead-${suffix}-${uniqueId}`,
      `PR19A Lead ${suffix}`,
      `08919${suffix}`,
      `pr19a-lead-${suffix}-${uniqueId}@example.com`,
      `@pr19a-lead-${suffix}`
    ]
  );
  return Number(result.rows[0].id);
}

async function createMember(pool, tenant, leadId, uniqueId, suffix) {
  const result = await pool.query(
    `
      insert into clinic_members (
        clinic_id, lead_id, display_name, phone, email, line_id, status, source, profile_json
      )
      values ($1, $2, $3, $4, $5, $6, 'active', 'manual', $7::jsonb)
      returning id
    `,
    [
      tenant.clinicId,
      leadId,
      `PR19A Member ${suffix}`,
      `08929${suffix}`,
      `pr19a-member-${suffix}-${uniqueId}@example.com`,
      `@pr19a-member-${suffix}`,
      JSON.stringify({ unsafe: `raw PR19A member metadata ${suffix}` })
    ]
  );
  return Number(result.rows[0].id);
}

async function requestToken(tenant, email) {
  const res = await routeMemberAccessJson({
    method: 'POST',
    path: `/public/clinics/${tenant.clinicSlug}/member-access/request`,
    body: { contact: email, channel: 'email', honeypot: '' }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.devToken);
  return res.body.devToken;
}

function assertNoForbiddenPublicFields(payload, forbiddenValues) {
  const serialized = JSON.stringify(payload);
  for (const value of forbiddenValues) {
    assert.equal(serialized.includes(value), false, `public payload leaked ${value}`);
  }
}

test('PR19A Package Ownership / Payment Foundation', async (t) => {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const userIds = [];
  let tenantA;
  let tenantB;
  let ownerUserId;
  let tenantAOwnerUserId;
  let tenantBOwnerUserId;
  let leadAId;
  let leadBId;
  let memberAId;
  let memberBId;
  let otherMemberAId;
  let packageAId;
  let packageBId;
  let memberPackageAId;
  let otherMemberPackageAId;
  let memberPackageBId;
  let paymentAId;
  const rawPaymentRef = `RAW-PR19A-REF-${uniqueId}`;

  t.before(async () => {
    tenantA = await createTenant(pool, uniqueId, 'a');
    tenantB = await createTenant(pool, uniqueId, 'b');
    tenantAOwnerUserId = await createUser(pool, uniqueId, 'owner-a');
    tenantBOwnerUserId = await createUser(pool, uniqueId, 'owner-b');
    ownerUserId = tenantAOwnerUserId;
    userIds.push(tenantAOwnerUserId, tenantBOwnerUserId);

    leadAId = await createLead(pool, tenantA, uniqueId, 'a');
    leadBId = await createLead(pool, tenantB, uniqueId, 'b');
    memberAId = await createMember(pool, tenantA, leadAId, uniqueId, 'a');
    memberBId = await createMember(pool, tenantB, leadBId, uniqueId, 'b');
    const otherLeadAId = await createLead(pool, tenantA, uniqueId, 'other-a');
    otherMemberAId = await createMember(pool, tenantA, otherLeadAId, uniqueId, 'other-a');
  });

  t.after(async () => {
    try {
      if (tenantA?.clinicId && tenantB?.clinicId) {
        await pool.query('delete from clinics where id = any($1::bigint[])', [[tenantA.clinicId, tenantB.clinicId]]);
      }
      if (userIds.length) {
        await pool.query('delete from users where id = any($1::bigint[])', [userIds]);
      }
    } finally {
      await pool.end();
    }
  });

  const contextFor = (tenant = tenantA, userId = ownerUserId, role = 'owner') => async () => ({
    currentUser: { id: userId, email: `pr19a-${userId}-${uniqueId}@flowbiz.local` },
    currentClinic: { id: tenant.clinicId, slug: tenant.clinicSlug },
    currentOrganization: { id: tenant.organizationId },
    currentWorkspace: { id: tenant.workspaceId },
    currentMembership: { role, legacyRole: role, permissions: [] }
  });

  await t.test('1. Admin creates and updates package definition with validation and audit', async () => {
    const created = await routePackageJson({
      method: 'POST',
      path: '/admin/packages',
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: {
        packageCode: `GLOW-10-${uniqueId}`,
        packageName: 'Glow Course 10',
        packageType: 'course',
        description: 'Ten visit glow course',
        totalUnits: 10,
        unitLabel: 'visit',
        priceAmount: 12000,
        currency: 'thb',
        status: 'active',
        metadataJson: { unsafe: `raw PR19A package metadata ${uniqueId}` }
      }
    });

    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(created.body.packageCode, `GLOW-10-${uniqueId}`);
    assert.equal(created.body.packageName, 'Glow Course 10');
    assert.equal(created.body.packageType, 'course');
    assert.equal(created.body.totalUnits, 10);
    assert.equal(created.body.remainingUnits, undefined);
    assert.equal(created.body.priceAmount, 12000);
    assert.equal(created.body.currency, 'THB');
    assert.equal(created.body.status, 'active');
    assert.equal(JSON.stringify(created.body).includes('metadata'), false);
    packageAId = created.body.id;

    const updated = await routePackageJson({
      method: 'PATCH',
      path: `/admin/packages/${packageAId}`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: {
        packageName: 'Glow Course 10 Updated',
        priceAmount: 9900,
        totalUnits: 10,
        status: 'active'
      }
    });
    assert.equal(updated.statusCode, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.packageName, 'Glow Course 10 Updated');
    assert.equal(updated.body.priceAmount, 9900);

    const audit = await pool.query(
      `
        select action_type, context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_service_package'
          and entity_id = $2
        order by id asc
      `,
      [tenantA.clinicId, packageAId]
    );
    assert.equal(audit.rowCount, 2);
    assert.equal(audit.rows[0].action_type, 'clinic_service_package.created');
    assert.equal(audit.rows[1].action_type, 'clinic_service_package.updated');
    assert.equal(audit.rows[0].context_json.summary.packageId, packageAId);
    assert.equal(JSON.stringify(audit.rows).includes(`raw PR19A package metadata ${uniqueId}`), false);

    for (const [body, expectedCode] of [
      [{ packageCode: `BAD-TYPE-${uniqueId}`, packageName: 'Bad', packageType: 'gateway' }, 'INVALID_PACKAGE_TYPE'],
      [{ packageCode: `BAD-STATUS-${uniqueId}`, packageName: 'Bad', status: 'draft' }, 'INVALID_PACKAGE_STATUS'],
      [{ packageCode: `BAD-CURRENCY-${uniqueId}`, packageName: 'Bad', currency: 'TH' }, 'INVALID_PACKAGE_PAYLOAD'],
      [{ packageCode: `BAD-PRICE-${uniqueId}`, packageName: 'Bad', priceAmount: -1 }, 'INVALID_PACKAGE_PAYLOAD'],
      [{ packageCode: `BAD-UNITS-${uniqueId}`, packageName: 'Bad', totalUnits: -1 }, 'INVALID_PACKAGE_PAYLOAD']
    ]) {
      const res = await routePackageJson({
        method: 'POST',
        path: '/admin/packages',
        authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
        body
      });
      assert.equal(res.statusCode, 400, JSON.stringify(res.body));
      assert.equal(res.body.error.code, expectedCode);
    }
  });

  await t.test('2. Admin lists packages tenant-scoped', async () => {
    const tenantBPackage = await routePackageJson({
      method: 'POST',
      path: '/admin/packages',
      authenticateRequest: contextFor(tenantB, tenantBOwnerUserId),
      body: {
        packageCode: `TENANT-B-${uniqueId}`,
        packageName: 'Tenant B Course',
        packageType: 'course',
        totalUnits: 4,
        unitLabel: 'visit',
        priceAmount: 4000,
        currency: 'THB',
        status: 'active'
      }
    });
    assert.equal(tenantBPackage.statusCode, 201, JSON.stringify(tenantBPackage.body));
    packageBId = tenantBPackage.body.id;

    const list = await routePackageJson({
      path: '/admin/packages',
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId)
    });
    assert.equal(list.statusCode, 200, JSON.stringify(list.body));
    const ids = list.body.items.map((item) => item.id);
    assert.ok(ids.includes(packageAId));
    assert.equal(ids.includes(packageBId), false);
  });

  await t.test('3. Admin assigns package to member with snapshot, tenant checks, audit, and member event', async () => {
    const assigned = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${memberAId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: {
        packageId: packageAId,
        expiresAt: '2099-12-31T00:00:00Z',
        source: 'manual_admin'
      }
    });

    assert.equal(assigned.statusCode, 201, JSON.stringify(assigned.body));
    assert.equal(assigned.body.packageId, packageAId);
    assert.equal(assigned.body.packageCode, `GLOW-10-${uniqueId}`);
    assert.equal(assigned.body.packageName, 'Glow Course 10 Updated');
    assert.equal(assigned.body.ownershipStatus, 'active');
    assert.equal(assigned.body.totalUnits, 10);
    assert.equal(assigned.body.remainingUnits, 10);
    assert.equal(assigned.body.unitLabel, 'visit');
    assert.equal(JSON.stringify(assigned.body).includes('metadata'), false);
    memberPackageAId = assigned.body.id;

    const row = await pool.query(
      'select package_snapshot_json, metadata_json from clinic_member_packages where clinic_id = $1 and id = $2',
      [tenantA.clinicId, memberPackageAId]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].package_snapshot_json.packageName, 'Glow Course 10 Updated');
    assert.equal(row.rows[0].package_snapshot_json.priceAmount, 9900);
    assert.equal(row.rows[0].metadata_json.assignedVia, 'manual_admin');

    const event = await pool.query(
      `
        select event_summary_json
        from clinic_member_events
        where clinic_id = $1
          and member_id = $2
          and event_type = 'member_package.assigned'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, memberAId]
    );
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].event_summary_json.summary.memberPackageId, memberPackageAId);

    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_member_package'
          and entity_id = $2
          and action_type = 'clinic_member_package.assigned'
        limit 1
      `,
      [tenantA.clinicId, memberPackageAId]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].context_json.summary.packageCode, `GLOW-10-${uniqueId}`);

    const crossPackage = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${memberAId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: { packageId: packageBId }
    });
    assert.equal(crossPackage.statusCode, 404);
    assert.equal(crossPackage.body.error.code, 'SERVICE_PACKAGE_NOT_FOUND');

    const crossMember = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${memberBId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: { packageId: packageAId }
    });
    assert.equal(crossMember.statusCode, 404);
    assert.equal(crossMember.body.error.code, 'MEMBER_NOT_FOUND');

    const invalidUnits = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${memberAId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: { packageId: packageAId, totalUnits: 5, remainingUnits: 6 }
    });
    assert.equal(invalidUnits.statusCode, 400);
    assert.equal(invalidUnits.body.error.code, 'INVALID_MEMBER_PACKAGE');
  });

  await t.test('4. Admin lists member packages without unrelated member rows or raw metadata', async () => {
    const assignedOther = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${otherMemberAId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: { packageId: packageAId, totalUnits: 3, remainingUnits: 2 }
    });
    assert.equal(assignedOther.statusCode, 201, JSON.stringify(assignedOther.body));
    otherMemberPackageAId = assignedOther.body.id;

    const list = await routePackageJson({
      path: `/admin/members/${memberAId}/packages`,
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId)
    });
    assert.equal(list.statusCode, 200, JSON.stringify(list.body));
    const ids = list.body.items.map((item) => item.id);
    assert.ok(ids.includes(memberPackageAId));
    assert.equal(ids.includes(otherMemberPackageAId), false);

    const serialized = JSON.stringify(list.body);
    assert.equal(serialized.includes('metadata'), false);
    assert.equal(serialized.includes('assignedVia'), false);
    assert.equal(serialized.includes('clinicId'), false);
    assert.equal(serialized.includes('leadId'), false);
  });

  await t.test('5. Admin creates manual payment record safely and does not auto-activate packages', async () => {
    const assignedB = await routePackageJson({
      method: 'POST',
      path: `/admin/members/${memberBId}/packages`,
      authenticateRequest: contextFor(tenantB, tenantBOwnerUserId),
      body: { packageId: packageBId }
    });
    assert.equal(assignedB.statusCode, 201, JSON.stringify(assignedB.body));
    memberPackageBId = assignedB.body.id;

    const payment = await routePackageJson({
      method: 'POST',
      path: '/admin/payment-records',
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: {
        memberId: memberAId,
        memberPackageId: memberPackageAId,
        packageId: packageAId,
        amount: 9900,
        currency: 'THB',
        paymentMethod: 'cash_note',
        paymentStatus: 'recorded',
        paymentRef: rawPaymentRef,
        paidAt: '2026-06-06T10:00:00Z'
      }
    });

    assert.equal(payment.statusCode, 201, JSON.stringify(payment.body));
    assert.equal(payment.body.memberId, memberAId);
    assert.equal(payment.body.memberPackageId, memberPackageAId);
    assert.equal(payment.body.packageId, packageAId);
    assert.equal(payment.body.amount, 9900);
    assert.equal(payment.body.currency, 'THB');
    assert.equal(payment.body.paymentStatus, 'recorded');
    assert.equal(payment.body.paymentMethod, 'cash_note');
    assert.equal(payment.body.paymentRef, rawPaymentRef);
    assert.equal(payment.body.paymentRefProvided, true);
    paymentAId = payment.body.id;

    const event = await pool.query(
      `
        select event_summary_json
        from clinic_member_events
        where clinic_id = $1
          and member_id = $2
          and event_type = 'member_payment.recorded'
        order by id desc
        limit 1
      `,
      [tenantA.clinicId, memberAId]
    );
    assert.equal(event.rowCount, 1);
    assert.equal(event.rows[0].event_summary_json.summary.paymentRecordId, paymentAId);
    assert.equal(event.rows[0].event_summary_json.summary.paymentRefProvided, true);

    const audit = await pool.query(
      `
        select context_json
        from audit_logs
        where clinic_id = $1
          and entity_type = 'clinic_payment_record'
          and entity_id = $2
          and action_type = 'clinic_payment_record.created'
        limit 1
      `,
      [tenantA.clinicId, paymentAId]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].context_json.summary.paymentStatus, 'recorded');
    assert.equal(JSON.stringify([event.rows[0], audit.rows[0]]).includes(rawPaymentRef), false);

    const pendingMemberPackage = await pool.query(
      `
        insert into clinic_member_packages (
          clinic_id, member_id, lead_id, package_id, package_snapshot_json,
          ownership_status, total_units, remaining_units, source
        )
        values ($1, $2, $3, $4, $5::jsonb, 'pending', 1, 1, 'manual_admin')
        returning id
      `,
      [
        tenantA.clinicId,
        memberAId,
        leadAId,
        packageAId,
        JSON.stringify({ packageId: packageAId, packageCode: `GLOW-10-${uniqueId}`, packageName: 'Pending Package' })
      ]
    );
    const pendingPackageId = Number(pendingMemberPackage.rows[0].id);
    const pendingPayment = await routePackageJson({
      method: 'POST',
      path: '/admin/payment-records',
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      body: {
        memberPackageId: pendingPackageId,
        amount: 1,
        currency: 'THB',
        paymentStatus: 'recorded',
        paymentMethod: 'manual'
      }
    });
    assert.equal(pendingPayment.statusCode, 201, JSON.stringify(pendingPayment.body));
    const pendingAfter = await pool.query('select ownership_status from clinic_member_packages where id = $1', [pendingPackageId]);
    assert.equal(pendingAfter.rows[0].ownership_status, 'pending');

    const list = await routePackageJson({
      path: '/admin/payment-records',
      authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
      searchParams: { memberId: memberAId }
    });
    assert.equal(list.statusCode, 200, JSON.stringify(list.body));
    assert.ok(list.body.items.some((item) => item.id === paymentAId));
    assert.equal(list.body.items.some((item) => item.memberPackageId === memberPackageBId), false);

    for (const [body, expectedCode] of [
      [{ memberId: memberBId, amount: 1 }, 'MEMBER_NOT_FOUND'],
      [{ memberPackageId: memberPackageBId, amount: 1 }, 'MEMBER_PACKAGE_NOT_FOUND'],
      [{ memberId: memberAId, amount: -1 }, 'INVALID_PAYMENT_RECORD'],
      [{ memberId: memberAId, amount: 1, currency: 'TH' }, 'INVALID_PAYMENT_RECORD'],
      [{ memberId: memberAId, amount: 1, paymentMethod: 'stripe' }, 'INVALID_PAYMENT_METHOD'],
      [{ memberId: memberAId, amount: 1, paymentStatus: 'captured' }, 'INVALID_PAYMENT_STATUS'],
      [{ memberId: memberAId, amount: 1, paymentStatus: 'pending', paidAt: '2026-06-06T10:00:00Z' }, 'INVALID_PAYMENT_RECORD'],
      [{ memberId: memberAId, amount: 1, checkoutUrl: 'https://checkout.example.test/session' }, 'INVALID_PAYMENT_RECORD']
    ]) {
      const res = await routePackageJson({
        method: 'POST',
        path: '/admin/payment-records',
        authenticateRequest: contextFor(tenantA, tenantAOwnerUserId),
        body
      });
      assert.equal(res.statusCode >= 400, true, JSON.stringify(res.body));
      assert.equal(res.body.error.code, expectedCode);
    }
  });

  await t.test('6. Member portal shows package/payment read-only payloads without PII or internal metadata', async () => {
    const token = await requestToken(tenantA, `pr19a-member-a-${uniqueId}@example.com`);
    const session = await routeMemberAccessJson({
      path: `/public/clinics/${tenantA.clinicSlug}/member-portal/session`,
      searchParams: { token }
    });

    assert.equal(session.statusCode, 200, JSON.stringify(session.body));
    assert.ok(Array.isArray(session.body.portal.packages));
    assert.ok(Array.isArray(session.body.portal.payments));
    assert.deepEqual(session.body.packages, session.body.portal.packages);
    assert.deepEqual(session.body.payments, session.body.portal.payments);

    const publicPackage = session.body.portal.packages.find((item) => item.id === memberPackageAId);
    assert.ok(publicPackage);
    assert.deepEqual(Object.keys(publicPackage).sort(), [
      'activatedAt',
      'createdAt',
      'expiresAt',
      'id',
      'ownershipStatus',
      'packageCode',
      'packageName',
      'packageType',
      'remainingUnits',
      'source',
      'totalUnits',
      'unitLabel',
      'updatedAt'
    ]);
    assert.equal(publicPackage.packageCode, `GLOW-10-${uniqueId}`);
    assert.equal(publicPackage.remainingUnits, 10);

    const publicPayment = session.body.portal.payments.find((item) => item.id === paymentAId);
    assert.ok(publicPayment);
    assert.deepEqual(Object.keys(publicPayment).sort(), [
      'amount',
      'createdAt',
      'currency',
      'id',
      'memberPackageId',
      'packageId',
      'paidAt',
      'paymentMethod',
      'paymentRefProvided',
      'paymentStatus',
      'updatedAt'
    ]);
    assert.equal(publicPayment.memberPackageId, memberPackageAId);
    assert.equal(publicPayment.packageId, packageAId);
    assert.equal(publicPayment.paymentRefProvided, true);
    assert.equal(publicPayment.paymentStatus, 'recorded');
    assert.equal(publicPayment.amount, 9900);

    assertNoForbiddenPublicFields(session.body, [
      `pr19a-member-a-${uniqueId}@example.com`,
      '08929a',
      '@pr19a-member-a',
      `raw PR19A member metadata a`,
      `raw PR19A package metadata ${uniqueId}`,
      rawPaymentRef,
      token,
      'clinicId',
      'clinic_id',
      'memberId',
      'member_id',
      'leadId',
      'lead_id',
      'metadata',
      'metadata_json',
      'createdByUserId',
      'recordedByUserId',
      'assignedVia',
      'recordedVia',
      'checkoutUrl',
      'gatewayProvider',
      'webhook',
      'qrCode'
    ]);
  });

  await t.test('7. Public member routes do not expose package/payment mutation, checkout, or gateway endpoints', async () => {
    for (const path of [
      `/public/clinics/${tenantA.clinicSlug}/member-portal/packages`,
      `/public/clinics/${tenantA.clinicSlug}/member-portal/payments`,
      `/public/clinics/${tenantA.clinicSlug}/member-portal/payment-records`,
      `/public/clinics/${tenantA.clinicSlug}/member-portal/checkout`
    ]) {
      const res = await routeMemberAccessJson({
        method: 'POST',
        path,
        body: { token: 'unused' }
      });
      assert.equal(res.statusCode, 404, JSON.stringify(res.body));
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });
});
