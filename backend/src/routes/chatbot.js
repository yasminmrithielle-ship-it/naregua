import express from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireChatbotInternal } from "../middleware/chatbotInternal.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureDefaultServices } from "../services/serviceCatalog.js";
import {
  cancelAppointmentReminders,
  scheduleAppointmentReminders
} from "../services/reminderScheduler.js";
import {
  getChatbotContextBySessionName,
  getPrimaryWhatsAppConnection,
  listActiveWhatsAppConnections,
  updateWhatsAppConnectionSync
} from "../services/barbershopService.js";
import { deactivateExpiredOpenSlots, getCurrentSlotReference } from "../services/slotExpiry.js";

const router = express.Router();

const internalAppointmentSchema = z.object({
  sessionName: z.string().trim().min(1, "sessionName obrigatorio"),
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  telefone: z.string().trim().min(8, "Telefone obrigatorio"),
  data: z.string().trim().min(10, "Data obrigatoria"),
  hora: z.string().trim().min(4, "Hora obrigatoria"),
  servico: z.string().trim().min(2, "Servico obrigatorio"),
  observacoes: z.string().trim().optional()
});

const syncSchema = z.object({
  sessionName: z.string().trim().min(1, "sessionName obrigatorio"),
  status: z.string().trim().optional(),
  qrCode: z.string().trim().nullable().optional(),
  phoneNumber: z.string().trim().nullable().optional(),
  lastConnectedAt: z.string().trim().nullable().optional()
});

function asExecutor(client) {
  return {
    query: (text, params) => client.query(text, params)
  };
}

async function ensureServiceExists(client, servico, barbeariaId) {
  const serviceResult = await client.query(
    `
      SELECT id
      FROM servicos
      WHERE barbearia_id = $1
        AND nome = $2
        AND ativo = true
      LIMIT 1
    `,
    [barbeariaId, servico]
  );

  return serviceResult.rows.length > 0;
}

async function upsertCustomer(client, { barbeariaId, nome, telefone }) {
  const result = await client.query(
    `
      INSERT INTO clientes (barbearia_id, nome, telefone)
      VALUES ($1, $2, $3)
      ON CONFLICT (barbearia_id, telefone) DO UPDATE
      SET
        nome = EXCLUDED.nome,
        updated_at = NOW()
      RETURNING id
    `,
    [barbeariaId, nome, telefone]
  );

  return result.rows[0];
}

async function resolveContextOr404(sessionName, res) {
  const context = await getChatbotContextBySessionName(sessionName);

  if (!context) {
    res.status(404).json({ error: "Conexao WhatsApp nao encontrada." });
    return null;
  }

  return context;
}

router.get("/barbershop/context", requireAuth, asyncHandler(async (req, res) => {
  const [settingsResult, connection] = await Promise.all([
    query(
      `
        SELECT *
        FROM chatbot_configuracoes
        WHERE barbearia_id = $1
        LIMIT 1
      `,
      [req.auth.membership.barbershopId]
    ),
    getPrimaryWhatsAppConnection(req.auth.membership.barbershopId)
  ]);

  return res.json({
    user: req.auth.user,
    membership: req.auth.membership,
    barbershop: req.auth.barbershop,
    chatbotSettings: settingsResult.rows[0] || null,
    whatsappConnection: connection
      ? {
          ...connection,
          qrPageUrl: `/chatbot/connections/${connection.session_name}/qr`,
          qrImageUrl: `/chatbot/connections/${connection.session_name}/qr.png`,
          statusUrl: `/chatbot/connections/${connection.session_name}/status`
        }
      : null
  });
}));

router.get("/chatbot/connection", requireAuth, asyncHandler(async (req, res) => {
  const connection = await getPrimaryWhatsAppConnection(req.auth.membership.barbershopId);

  if (!connection) {
    return res.status(404).json({ error: "Nenhuma conexao WhatsApp cadastrada para esta conta." });
  }

  return res.json({
    ...connection,
    qrPageUrl: `/chatbot/connections/${connection.session_name}/qr`,
    qrImageUrl: `/chatbot/connections/${connection.session_name}/qr.png`,
    statusUrl: `/chatbot/connections/${connection.session_name}/status`
  });
}));

router.get("/internal/chatbot/connections", requireChatbotInternal, asyncHandler(async (_req, res) => {
  const connections = await listActiveWhatsAppConnections();
  return res.json(connections);
}));

