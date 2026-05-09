const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function getBucketKey(ipAddress, email) {
  return `${String(ipAddress || "unknown").trim()}::${String(email || "anon")
    .trim()
    .toLowerCase()}`;
}

function cleanup(now = Date.now()) {
  for (const [key, entry] of attempts.entries()) {
    if (entry.resetAt <= now) {
      attempts.delete(key);
    }
  }
}

export function checkLoginRateLimit(ipAddress, email) {
  const now = Date.now();
  cleanup(now);

  const key = getBucketKey(ipAddress, email);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    return {
      allowed: true,
      remaining: MAX_ATTEMPTS,
      retryAfterSeconds: 0
    };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, MAX_ATTEMPTS - current.count),
    retryAfterSeconds: 0
  };
}

export function registerLoginFailure(ipAddress, email) {
  const now = Date.now();
  cleanup(now);

  const key = getBucketKey(ipAddress, email);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS
    });
    return;
  }

  current.count += 1;
  attempts.set(key, current);
}

export function clearLoginFailures(ipAddress, email) {
  attempts.delete(getBucketKey(ipAddress, email));
}
