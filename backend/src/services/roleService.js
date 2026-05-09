const PUBLIC_ROLE_MAP = {
  owner: "owner",
  admin: "admin",
  barber: "barbeiro",
  attendant: "recepcao",
  barbeiro: "barbeiro",
  recepcao: "recepcao"
};

const LEGACY_ROLE_MAP = {
  owner: "owner",
  admin: "admin",
  barbeiro: "barber",
  recepcao: "attendant",
  barber: "barber",
  attendant: "attendant"
};

export function toPublicRole(role) {
  return PUBLIC_ROLE_MAP[String(role || "").trim().toLowerCase()] || "admin";
}

export function toLegacyRole(role) {
  return LEGACY_ROLE_MAP[String(role || "").trim().toLowerCase()] || "admin";
}

export function matchesRole(role, allowedRoles = []) {
  const normalizedRole = toPublicRole(role);
  return allowedRoles.map(toPublicRole).includes(normalizedRole);
}