router.get("/internal/chatbot/context", requireChatbotInternal, asyncHandler(async (req, res) => {
  const sessionName = String(req.query.sessionName || "").trim();

  if (!sessionName) {
    return res.status(400).json({ error: "Parametro sessionName e obrigatorio." });
  }

  const context = await resolveContextOr404(sessionName, res);
  if (!context) {
    return;
  }

  await ensureDefaultServices(context.barbearia_id);

  const servicesResult = await query(
    `
      SELECT id, nome, descricao, duracao, preco, ativo
      FROM servicos
      WHERE barbearia_id = $1
        AND ativo = true
      ORDER BY nome ASC
    `,
    [context.barbearia_id]
  );

  return res.json({
    barbershop: {
      id: context.barbearia_id,
      name: context.barbearia_nome,
      slug: context.barbearia_slug,
      logoUrl: context.logo_url,
      phone: context.phone,
      whatsappNumber: context.whatsapp_number,
      address: context.address,
      subscriptionPlan: context.subscription_plan,
      status: context.barbearia_status,
      timezone: context.timezone,
      primaryColor: context.primary_color,
      accentColor: context.accent_color
    },
    settings: {
      assistantName: context.assistant_name,
      welcomeMessage: context.welcome_message,
      offHoursMessage: context.off_hours_message,
      cancellationMessage: context.cancellation_message,
      rescheduleMessage: context.reschedule_message,
      toneOfVoice: context.tone_of_voice,
      customInstructions: context.custom_instructions,
      allowCancellation: context.allow_cancellation,
      allowReschedule: context.allow_reschedule
    },
    connection: {
      id: context.connection_id,
      sessionName: context.session_name,
      phoneNumber: context.phone_number,
      provider: context.provider,
      status: context.connection_status,
      qrCode: context.qr_code,
      lastConnectedAt: context.last_connected_at
    },
    services: servicesResult.rows
  });
}));

router.get("/internal/chatbot/days", requireChatbotInternal, asyncHandler(async (req, res) => {
  const sessionName = String(req.query.sessionName || "").trim();
  const dataInicial = req.query.dataInicial;

  if (!sessionName) {
    return res.status(400).json({ error: "Parametro sessionName e obrigatorio." });
  }

  const context = await resolveContextOr404(sessionName, res);
  if (!context) {
    return;
  }

  const baseDate = dataInicial ? new Date(`${dataInicial}T00:00:00`) : new Date();
  baseDate.setHours(0, 0, 0, 0);
  const dates = [];

  while (dates.length < 5) {
    const current = new Date(baseDate);
    while (![2, 3, 4, 5, 6].includes(current.getDay())) {
      current.setDate(current.getDate() + 1);
    }
    const currentIso = current.toISOString().slice(0, 10);
    if (!dates.includes(currentIso)) {
      dates.push(currentIso);
    }
    baseDate.setDate(current.getDate() + 1);
  }

  await deactivateExpiredOpenSlots(context.barbearia_id, context.timezone);
  const { date: currentDate, time: currentTime } = getCurrentSlotReference(context.timezone);

  const result = await query(
    `
      SELECT
        h.data,
        COUNT(*) FILTER (
          WHERE h.disponivel = true
            AND a.id IS NULL
            AND (
              h.data > $3::date
              OR (h.data = $3::date AND h.hora >= $4)
            )
        ) AS disponiveis
      FROM horarios h
      LEFT JOIN agendamentos a
        ON a.data = h.data
       AND a.hora = h.hora
       AND a.status != 'cancelado'
       AND a.barbearia_id = h.barbearia_id
      WHERE h.data = ANY($1::date[])
        AND h.barbearia_id = $2
      GROUP BY h.data
      ORDER BY h.data ASC
    `,
    [dates, context.barbearia_id, currentDate, currentTime]
  );

  const map = new Map(
    result.rows.map((row) => [String(row.data).slice(0, 10), Number(row.disponiveis)])
  );

  return res.json(
    dates
      .map((date) => ({
        data: date,
        disponiveis: map.get(date) || 0
      }))
      .filter((item) => item.disponiveis > 0)
  );
}));

router.get("/internal/chatbot/hours", requireChatbotInternal, asyncHandler(async (req, res) => {
  const sessionName = String(req.query.sessionName || "").trim();
  const data = String(req.query.data || "").trim();

  if (!sessionName || !data) {
    return res.status(400).json({ error: "Parametros sessionName e data sao obrigatorios." });
  }

  const context = await resolveContextOr404(sessionName, res);
  if (!context) {
    return;
  }

  await deactivateExpiredOpenSlots(context.barbearia_id, context.timezone);
  const { date: currentDate, time: currentTime } = getCurrentSlotReference(context.timezone);

  const result = await query(
    `
      SELECT h.hora
      FROM horarios h
      LEFT JOIN agendamentos a
        ON a.data = h.data
       AND a.hora = h.hora
       AND a.status != 'cancelado'
       AND a.barbearia_id = h.barbearia_id
      WHERE h.data = $1::date
        AND h.disponivel = true
        AND h.barbearia_id = $2
        AND a.id IS NULL
        AND (
          h.data > $3::date
          OR (h.data = $3::date AND h.hora >= $4)
        )
      ORDER BY h.hora ASC
    `,
    [data, context.barbearia_id, currentDate, currentTime]
  );

  return res.json(result.rows.map((row) => row.hora));
}));

