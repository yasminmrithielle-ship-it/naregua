import { checkLoginRateLimit } from "../services/loginRateLimitService.js";

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function loginRateLimit(req, res, next) {
  const email = req.body?.email || req.body?.username || "";
  const result = checkLoginRateLimit(getRequestIp(req), email);

  if (result.allowed) {
    return next();
  }

  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  return res.status(429).json({
    error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente."
  });
}
