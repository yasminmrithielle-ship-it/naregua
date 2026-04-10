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
    subscriptionPlan = "starter",
    sessionName = null
  }
) {
  const normalizedSlug = slug || (await buildUniqueSlug(name, executor));
  const resolvedSessionName = sessionName || normalizedSlug;

  await executor.query(
    `
      INSERT INTO barbearias (
        id,
        nome,
        slug,
        logo_url,
        phone,
        whatsapp_number,
        address,
        subscription_plan,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      ON CONFLICT (id) DO UPDATE
      SET
        nome = EXCLUDED.nome,
        slug = EXCLUDED.slug,
        logo_url = COALESCE(EXCLUDED.logo_url, barbearias.logo_url),
        phone = COALESCE(EXCLUDED.phone, barbearias.phone),
        whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, barbearias.whatsapp_number),
        address = COALESCE(EXCLUDED.address, barbearias.address),
        subscription_plan = COALESCE(EXCLUDED.subscription_plan, barbearias.subscription_plan),
        updated_at = NOW()
    `,
    [
      barbershopId,
      name,
      normalizedSlug,
      logoUrl,
      phone,
      whatsappNumber,
      address,
      subscriptionPlan
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
        phone_number,
        provider,
        status,
        webhook_secret,
        ativo
      )
      VALUES ($1, $2, $3, 'whatsapp-web.js', 'disconnected', gen_random_uuid()::text, true)
      ON CONFLICT (session_name) DO NOTHING
    `,
    [barbershopId, resolvedSessionName, whatsappNumber]
  );

  return {
    barbershopId,
    slug: normalizedSlug,
    sessionName: resolvedSessionName
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
      WHERE b.status = 'active'
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
        phone_number,
        provider,
        status,
        webhook_secret,
        ativo
      )
      SELECT
        b.id,
        COALESCE(NULLIF(b.slug, ''), b.id),
        b.whatsapp_number,
        'whatsapp-web.js',
        'disconnected',
        gen_random_uuid()::text,
        true
      FROM barbearias b
      WHERE b.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM conexoes_whatsapp c
          WHERE c.barbearia_id = b.id
            AND c.ativo = true
        )
      ON CONFLICT (session_name) DO NOTHING
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

  return result.rows[0] || null;
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

  return result.rows;
}

export async function getChatbotContextBySessionName(sessionName) {
  const result = await query(
    `
      SELECT
        c.id AS connection_id,
        c.session_name,
        c.phone_number,
        c.provider,
        c.status AS connection_status,
        c.qr_code,
        c.last_connected_at,
        c.barbearia_id,
        b.nome AS barbearia_nome,
        b.slug AS barbearia_slug,
        b.logo_url,
        b.phone AS phone,
        b.whatsapp_number,
        b.address,
        b.subscription_plan,
        b.status AS barbearia_status,
        b.timezone,
        b.primary_color,
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
      WHERE c.session_name = $1
        AND c.ativo = true
      LIMIT 1
    `,
    [sessionName]
  );

  return result.rows[0] || null;
}

export async function updateWhatsAppConnectionSync({
  sessionName,
  status,
  qrCode = null,
  phoneNumber = null,
  lastConnectedAt = null
}) {
  const result = await query(
    `
      UPDATE conexoes_whatsapp
      SET
        status = COALESCE($2, status),
        qr_code = $3,
        phone_number = COALESCE($4, phone_number),
        last_connected_at = COALESCE($5::timestamp, last_connected_at),
        updated_at = NOW()
      WHERE session_name = $1
      RETURNING *
    `,
    [sessionName, status || null, qrCode, phoneNumber, lastConnectedAt]
  );

  return result.rows[0] || null;
}
