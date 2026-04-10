import { getSessionFromToken } from "../services/authService.js";

function extractToken(req) {
  const header = req.headers.authorization || "";
  return header.replace("Bearer ", "").trim();
}

export async function attachAuth(req, _res, next) {
  const token = extractToken(req);

  if (!token) {
    req.auth = null;
    return next();
  }

  try {
    req.auth = await getSessionFromToken(token);
  } catch (error) {
    req.auth = null;
  }

  return next();
}

export async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Sessao nao autenticada." });
  }

  const session = await getSessionFromToken(token);

  if (!session) {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }

  req.auth = session;
  return next();
}

export function requireRoles(allowedRoles = []) {
  return async function roleMiddleware(req, res, next) {
    if (!req.auth) {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: "Sessao nao autenticada." });
      }

      const session = await getSessionFromToken(token);
      if (!session) {
        return res.status(401).json({ error: "Sessao invalida ou expirada." });
      }

      req.auth = session;
    }

    if (!allowedRoles.includes(req.auth.membership.role)) {
      return res.status(403).json({ error: "Voce nao possui permissao para esta acao." });
    }

    return next();
  };
}

export const requireAdmin = requireRoles(["owner", "admin", "attendant"]);
export const requireOperationalUser = requireRoles([
  "owner",
  "admin",
  "attendant",
  "barber"
]);
