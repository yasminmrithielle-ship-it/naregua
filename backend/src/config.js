import dotenv from "dotenv";

dotenv.config();

export const DEFAULT_BARBERSHOP_ID = process.env.SEED_BARBERSHOP_ID || "default";
export const DEFAULT_BARBERSHOP_NAME =
  process.env.SEED_BARBERSHOP_NAME ||
  process.env.BARBEARIA_NOME ||
  "Barbearia Principal";
export const BARBERSHOP_TIMEZONE =
  process.env.BARBEARIA_TIMEZONE || "America/Sao_Paulo";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_OWNER_EMAIL = "admin@barbergo.local";
const DEFAULT_CHATBOT_SECRET = "barbergo-chatbot-secret";
const DATABASE_PLACEHOLDERS = ["PROJECT_REF", "REGION", "SENHA_REAL", "SUA_SENHA"];
const RAILWAY_ENV_KEYS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_PUBLIC_DOMAIN",
  "RAILWAY_STATIC_URL"
];

export function getPublicApiUrl() {
  return process.env.API_URL || "";
}

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

export function getChatbotEnabled() {
  return process.env.CHATBOT_ENABLED === "true";
}

export function getChatbotInternalSecret() {
  return process.env.CHATBOT_INTERNAL_SECRET || DEFAULT_CHATBOT_SECRET;
}

export function getSessionTtlDays() {
  return Number(process.env.SESSION_TTL_DAYS || 30);
}

export function getSeedConfig() {
  const legacyAdminUser = process.env.ADMIN_USER || DEFAULT_ADMIN_USERNAME;
  const ownerEmail =
    process.env.SEED_OWNER_EMAIL ||
    (legacyAdminUser.includes("@")
      ? legacyAdminUser.toLowerCase()
      : DEFAULT_OWNER_EMAIL);

  return {
    ownerName: process.env.SEED_OWNER_NAME || "Administrador",
    ownerEmail,
    ownerPassword:
      process.env.SEED_OWNER_PASSWORD ||
      process.env.ADMIN_PASS ||
      DEFAULT_ADMIN_PASSWORD,
    barbershopName: DEFAULT_BARBERSHOP_NAME,
    barbershopSlug:
      process.env.SEED_BARBERSHOP_SLUG || process.env.BARBEARIA_SLUG || "barbearia-principal",
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
  const seed = getSeedConfig();
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
    seedBarbershop: seed.barbershopName,
    seedOwnerEmail: seed.ownerEmail
  };
}

export function validateRuntimeConfig() {
  const errors = [];
  const warnings = [];
  const databaseUrl = getDatabaseUrl();
  const apiUrl = getPublicApiUrl();
  const railwayRuntime = isRailwayRuntime();
  const seed = getSeedConfig();

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
            "DATABASE_URL esta usando o host direto db.<projeto>.supabase.co. Isso pode funcionar localmente, mas ambientes Windows/IPv4 podem falhar por IPv6; prefira a URI de Connection Pooling (...pooler.supabase.com)."
          );
        }
      }

      if (!parsed.username || !parsed.password) {
        warnings.push(
          "DATABASE_URL parece sem usuario ou senha completos. Confira a URI copiada do banco."
        );
      }
    } catch (error) {
      errors.push("DATABASE_URL esta em formato invalido.");
    }
  }

  if (!apiUrl) {
    warnings.push(
      "API_URL nao configurada. Defina a URL publica do servico para links absolutos do painel e do chatbot."
    );
  } else if (!/^https?:\/\//i.test(apiUrl)) {
    errors.push("API_URL deve comecar com http:// ou https://");
  }

  if (!seed.ownerEmail) {
    errors.push("SEED_OWNER_EMAIL nao configurado.");
  }

  if (!seed.ownerPassword) {
    errors.push("SEED_OWNER_PASSWORD/ADMIN_PASS nao configurado.");
  }

  if (seed.ownerPassword === DEFAULT_ADMIN_PASSWORD) {
    warnings.push(
      "A senha inicial da conta proprietaria ainda esta com o padrao admin123. Troque antes de publicar."
    );
  }

  if (getChatbotEnabled() && getChatbotInternalSecret() === DEFAULT_CHATBOT_SECRET) {
    warnings.push(
      "CHATBOT_INTERNAL_SECRET esta com o valor padrao. Troque antes de expor o ambiente em producao."
    );
  }

  if (!getChatbotEnabled() && !getPublicChatbotUrl()) {
    warnings.push(
      "CHATBOT_PUBLIC_URL/VITE_CHATBOT_URL nao configurado. O painel so exibira QR se o chatbot estiver integrado neste mesmo servico."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
