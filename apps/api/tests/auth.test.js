const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyPassword } = require('../src/modules/auth/password');
const { createSessionToken, verifySessionToken } = require('../src/modules/auth/token');

test('verifyPassword accepts the seeded owner password hash', () => {
  const seededHash =
    'scrypt$flowbiz-owner-salt$b34596e36cbdb3839313ee5ab2be770a3dee8fb46afdc5d2a89cb2f39600060e8010fe215fb6618ff09e20b03a992a1bb86a4577de316a041fc313ebf2e82141';

  assert.equal(verifyPassword('Flowbiz123!', seededHash), true);
  assert.equal(verifyPassword('wrong-password', seededHash), false);
});

test('session tokens can be issued and verified', () => {
  const token = createSessionToken({ userId: '1', clinicId: '10', sessionId: 'session-1' }, 'test-secret', 2);
  const payload = verifySessionToken(token, 'test-secret');

  assert.equal(payload.sub, '1');
  assert.equal(payload.clinicId, '10');
  assert.equal(payload.sid, 'session-1');
});

test('malformed session tokens are rejected without throwing', () => {
  assert.equal(verifySessionToken('fb1.invalid.short', 'test-secret'), null);
  assert.equal(verifySessionToken('not-a-token', 'test-secret'), null);
});