import { getSessionFromToken } from "../services/authService.js";
import { matchesRole } from "../services/roleService.js";

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

  try {
    const session = await getSessionFromToken(token);

    if (!session) {
      return res.status(401).json({ error: "Sessao invalida ou expirada." });
    }

    req.auth = session;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
}

export async function requireTenant(req, res, next) {
  if (!req.auth) {
    return requireAuth(req, res, () => requireTenant(req, res, next));
  }

  const barbeariaId = req.auth?.membership?.barbershopId;

  if (!barbeariaId) {
    return res.status(403).json({ error: "Tenant da barbearia nao encontrado na sessao." });
  }

  req.tenant = {
    barbershopId: barbeariaId
  };

  return next();
}

export function requireRole(allowedRoles = []) {
  return async function roleMiddleware(req, res, next) {
    if (!req.auth) {
      return requireAuth(req, res, () => roleMiddleware(req, res, next));
    }

    if (!matchesRole(req.auth.membership.role, allowedRoles)) {
      return res.status(403).json({ error: "Voce nao possui permissao para esta acao." });
    }

    return next();
  };
}

export const requireRoles = requireRole;
export const requireAdmin = requireRole(["owner", "admin", "recepcao"]);
export const requireOperationalUser = requireRole([
  "owner",
  "admin",
  "recepcao",
  "barbeiro"
]);
