import express from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { attachAuth, requireAdmin, requireAuth } from "../middleware/auth.js";
import { requireChatbotInternal } from "../middleware/chatbotInternal.js";
import { requireFeatureAccess } from "../middleware/subscriptionAccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildPublicChatbotUrl } from "../config.js";
import { ensureDefaultServices } from "../services/serviceCatalog.js";
import {
  cancelAppointmentReminders,
  scheduleAppointmentReminders
} from "../services/reminderScheduler.js";
import {
  disconnectTenantChatbotSession,
  getTenantChatbotStatus,
  getTenantQrCode,
  listChatbotPublicConnections,
  restartTenantChatbotSession,
  startTenantChatbotSession
} from "../services/chatbotGateway.js";
import {
  getChatbotContextByBarbershopId,
  getChatbotContextBySessionName,
  getPrimaryWhatsAppConnection,
  updateWhatsAppConnectionSync
} from "../services/barbershopService.js";
import { assertFeatureAccess } from "../services/saasService.js";
import { deactivateExpiredOpenSlots, getCurrentSlotReference } from "../services/slotExpiry.js";

const router = express.Router();

const internalAppointmentSchema = z.object({
  barbeariaId: z.string().trim().optional(),
  sessionName: z.string().trim().optional(),
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  telefone: z.string().trim().min(8, "Telefone obrigatorio"),
  data: z.string().trim().min(10, "Data obrigatoria"),
  hora: z.string().trim().min(4, "Hora obrigatoria"),
  servico: z.string().trim().min(2, "Servico obrigatorio"),
  observacoes: z.string().trim().optional()
});

const syncSchema = z.object({
  barbeariaId: z.string().trim().optional(),
  sessionName: z.string().trim().optional(),
  status: z.string().trim().optional(),
  qrCode: z.string().trim().nullable().optional(),
  qrDataUrl: z.string().trim().nullable().optional(),
  phoneNumber: z.string().trim().nullable().optional(),
  lastConnectedAt: z.string().trim().nullable().optional()
});

function asExecutor(client) {
  return {
    query: (text, params) => client.query(text, params)
  };
}

function withPublicChatbotUrls(connection) {
  if (!connection) {
    return null;
  }

  return {
    ...connection,
    qrPageUrl: buildPublicChatbotUrl(`/chatbot/connections/${connection.session_name}/qr`),
    qrImageUrl: buildPublicChatbotUrl(`/chatbot/connections/${connection.session_name}/qr.png`),
    statusUrl: buildPublicChatbotUrl(
      `/chatbot/connections/${connection.session_name}/status`
    )
  };
}

function resolveAuthBarbershopId(req) {
  return req.auth?.membership?.barbershopId || null;
}

async function resolveContextOr404({ barbeariaId = null, sessionName = null }, res) {
  const context = barbeariaId
    ? await getChatbotContextByBarbershopId(barbeariaId)
    : await getChatbotContextBySessionName(sessionName);

  if (!context) {
    res.status(404).json({ error: "Conexao WhatsApp nao encontrada." });
    return null;
  }

  try {
    await assertFeatureAccess(context.barbearia_id, "chatbot");
  } catch (error) {
    res.status(403).json({
      error:
        error.message ||
        "A assinatura desta barbearia nao permite usar o chatbot."
    });
    return null;
  }

  return context;
}

async function ensureServiceExists(client, servico, barbeariaId) {
  const serviceResult = await client.query(
    `
      SELECT id, nome
      FROM servicos
      WHERE barbearia_id = $1
        AND nome = $2
        AND ativo = true
      LIMIT 1
    `,
    [barbeariaId, servico]
  );

  return serviceResult.rows[0] || null;
}

