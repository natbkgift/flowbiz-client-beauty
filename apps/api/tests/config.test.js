const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('loadConfig returns local bootstrap defaults', () => {
  const config = loadConfig();

  assert.equal(typeof config.appEnv, 'string');
  assert.equal(typeof config.apiPort, 'number');
  assert.equal(typeof config.webPort, 'number');
  assert.equal(typeof config.authTokenSecret, 'string');
  assert.equal(typeof config.authTokenTtlHours, 'number');
  assert.equal(typeof config.databaseUrl, 'string');
});
