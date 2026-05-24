const memoryCache = new Map();

function checkRateLimit(request, limit, windowMs) {
  const clinicId = request.params?.clinicId || request.query?.clinicId || 'global';
  const ip = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || '127.0.0.1';
  const key = `${clinicId}:${ip}`;

  const now = Date.now();
  
  if (!memoryCache.has(key)) {
    memoryCache.set(key, []);
  }

  const timestamps = memoryCache.get(key);
  
  // Filter timestamps within the sliding window
  const activeTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (activeTimestamps.length >= limit) {
    return {
      allowed: false,
      message: `Rate limit exceeded. Maximum allowed is ${limit} requests per ${windowMs / 1000} seconds.`
    };
  }

  activeTimestamps.push(now);
  memoryCache.set(key, activeTimestamps);

  return { allowed: true };
}

module.exports = {
  checkRateLimit
};
