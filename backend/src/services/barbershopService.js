import { randomUUID } from "crypto";
import { query } from "../db.js";

export function normalizeSlug(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function slugExists(slug, executor = { query }) {
  const result = await executor.query(
    `
      SELECT 1
      FROM barbearias
      WHERE slug = $1
      LIMIT 1
    `,
    [slug]
  );

  return result.rows.length > 0;
}

export async function buildUniqueSlug(baseValue, executor = { query }) {
  const baseSlug = normalizeSlug(baseValue) || "barbearia";

  if (!(await slugExists(baseSlug, executor))) {
    return baseSlug;
  }

  for (let attempt = 2; attempt <= 9999; attempt += 1) {
    const candidate = `${baseSlug}-${attempt}`;
    if (!(await slugExists(candidate, executor))) {
      return candidate;
    }
  }

  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export function createBarbershopId() {
  return randomUUID();
}

function normalizePlanLabel(_plan = "plano") {
  return "Plano";
}

export async function provisionBarbershopScaffold(
  executor,
  {
    barbershopId,
    name,
    slug,
    logoUrl = null,
    phone = null,
    whatsappNumber = null,
    address = null,
    subscriptionPlan = "plano",
    sessionName = null,
    timezone = "America/Sao_Paulo"
  }
) {
  const normalizedSlug = slug || (await buildUniqueSlug(name, executor));
  const resolvedSessionName = sessionName || `barbearia-${barbershopId}`;
  const resolvedSessionPath = `.wwebjs_auth/barbearia-${barbershopId}`;

  await executor.query(
    `
      INSERT INTO barbearias (
        id,
        nome,
        slug,
        logo_url,
        phone,
        telefone,
        whatsapp_number,
        address,
        subscription_plan,
        plano,
        status,
        timezone,
        primary_color,
        cor_primaria
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $5,
        $6,
        $7,
        $8,
        $9,
        'teste',
        $10,
        '#D4A64A',
        '#D4A64A'
      )
      ON CONFLICT (id) DO UPDATE
      SET
        nome = EXCLUDED.nome,
        slug = EXCLUDED.slug,
        logo_url = COALESCE(EXCLUDED.logo_url, barbearias.logo_url),
        phone = COALESCE(EXCLUDED.phone, barbearias.phone),
        telefone = COALESCE(EXCLUDED.telefone, barbearias.telefone, barbearias.phone),
        whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, barbearias.whatsapp_number),
        address = COALESCE(EXCLUDED.address, barbearias.address),
        subscription_plan = COALESCE(EXCLUDED.subscription_plan, barbearias.subscription_plan),
        plano = COALESCE(EXCLUDED.plano, barbearias.plano),
        timezone = COALESCE(EXCLUDED.timezone, barbearias.timezone),
        updated_at = NOW(),
        atualizado_em = NOW()
    `,
    [
      barbershopId,
      name,
      normalizedSlug,
      logoUrl,
      phone,
      whatsappNumber,
      address,
      subscriptionPlan,
      normalizePlanLabel(subscriptionPlan),
      timezone
    ]
  );

  await executor.query(
    `
      INSERT INTO chatbot_configuracoes (
        barbearia_id,
        assistant_name,
        welcome_message,
        off_hours_message,
        cancellation_message,
        reschedule_message,
        tone_of_voice,
        custom_instructions,
        allow_cancellation,
        allow_reschedule
      )
      VALUES (
        $1,
        'Assistente da barbearia',
        $2,
        'No momento estamos fora do horario de atendimento. Responderemos assim que possivel.',
        'Seu agendamento foi cancelado com sucesso.',
        'Vamos remarcar seu horario. Informe uma nova data desejada.',
        'friendly',
        NULL,
        true,
        true
      )
      ON CONFLICT (barbearia_id) DO NOTHING
    `,
    [
      barbershopId,
      `Ola! Seja bem-vindo(a) a ${name}. Como posso ajudar com seu agendamento hoje?`
    ]
  );

  await executor.query(
    `
      INSERT INTO conexoes_whatsapp (
        barbearia_id,
        session_name,
        session_path,
        phone_number,
        telefone_conectado,
        provider,
        status,
        webhook_secret,
        ativo
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $4,
        'whatsapp-web.js',
        'aguardando_qr',
        gen_random_uuid()::text,
        true
      )
      ON CONFLICT (barbearia_id) DO UPDATE
      SET
        session_name = EXCLUDED.session_name,
        session_path = EXCLUDED.session_path,
        phone_number = COALESCE(EXCLUDED.phone_number, conexoes_whatsapp.phone_number),
        updated_at = NOW(),
        atualizado_em = NOW()
    `,
    [barbershopId, resolvedSessionName, resolvedSessionPath, whatsappNumber]
  );

  return {
    barbershopId,
    slug: normalizedSlug,
    sessionName: resolvedSessionName,
    sessionPath: resolvedSessionPath
  };
}

export async function ensureChatbotScaffoldForActiveBarbershops(executor = { query }) {
  await executor.query(
    `
      INSERT INTO chatbot_configuracoes (
        barbearia_id,
        assistant_name,
        welcome_message,
        off_hours_message,
        cancellation_message,
        reschedule_message,
        tone_of_voice,
        custom_instructions,
        allow_cancellation,
        allow_reschedule
      )
      SELECT
        b.id,
        'Assistente da barbearia',
        'Ola! Seja bem-vindo(a) a ' || b.nome || '. Como posso ajudar com seu agendamento hoje?',
        'No momento estamos fora do horario de atendimento. Responderemos assim que possivel.',
        'Seu agendamento foi cancelado com sucesso.',
        'Vamos remarcar seu horario. Informe uma nova data desejada.',
        'friendly',
        NULL,
        true,
        true
      FROM barbearias b
      WHERE b.status IN ('ativo', 'teste', 'active')
        AND NOT EXISTS (
          SELECT 1
          FROM chatbot_configuracoes c
          WHERE c.barbearia_id = b.id
        )
    `
  );

  await executor.query(
    `
      INSERT INTO conexoes_whatsapp (
        barbearia_id,
        session_name,
        session_path,
        phone_number,
        telefone_conectado,
        provider,
        status,
        webhook_secret,
        ativo
      )
      SELECT
        b.id,
        'barbearia-' || b.id,
        '.wwebjs_auth/barbearia-' || b.id,
        b.whatsapp_number,
        b.whatsapp_number,
        'whatsapp-web.js',
        'aguardando_qr',
        gen_random_uuid()::text,
        true
      FROM barbearias b
      WHERE b.status IN ('ativo', 'teste', 'active')
        AND NOT EXISTS (
          SELECT 1
          FROM conexoes_whatsapp c
          WHERE c.barbearia_id = b.id
        )
    `
  );
}

export async function getBarbershopById(barbershopId) {
  const result = await query(
    `
      SELECT *
      FROM barbearias
      WHERE id = $1
      LIMIT 1
    `,
    [barbershopId]
  );

  return result.rows[0] || null;
}

export async function getBarbershopDisplayName(barbershopId) {
  const result = await query(
    `
      SELECT nome
      FROM barbearias
      WHERE id = $1
      LIMIT 1
    `,
    [barbershopId]
  );

  return result.rows[0]?.nome || "sua barbearia";
}

function mapConnectionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    telefone_conectado: row.telefone_conectado || row.phone_number,
    ultima_conexao: row.ultima_conexao || row.last_connected_at,
    qr_data_url: row.qr_data_url || null,
    session_path: row.session_path || `.wwebjs_auth/barbearia-${row.barbearia_id}`
  };
}

