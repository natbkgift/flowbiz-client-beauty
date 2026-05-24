const crypto = require('node:crypto');

function sign(payloadEncoded, secret) {
  return crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
}

function createSessionToken(payload, secret, ttlHours) {
  const now = Math.floor(Date.now() / 1000);
  const sessionPayload = {
    sub: payload.userId,
    clinicId: payload.clinicId,
    sid: payload.sessionId,
    iat: now,
    exp: now + ttlHours * 60 * 60
  };

  const payloadEncoded = Buffer.from(JSON.stringify(sessionPayload)).toString('base64url');
  const signature = sign(payloadEncoded, secret);
  return `fb1.${payloadEncoded}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (typeof token !== 'string' || !token) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 3 || parts[0] !== 'fb1') {
    return null;
  }

  try {
    const payloadEncoded = parts[1];
    const providedSignature = parts[2];
    const expectedSignature = sign(payloadEncoded, secret);

    if (providedSignature.length !== expectedSignature.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.clinicId !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  createSessionToken,
  verifySessionToken
};