async function upsertCustomer(client, { barbeariaId, nome, telefone }) {
  const result = await client.query(
    `
      INSERT INTO clientes (
        barbearia_id,
        nome,
        telefone
      )
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

router.get("/barbershop/context", requireAuth, asyncHandler(async (req, res) => {
  const [settingsResult, connection, status] = await Promise.all([
    query(
      `
        SELECT *
        FROM chatbot_configuracoes
        WHERE barbearia_id = $1
        LIMIT 1
      `,
      [req.auth.membership.barbershopId]
    ),
    getPrimaryWhatsAppConnection(req.auth.membership.barbershopId),
    getTenantChatbotStatus(req.auth.membership.barbershopId).catch(() => null)
  ]);

  return res.json({
    user: req.auth.user,
    membership: req.auth.membership,
    barbershop: req.auth.barbershop,
    saasSubscription: req.auth.saasSubscription || null,
    chatbotSettings: settingsResult.rows[0] || null,
    whatsappConnection: connection
      ? {
          ...withPublicChatbotUrls(connection),
          runtimeStatus: status
        }
      : null
  });
}));

router.get("/chatbot/connection", requireAuth, asyncHandler(async (req, res) => {
  const connection = await getPrimaryWhatsAppConnection(req.auth.membership.barbershopId);

  if (!connection) {
    return res.status(404).json({ error: "Nenhuma conexao WhatsApp cadastrada para esta conta." });
  }

  const status = await getTenantChatbotStatus(req.auth.membership.barbershopId).catch(
    () => null
  );

  return res.json({
    ...withPublicChatbotUrls(connection),
    runtimeStatus: status
  });
}));

router.get("/chatbot/status", attachAuth, asyncHandler(async (req, res) => {
  const authenticatedBarbershopId = resolveAuthBarbershopId(req);

  if (!authenticatedBarbershopId) {
    const connections = await listChatbotPublicConnections();
    return res.json({ connections });
  }

  const [connection, status] = await Promise.all([
    getPrimaryWhatsAppConnection(authenticatedBarbershopId),
    getTenantChatbotStatus(authenticatedBarbershopId)
  ]);

  return res.json({
    barbeariaId: authenticatedBarbershopId,
    connection: connection ? withPublicChatbotUrls(connection) : null,
    status
  });
}));

router.get(
  "/chatbot/qr",
  requireAuth,
  requireAdmin,
  requireFeatureAccess("chatbot"),
  asyncHandler(async (req, res) => {
    const payload = await getTenantQrCode(req.auth.membership.barbershopId);
    return res.json(payload);
  })
);

router.post(
  "/chatbot/connect",
  requireAuth,
  requireAdmin,
  requireFeatureAccess("chatbot"),
  asyncHandler(async (req, res) => {
    const payload = await startTenantChatbotSession(req.auth.membership.barbershopId);
    return res.json(payload);
  })
);

router.post(
  "/chatbot/restart",
  requireAuth,
  requireAdmin,
  requireFeatureAccess("chatbot"),
  asyncHandler(async (req, res) => {
    const payload = await restartTenantChatbotSession(req.auth.membership.barbershopId);
    return res.json(payload);
  })
);

router.post(
  "/chatbot/disconnect",
  requireAuth,
  requireAdmin,
  requireFeatureAccess("chatbot"),
  asyncHandler(async (req, res) => {
    const payload = await disconnectTenantChatbotSession(req.auth.membership.barbershopId);
    return res.json(payload);
  })
);

router.get("/internal/chatbot/connections", requireChatbotInternal, asyncHandler(async (_req, res) => {
  const connections = await query(
    `
      SELECT *
      FROM conexoes_whatsapp
      WHERE ativo = true
      ORDER BY created_at ASC
    `
  );

  return res.json(connections.rows);
}));

router.get("/internal/chatbot/context", requireChatbotInternal, asyncHandler(async (req, res) => {
  const barbeariaId = String(req.query.barbeariaId || "").trim();
  const sessionName = String(req.query.sessionName || "").trim();

  if (!barbeariaId && !sessionName) {
    return res.status(400).json({
      error: "Parametro barbeariaId ou sessionName e obrigatorio."
    });
  }

  const context = await resolveContextOr404({ barbeariaId, sessionName }, res);
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
      phone: context.telefone,
      whatsappNumber: context.whatsapp_number,
      address: context.address,
      subscriptionPlan: context.plano,
      status: context.barbearia_status,
      timezone: context.timezone,
      primaryColor: context.cor_primaria,
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
      sessionPath: context.session_path,
      phoneNumber: context.phone_number,
      connectedPhone: context.telefone_conectado,
      provider: context.provider,
      status: context.connection_status,
      qrCode: context.qr_code,
      qrDataUrl: context.qr_data_url,
      lastConnectedAt: context.last_connected_at
    },
    services: servicesResult.rows
  });
}));

router.get("/internal/chatbot/days", requireChatbotInternal, asyncHandler(async (req, res) => {
  const barbeariaId = String(req.query.barbeariaId || "").trim();
  const sessionName = String(req.query.sessionName || "").trim();
  const dataInicial = req.query.dataInicial;

  if (!barbeariaId && !sessionName) {
    return res.status(400).json({
      error: "Parametro barbeariaId ou sessionName e obrigatorio."
    });
  }

  const context = await resolveContextOr404({ barbeariaId, sessionName }, res);
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
  const barbeariaId = String(req.query.barbeariaId || "").trim();
  const sessionName = String(req.query.sessionName || "").trim();
  const data = String(req.query.data || "").trim();

  if ((!barbeariaId && !sessionName) || !data) {
    return res.status(400).json({
      error: "Parametros barbeariaId/sessionName e data sao obrigatorios."
    });
  }

  const context = await resolveContextOr404({ barbeariaId, sessionName }, res);
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
  const barbeariaId = String(req.query.barbeariaId || "").trim();
  const sessionName = String(req.query.sessionName || "").trim();
  const phone = String(req.query.phone || "").replace(/\D/g, "");

  if ((!barbeariaId && !sessionName) || !phone) {
    return res.status(400).json({
      error: "Parametros barbeariaId/sessionName e phone sao obrigatorios."
    });
  }

  const context = await resolveContextOr404({ barbeariaId, sessionName }, res);
  if (!context) {
    return;
  }

  const result = await query(
    `
      SELECT *
      FROM agendamentos
      WHERE barbearia_id = $1
        AND REGEXP_REPLACE(COALESCE(cliente_telefone, telefone), '\D', '', 'g') = $2
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

  const context = await resolveContextOr404(
    {
      barbeariaId: parsed.data.barbeariaId || null,
      sessionName: parsed.data.sessionName || null
    },
    res
  );
  if (!context) {
    return;
  }

  await assertFeatureAccess(context.barbearia_id, "appointments");
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
    const service = await ensureServiceExists(client, parsed.data.servico, context.barbearia_id);

    if (!service) {
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
          cliente_nome,
          cliente_telefone,
          nome,
          telefone,
          data,
          hora,
          servico_id,
          servico_nome,
          servico,
          status,
          origem,
          observacoes
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $3,
          $4,
          $5::date,
          $6,
          $7,
          $8,
          $8,
          'confirmado',
          'chatbot',
          $9
        )
        RETURNING *
      `,
      [
        context.barbearia_id,
        customer.id,
        parsed.data.nome,
        parsed.data.telefone,
        parsed.data.data,
        parsed.data.hora,
        service.id,
        service.nome,
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
  const barbeariaId = String(req.query.barbeariaId || "").trim();
  const sessionName = String(req.query.sessionName || "").trim();
  const appointmentId = Number(req.params.id);

  if ((!barbeariaId && !sessionName) || !Number.isInteger(appointmentId)) {
    return res.status(400).json({
      error: "barbeariaId/sessionName e id validos sao obrigatorios."
    });
  }

  const context = await resolveContextOr404({ barbeariaId, sessionName }, res);
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