export async function getPrimaryWhatsAppConnection(barbershopId) {
  const result = await query(
    `
      SELECT *
      FROM conexoes_whatsapp
      WHERE barbearia_id = $1
        AND ativo = true
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [barbershopId]
  );

  return mapConnectionRow(result.rows[0] || null);
}

export async function listActiveWhatsAppConnections() {
  const result = await query(
    `
      SELECT *
      FROM conexoes_whatsapp
      WHERE ativo = true
      ORDER BY created_at ASC
    `
  );

  return result.rows.map(mapConnectionRow);
}

async function getChatbotContextWhere(whereClause, value) {
  const result = await query(
    `
      SELECT
        c.id AS connection_id,
        c.session_name,
        c.session_path,
        c.phone_number,
        c.telefone_conectado,
        c.provider,
        c.status AS connection_status,
        c.qr_code,
        c.qr_data_url,
        COALESCE(c.ultima_conexao, c.last_connected_at) AS last_connected_at,
        c.barbearia_id,
        b.nome AS barbearia_nome,
        b.slug AS barbearia_slug,
        b.logo_url,
        COALESCE(b.telefone, b.phone) AS telefone,
        b.whatsapp_number,
        b.address,
        COALESCE(b.plano, b.subscription_plan) AS plano,
        b.status AS barbearia_status,
        b.timezone,
        COALESCE(b.cor_primaria, b.primary_color) AS cor_primaria,
        b.accent_color,
        s.assistant_name,
        s.welcome_message,
        s.off_hours_message,
        s.cancellation_message,
        s.reschedule_message,
        s.tone_of_voice,
        s.custom_instructions,
        s.allow_cancellation,
        s.allow_reschedule
      FROM conexoes_whatsapp c
      INNER JOIN barbearias b
        ON b.id = c.barbearia_id
      LEFT JOIN chatbot_configuracoes s
        ON s.barbearia_id = b.id
      WHERE ${whereClause}
        AND c.ativo = true
      LIMIT 1
    `,
    [value]
  );

  return result.rows[0] || null;
}

export async function getChatbotContextBySessionName(sessionName) {
  return getChatbotContextWhere("c.session_name = $1", sessionName);
}

export async function getChatbotContextByBarbershopId(barbershopId) {
  return getChatbotContextWhere("c.barbearia_id = $1", barbershopId);
}

export async function updateWhatsAppConnectionSync({
  barbeariaId = null,
  sessionName = null,
  status,
  qrCode = null,
  qrDataUrl = null,
  phoneNumber = null,
  lastConnectedAt = null
}) {
  const identifier = barbeariaId || sessionName;

  if (!identifier) {
    return null;
  }

  const result = await query(
    `
      UPDATE conexoes_whatsapp
      SET
        status = COALESCE($3, status),
        qr_code = $4,
        qr_data_url = $5,
        phone_number = COALESCE($6, phone_number),
        telefone_conectado = COALESCE($6, telefone_conectado),
        last_connected_at = COALESCE($7::timestamp, last_connected_at),
        ultima_conexao = COALESCE($7::timestamp, ultima_conexao),
        updated_at = NOW(),
        atualizado_em = NOW()
      WHERE ($1::text IS NOT NULL AND barbearia_id = $1)
         OR ($2::text IS NOT NULL AND session_name = $2)
      RETURNING *
    `,
    [
      barbeariaId,
      sessionName,
      status || null,
      qrCode,
      qrDataUrl,
      phoneNumber,
      lastConnectedAt
    ]
  );

  return mapConnectionRow(result.rows[0] || null);
}
