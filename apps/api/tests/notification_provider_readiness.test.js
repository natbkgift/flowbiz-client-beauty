'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../src/common/errors');
const { json } = require('../src/common/http');
const { loadConfig } = require('../src/config');
const { THAI_ERROR_MESSAGES } = require('../src/common/user-messages');
const { handleNotificationRoutes } = require('../src/modules/notifications/routes');
const { getNotificationProviderReadiness } = require('../src/modules/notifications/provider-readiness');
const {
  assertNotificationDryRunAllowed,
  assertNotificationRealDeliveryAllowed
} = require('../src/modules/notifications/provider-guards');

function createMockResponse() {
  return {
    statusCode: null,
    body: '',
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

async function routeJson({ method = 'GET', path, authenticateRequest }) {
  const response = createMockResponse();
  const url = new URL(`http://localhost${path}`);

  try {
    const handled = await handleNotificationRoutes(
      { method, headers: {}, socket: { remoteAddress: '127.18.0.15' } },
      response,
      url,
      {
        authenticateRequest: authenticateRequest || (async () => {
          throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
        }),
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

  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null
  };
}

function adminContext() {
  return {
    currentUser: { id: 1, email: 'owner@flowbiz.local' },
    currentClinic: { id: 1001, slug: 'demo' },
    currentOrganization: { id: 2001 },
    currentWorkspace: { id: 3001 },
    currentMembership: { role: 'owner', permissions: [] }
  };
}

async function withNotificationEnv(overrides, callback) {
  const keys = [
    'NOTIFICATION_DRY_RUN_ENABLED',
    'NOTIFICATION_REAL_DELIVERY_ENABLED',
    'NOTIFICATION_GLOBAL_KILL_SWITCH',
    'NOTIFICATION_EMAIL_ENABLED',
    'NOTIFICATION_EMAIL_PROVIDER',
    'NOTIFICATION_EMAIL_FROM',
    'NOTIFICATION_EMAIL_REPLY_TO',
    'NOTIFICATION_LINE_ENABLED',
    'NOTIFICATION_LINE_PROVIDER',
    'NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN',
    'NOTIFICATION_SMS_ENABLED',
    'NOTIFICATION_SMS_PROVIDER',
    'NOTIFICATION_SMS_FROM'
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test('Notification Provider Readiness - config, kill switch, and API safety', async (t) => {
  await t.test('1. Default config blocks real delivery and exposes disabled channels', () => {
    const readiness = getNotificationProviderReadiness({});

    assert.equal(readiness.realDeliveryEnabled, false);
    assert.equal(readiness.dryRunEnabled, true);
    assert.equal(readiness.globalKillSwitch, true);
    assert.equal(readiness.realDeliveryBlocked, true);
    assert.equal(readiness.channels.email.ready, false);
    assert.equal(readiness.channels.email.blockedReason, 'EMAIL_PROVIDER_DISABLED');
  });

  await t.test('2. Global kill switch blocks real delivery even when provider is configured', () => {
    assert.throws(
      () => assertNotificationRealDeliveryAllowed('email', {
        notifications: {
          dryRunEnabled: true,
          realDeliveryEnabled: true,
          globalKillSwitch: true,
          email: { enabled: true, provider: 'smtp', from: 'noreply@example.com' }
        }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE'
    );
  });

  await t.test('3. Real delivery disabled blocks real delivery before provider checks', () => {
    assert.throws(
      () => assertNotificationRealDeliveryAllowed('email', {
        notifications: {
          dryRunEnabled: true,
          realDeliveryEnabled: false,
          globalKillSwitch: false,
          email: { enabled: true, provider: 'smtp', from: 'noreply@example.com' }
        }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_REAL_DELIVERY_DISABLED'
    );
  });

  await t.test('4. Channel disabled blocks real delivery', () => {
    assert.throws(
      () => assertNotificationRealDeliveryAllowed('email', {
        notifications: {
          realDeliveryEnabled: true,
          globalKillSwitch: false,
          email: { enabled: false, provider: 'smtp', from: 'noreply@example.com' }
        }
      }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_PROVIDER_DISABLED'
    );
  });

  await t.test('5. Missing provider blocks readiness', () => {
    const readiness = getNotificationProviderReadiness({
      notifications: {
        realDeliveryEnabled: true,
        globalKillSwitch: false,
        email: { enabled: true, provider: 'none', from: 'noreply@example.com' }
      }
    });

    assert.equal(readiness.channels.email.ready, false);
    assert.equal(readiness.channels.email.configured, false);
    assert.equal(readiness.channels.email.blockedReason, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  await t.test('6. Missing secret/config marks provider not configured', () => {
    const readiness = getNotificationProviderReadiness({
      notifications: {
        realDeliveryEnabled: true,
        globalKillSwitch: false,
        line: { enabled: true, provider: 'line', channelAccessTokenConfigured: false }
      }
    });

    assert.equal(readiness.channels.line.ready, false);
    assert.equal(readiness.channels.line.configured, false);
    assert.equal(readiness.channels.line.blockedReason, 'LINE_PROVIDER_SECRET_MISSING');
  });

  await t.test('7. Configured provider is still not ready when real delivery remains blocked', () => {
    const readiness = getNotificationProviderReadiness({
      notifications: {
        realDeliveryEnabled: false,
        globalKillSwitch: true,
        sms: { enabled: true, provider: 'twilio', from: '+15555550100' }
      }
    });

    assert.equal(readiness.channels.sms.configured, true);
    assert.equal(readiness.channels.sms.ready, false);
    assert.equal(readiness.channels.sms.blockedReason, 'NOTIFICATION_REAL_DELIVERY_DISABLED');
  });

  await t.test('8. Dry-run remains allowed when real delivery is blocked', () => {
    assert.doesNotThrow(() => assertNotificationDryRunAllowed({
      notifications: {
        dryRunEnabled: true,
        realDeliveryEnabled: false,
        globalKillSwitch: true
      }
    }));
  });

  await t.test('9. Dry-run fails safely when disabled', () => {
    assert.throws(
      () => assertNotificationDryRunAllowed({ notifications: { dryRunEnabled: false } }),
      (error) => error instanceof AppError && error.code === 'NOTIFICATION_DRY_RUN_DISABLED'
    );
  });

  await t.test('10. Unsupported channel fails safely', () => {
    assert.throws(
      () => assertNotificationRealDeliveryAllowed('webhook', {}),
      (error) => error instanceof AppError && error.code === 'UNSUPPORTED_NOTIFICATION_CHANNEL'
    );
  });

  await t.test('11. Every new AppError code has Thai user-message mapping', () => {
    for (const code of [
      'NOTIFICATION_REAL_DELIVERY_DISABLED',
      'NOTIFICATION_GLOBAL_KILL_SWITCH_ACTIVE',
      'NOTIFICATION_PROVIDER_DISABLED',
      'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
      'NOTIFICATION_PROVIDER_SECRET_MISSING',
      'NOTIFICATION_DRY_RUN_DISABLED',
      'UNSUPPORTED_NOTIFICATION_CHANNEL'
    ]) {
      assert.equal(typeof THAI_ERROR_MESSAGES[code], 'string');
      assert.ok(THAI_ERROR_MESSAGES[code].length > 0);
    }
  });

  await t.test('12. Admin can read provider readiness without secret leakage', async () => {
    const res = await withNotificationEnv({
      NOTIFICATION_DRY_RUN_ENABLED: 'true',
      NOTIFICATION_REAL_DELIVERY_ENABLED: 'true',
      NOTIFICATION_GLOBAL_KILL_SWITCH: 'true',
      NOTIFICATION_LINE_ENABLED: 'true',
      NOTIFICATION_LINE_PROVIDER: 'line',
      NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN: 'line-secret-token'
    }, () => routeJson({
      path: '/admin/notification-provider-readiness',
      authenticateRequest: async () => adminContext()
    }));

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.notificationProviders.realDeliveryEnabled, true);
    assert.equal(res.body.notificationProviders.globalKillSwitch, true);
    assert.equal(res.body.notificationProviders.channels.line.configured, true);
    assert.equal(JSON.stringify(res.body).includes('line-secret-token'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body.notificationProviders.channels.line, 'channelAccessToken'), false);
  });

  await t.test('13. Readiness endpoint is read-only', async () => {
    const res = await routeJson({
      method: 'POST',
      path: '/admin/notification-provider-readiness',
      authenticateRequest: async () => adminContext()
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  await t.test('14. Readiness endpoint uses admin notification permissions', async () => {
    const res = await routeJson({
      path: '/admin/notification-provider-readiness',
      authenticateRequest: async () => ({
        ...adminContext(),
        currentMembership: { role: 'viewer', permissions: [] }
      })
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'NOTIFICATION_DRAFT_PERMISSION_DENIED');
  });

  await t.test('15. loadConfig summarizes secret configuration only', async () => {
    await withNotificationEnv({
      NOTIFICATION_LINE_ENABLED: 'true',
      NOTIFICATION_LINE_PROVIDER: 'line',
      NOTIFICATION_LINE_CHANNEL_ACCESS_TOKEN: 'line-secret-token'
    }, () => {
      const config = loadConfig();
      assert.equal(config.notifications.line.channelAccessTokenConfigured, true);
      assert.equal(JSON.stringify(config.notifications).includes('line-secret-token'), false);
    });
  });
});