router.get("/internal/chatbot/appointments", requireChatbotInternal, asyncHandler(async (req, res) => {
  const sessionName = String(req.query.sessionName || "").trim();
  const phone = String(req.query.phone || "").replace(/\D/g, "");

  if (!sessionName || !phone) {
    return res.status(400).json({ error: "Parametros sessionName e phone sao obrigatorios." });
  }

  const context = await resolveContextOr404(sessionName, res);
  if (!context) {
    return;
  }

  const result = await query(
    `
      SELECT *
      FROM agendamentos
      WHERE barbearia_id = $1
        AND REGEXP_REPLACE(telefone, '\D', '', 'g') = $2
        AND status != 'cancelado'
      ORDER BY data ASC, hora ASC
    `,
    [context.barbearia_id, phone]
  );

  return res.json(result.rows);
}));

router.post("/internal/chatbot/appointments", requireChatbotInternal, asyncHandler(async (req, res) => {
  const parsed = internalAppointmentSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  const context = await resolveContextOr404(parsed.data.sessionName, res);
  if (!context) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await deactivateExpiredOpenSlots(context.barbearia_id, context.timezone);
    const { date: currentDate, time: currentTime } = getCurrentSlotReference(context.timezone);

    if (
      parsed.data.data < currentDate ||
      (parsed.data.data === currentDate && parsed.data.hora < currentTime)
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Nao e possivel agendar um horario que ja passou" });
    }

    await ensureDefaultServices(context.barbearia_id, client);
    const serviceExists = await ensureServiceExists(
      client,
      parsed.data.servico,
      context.barbearia_id
    );

    if (!serviceExists) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Servico nao cadastrado no catalogo" });
    }

    const disponibilidade = await client.query(
      `
        SELECT h.id
        FROM horarios h
        LEFT JOIN agendamentos a
          ON a.data = h.data
         AND a.hora = h.hora
         AND a.status != 'cancelado'
         AND a.barbearia_id = h.barbearia_id
        WHERE h.data = $1::date
          AND h.hora = $2
          AND h.disponivel = true
          AND h.barbearia_id = $3
          AND a.id IS NULL
        LIMIT 1
      `,
      [parsed.data.data, parsed.data.hora, context.barbearia_id]
    );

    if (!disponibilidade.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Horario indisponivel" });
    }

    const customer = await upsertCustomer(client, {
      barbeariaId: context.barbearia_id,
      nome: parsed.data.nome,
      telefone: parsed.data.telefone
    });

    const inserted = await client.query(
      `
        INSERT INTO agendamentos (
          barbearia_id,
          cliente_id,
          nome,
          telefone,
          data,
          hora,
          servico,
          status,
          origem,
          observacoes
        )
        VALUES ($1, $2, $3, $4, $5::date, $6, $7, 'confirmado', 'whatsapp', $8)
        RETURNING *
      `,
      [
        context.barbearia_id,
        customer.id,
        parsed.data.nome,
        parsed.data.telefone,
        parsed.data.data,
        parsed.data.hora,
        parsed.data.servico,
        parsed.data.observacoes || null
      ]
    );

    await client.query(
      `
        UPDATE horarios
        SET disponivel = false
        WHERE barbearia_id = $1
          AND data = $2::date
          AND hora = $3
      `,
      [context.barbearia_id, parsed.data.data, parsed.data.hora]
    );

    await scheduleAppointmentReminders(asExecutor(client), inserted.rows[0]);
    await client.query("COMMIT");
    return res.status(201).json(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

router.delete("/internal/chatbot/appointments/:id", requireChatbotInternal, asyncHandler(async (req, res) => {
  const sessionName = String(req.query.sessionName || "").trim();
  const appointmentId = Number(req.params.id);

  if (!sessionName || !Number.isInteger(appointmentId)) {
    return res.status(400).json({ error: "sessionName e id validos sao obrigatorios." });
  }

  const context = await resolveContextOr404(sessionName, res);
  if (!context) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        UPDATE agendamentos
        SET status = 'cancelado',
            updated_at = NOW()
        WHERE id = $1
          AND barbearia_id = $2
        RETURNING *
      `,
      [appointmentId, context.barbearia_id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agendamento nao encontrado" });
    }

    await client.query(
      `
        UPDATE horarios
        SET disponivel = true
        WHERE barbearia_id = $1
          AND data = $2::date
          AND hora = $3
      `,
      [context.barbearia_id, result.rows[0].data, result.rows[0].hora]
    );

    await cancelAppointmentReminders(asExecutor(client), appointmentId);
    await client.query("COMMIT");
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

router.post("/internal/chatbot/connections/sync", requireChatbotInternal, asyncHandler(async (req, res) => {
  const parsed = syncSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  const record = await updateWhatsAppConnectionSync(parsed.data);

  if (!record) {
    return res.status(404).json({ error: "Conexao nao encontrada." });
  }

  return res.json(record);
}));

export default router;
