import dotenv from "dotenv";

dotenv.config();

const DEFAULT_CHATBOT_SECRET = "barbergo-chatbot-secret";
const DATABASE_PLACEHOLDERS = ["PROJECT_REF", "REGION", "SENHA_REAL", "SUA_SENHA"];
const RAILWAY_ENV_KEYS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_PUBLIC_DOMAIN",
  "RAILWAY_STATIC_URL"
];

export const BARBERSHOP_TIMEZONE =
  process.env.BARBEARIA_TIMEZONE || "America/Sao_Paulo";

function normalizePublicUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");

  if (!raw || raw.includes("SEU-") || raw.includes("seudominio.com")) {
    return "";
  }

  try {
    return new URL(raw).origin;
  } catch (error) {
    return raw;
  }
}

export function getPublicApiUrl() {
  return normalizePublicUrl(process.env.API_URL || "");
}

export function getPublicChatbotUrl() {
  const candidates = [
    process.env.CHATBOT_PUBLIC_URL || "",
    process.env.VITE_CHATBOT_URL || "",
    process.env.CHATBOT_WEBHOOK_URL || ""
  ];

  for (const candidate of candidates) {
    const normalized = normalizePublicUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function buildPublicChatbotUrl(path = "") {
  const baseUrl = getPublicChatbotUrl();

  if (!path) {
    return baseUrl;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return baseUrl ? `${baseUrl}${path}` : path;
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

export function getJwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

export function getChatbotEnabled() {
  return process.env.CHATBOT_ENABLED === "true";
}

export function getChatbotInternalSecret() {
  return process.env.CHATBOT_INTERNAL_SECRET || DEFAULT_CHATBOT_SECRET;
}

export function getSessionTtlDays() {
  return Number(process.env.JWT_TTL_DAYS || 7);
}

export function getSaasTrialDays() {
  return Number(process.env.SAAS_TRIAL_DAYS || 14);
}

export function getCorsOrigins() {
  return String(process.env.CORS_ORIGINS || process.env.API_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getSeedConfig() {
  const ownerEmail = String(process.env.SEED_OWNER_EMAIL || "").trim().toLowerCase();
  const ownerPassword = String(process.env.SEED_OWNER_PASSWORD || "").trim();
  const barbershopName = String(process.env.SEED_BARBERSHOP_NAME || "").trim();

  if (!ownerEmail || !ownerPassword || !barbershopName) {
    return null;
  }

  return {
    ownerName: process.env.SEED_OWNER_NAME || "Administrador",
    ownerEmail,
    ownerPassword,
    barbershopName,
    barbershopSlug: process.env.SEED_BARBERSHOP_SLUG || "barbearia-demo",
    phone: process.env.SEED_BARBERSHOP_PHONE || null,
    whatsappNumber: process.env.SEED_WHATSAPP_NUMBER || null,
    address: process.env.SEED_BARBERSHOP_ADDRESS || null
  };
}

export function isRailwayRuntime() {
  return RAILWAY_ENV_KEYS.some((key) => Boolean(process.env[key]));
}

export function getRuntimeSummary() {
  const databaseUrl = getDatabaseUrl();
  let databaseHost = "";

  try {
    databaseHost = databaseUrl ? new URL(databaseUrl).hostname : "";
  } catch (error) {
    databaseHost = "";
  }

  return {
    apiUrl: getPublicApiUrl(),
    chatbotUrl: getPublicChatbotUrl(),
    databaseHost,
    chatbotEnabled: getChatbotEnabled(),
    hasDatabaseUrl: Boolean(databaseUrl),
    hasJwtSecret: Boolean(getJwtSecret()),
    corsOrigins: getCorsOrigins()
  };
}

export function validateRuntimeConfig() {
  const errors = [];
  const warnings = [];
  const databaseUrl = getDatabaseUrl();
  const apiUrl = getPublicApiUrl();
  const railwayRuntime = isRailwayRuntime();

  if (!databaseUrl) {
    errors.push("DATABASE_URL nao configurada.");
  }

  if (databaseUrl && DATABASE_PLACEHOLDERS.some((item) => databaseUrl.includes(item))) {
    errors.push(
      "DATABASE_URL ainda contem placeholders. Cole a string real do banco/Supabase."
    );
  }

  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);

      if (parsed.hostname.startsWith("db.") && parsed.hostname.endsWith(".supabase.co")) {
        if (railwayRuntime) {
          errors.push(
            "DATABASE_URL esta usando o host direto db.<projeto>.supabase.co. No Railway use a URI de Connection Pooling (...pooler.supabase.com)."
          );
        } else {
          warnings.push(
            "DATABASE_URL esta usando o host direto db.<projeto>.supabase.co. Ambientes Windows/IPv4 podem falhar por IPv6; prefira a URI de Connection Pooling (...pooler.supabase.com)."
          );
        }
      }
    } catch (error) {
      errors.push("DATABASE_URL esta em formato invalido.");
    }
  }

  if (!getJwtSecret()) {
    errors.push("JWT_SECRET nao configurado.");
  } else if (getJwtSecret().length < 24) {
    warnings.push("JWT_SECRET esta curto. Prefira um segredo com 24+ caracteres.");
  }

  if (!apiUrl) {
    warnings.push(
      "API_URL nao configurada. Defina a URL publica do servico para links absolutos do painel e do chatbot."
    );
  } else if (!/^https?:\/\//i.test(apiUrl)) {
    errors.push("API_URL deve comecar com http:// ou https://");
  }

  if (getChatbotEnabled() && getChatbotInternalSecret() === DEFAULT_CHATBOT_SECRET) {
    warnings.push(
      "CHATBOT_INTERNAL_SECRET esta com o valor padrao. Troque antes de expor o ambiente em producao."
    );
  }

  if (!getChatbotEnabled() && !getPublicChatbotUrl()) {
    warnings.push(
      "CHATBOT_PUBLIC_URL/VITE_CHATBOT_URL nao configurado. O painel exibira apenas status local do chatbot."
    );
  }

  if (!getSeedConfig()) {
    warnings.push(
      "Seed inicial desativado. Use /auth/register para criar a primeira barbearia SaaS."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
