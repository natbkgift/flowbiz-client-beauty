const crypto = require('node:crypto');

function hashPassword(password, salt) {
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, salt, expectedHash] = storedHash.split('$');

  if (algorithm !== 'scrypt' || !salt || !expectedHash) {
    return false;
  }

  const calculated = crypto.scryptSync(password, salt, expectedHash.length / 2).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(expectedHash, 'hex'));
}

module.exports = {
  hashPassword,
  verifyPassword
};