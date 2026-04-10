const http = require("http");
const path = require("path");
const { URL } = require("url");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const getApiUrl = () => process.env.API_URL || "http://localhost:4000";
const getInternalSecret = () =>
  process.env.CHATBOT_INTERNAL_SECRET || "barbergo-chatbot-secret";
const PORT = Number(process.env.PORT) || 3000;
const PAUSE_MS = 5 * 60 * 1000;
const CONTEXT_CACHE_MS = 30 * 1000;
const authPath = path.join(__dirname, ".wwebjs_auth");
const serviceFallback = ["Corte", "Barba", "Corte + Barba", "Pintura", "Sobrancelha"];

const runtimes = new Map();

const headersNoCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store"
};

function normalizeText(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function phoneFromChat(chatId = "") {
  return String(chatId).replace(/\D/g, "");
}

function formatDateBr(date = "") {
  const [year, month, day] = String(date).slice(0, 10).split("-");
  if (!year || !month || !day) {
    return date;
  }
  return `${day}/${month}/${year}`;
}

function getRuntime(sessionName) {
  if (runtimes.has(sessionName)) {
    return runtimes.get(sessionName);
  }

  const runtime = {
    sessionName,
    client: new Client({
      authStrategy: new LocalAuth({
        dataPath: authPath,
        clientId: sessionName
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--single-process"
        ]
      }
    }),
    initialized: false,
    initializationPromise: null,
    connected: false,
    lastQr: null,
    qrDataUrl: null,
    qrPngBuffer: null,
    qrUpdatedAt: null,
    antiSpam: new Map(),
    pauses: new Map(),
    conversations: new Map(),
    context: null,
    contextLoadedAt: 0
  };

  attachClientEvents(runtime);
  runtimes.set(sessionName, runtime);
  return runtime;
}

function getStatusPayload(runtime) {
  return {
    sessionName: runtime.sessionName,
    status: runtime.lastQr
      ? "qr_disponivel"
      : runtime.connected
        ? "conectado"
        : "aguardando_qr",
    qrPagePath: `/chatbot/connections/${runtime.sessionName}/qr`,
    qrImagePath: `/chatbot/connections/${runtime.sessionName}/qr.png`,
    statusPath: `/chatbot/connections/${runtime.sessionName}/status`,
    updatedAt: runtime.qrUpdatedAt
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderQrPage(runtime) {
  const title = runtime.context?.barbershop?.name || runtime.sessionName;
  const updatedAt = runtime.qrUpdatedAt || new Date().toISOString();

  if (runtime.qrDataUrl) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="15" />
    <title>QR Code WhatsApp</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f8f1e7 0%, #f4efe6 100%);
        font-family: Arial, sans-serif;
        color: #1f2937;
        padding: 24px;
      }
      main {
        width: min(100%, 560px);
        background: #fffdf8;
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 18px 40px rgba(31, 41, 55, 0.12);
        text-align: center;
      }
      img {
        width: min(100%, 420px);
        height: auto;
        background: #fff;
        border-radius: 18px;
        padding: 16px;
      }
      .status {
        display: inline-block;
        margin-top: 16px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(29, 155, 95, 0.12);
        color: #1d9b5f;
        font-size: 14px;
        font-weight: bold;
      }
      p {
        color: #6b7280;
        line-height: 1.5;
      }
      code {
        display: block;
        margin-top: 16px;
        color: #6b7280;
        font-size: 12px;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>Escaneie o QR Code desta sessao para conectar o WhatsApp.</p>
      <img src="${runtime.qrDataUrl}" alt="QR Code do WhatsApp" />
      <div class="status">Atualizado em: ${escapeHtml(updatedAt)}</div>
      <code>${escapeHtml(getStatusPayload(runtime).qrImagePath)}</code>
    </main>
  </body>
</html>`;
  }

  if (runtime.connected) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="20" />
    <title>WhatsApp conectado</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #effaf3 0%, #e5f7eb 100%);
        font-family: Arial, sans-serif;
        padding: 24px;
        color: #14532d;
      }
      main {
        width: min(100%, 520px);
        background: #fcfffd;
        border-radius: 24px;
        padding: 28px;
        text-align: center;
        box-shadow: 0 18px 40px rgba(20, 83, 45, 0.12);
      }
      p {
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>Esta sessao de WhatsApp ja esta conectada.</p>
      <p>Ultima atualizacao: ${escapeHtml(updatedAt)}</p>
    </main>
  </body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="10" />
    <title>Aguardando QR</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4efe6;
        font-family: Arial, sans-serif;
        padding: 24px;
        color: #1f2937;
      }
      main {
        width: min(100%, 520px);
        background: #fffdf8;
        border-radius: 24px;
        padding: 28px;
        text-align: center;
        box-shadow: 0 18px 40px rgba(31, 41, 55, 0.12);
      }
      p {
        line-height: 1.5;
        color: #6b7280;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>Aguardando um novo QR Code para esta conexao.</p>
    </main>
  </body>
</html>`;
}

async function updateQrAssets(runtime, qr) {
  runtime.lastQr = qr;
  runtime.qrUpdatedAt = new Date().toISOString();

  try {
    const options = {
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 12,
      width: 420,
      type: "image/png"
    };

    runtime.qrDataUrl = await QRCode.toDataURL(qr, options);
    runtime.qrPngBuffer = await QRCode.toBuffer(qr, options);
  } catch (error) {
    runtime.qrDataUrl = null;
    runtime.qrPngBuffer = null;
    console.log("Falha ao gerar QR para", runtime.sessionName, error.message);
  }
}

async function apiRequest(pathname, method = "GET", body, extraHeaders = {}) {
  const response = await fetch(`${getApiUrl()}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Erro na API (${response.status})`);
  }

  return response.json();
}

async function internalApi(pathname, method = "GET", body) {
  return apiRequest(pathname, method, body, {
    "x-chatbot-secret": getInternalSecret()
  });
}

async function syncConnectionStatus(sessionName, payload) {
  try {
    await internalApi("/internal/chatbot/connections/sync", "POST", {
      sessionName,
      ...payload
    });
  } catch (error) {
    console.log("Falha ao sincronizar status da conexao:", sessionName, error.message);
  }
}

async function loadConnectionContext(sessionName, force = false) {
  const runtime = getRuntime(sessionName);

  if (!force && runtime.context && Date.now() - runtime.contextLoadedAt < CONTEXT_CACHE_MS) {
    return runtime.context;
  }

  const context = await internalApi(
    `/internal/chatbot/context?sessionName=${encodeURIComponent(sessionName)}`
  );

  runtime.context = context;
  runtime.contextLoadedAt = Date.now();
  return context;
}

function getConversation(runtime, chatId) {
  if (!runtime.conversations.has(chatId)) {
    runtime.conversations.set(chatId, {
      step: "menu",
      name: null,
      phone: null,
      date: null,
      hour: null,
      service: null,
      dueDay: null,
      services: null,
      days: null,
      hours: null,
      cancellableAppointments: null
    });
  }

  return runtime.conversations.get(chatId);
}

function resetConversation(runtime, chatId) {
  runtime.conversations.set(chatId, {
    step: "menu",
    name: null,
    phone: null,
    date: null,
    hour: null,
    service: null,
    dueDay: null,
    services: null,
    days: null,
    hours: null,
    cancellableAppointments: null
  });
}

function mapService(input, services) {
  const list = services?.length ? services : serviceFallback;
  const normalized = normalizeText(input);
  const index = Number(normalized);

  if (Number.isInteger(index) && list[index - 1]) {
    return list[index - 1];
  }

  return list.find((item) => normalizeText(item) === normalized) || input;
}

function buildMenu(context) {
  const fallback = `Ola! Seja bem-vindo(a) a ${context?.barbershop?.name || "sua barbearia"}.`;
  const greeting = context?.settings?.welcomeMessage || fallback;
  return `${greeting}\n\n1 - Agendar horario\n2 - Cancelar agendamento\n3 - Me tornar assinante\n4 - Falar com atendente`;
}

async function sendText(runtime, chatId, text) {
  const chat = await runtime.client.getChatById(chatId).catch(() => null);
  if (chat) {
    await chat.sendStateTyping();
    await delay(800);
  }
  await runtime.client.sendMessage(chatId, text);
}

async function listAppointmentsForPhone(sessionName, phone) {
  return internalApi(
    `/internal/chatbot/appointments?sessionName=${encodeURIComponent(sessionName)}&phone=${encodeURIComponent(phone)}`
  );
}

async function listDays(sessionName) {
  return internalApi(
    `/internal/chatbot/days?sessionName=${encodeURIComponent(sessionName)}`
  );
}

async function listHours(sessionName, date) {
  return internalApi(
    `/internal/chatbot/hours?sessionName=${encodeURIComponent(sessionName)}&data=${encodeURIComponent(date)}`
  );
}

async function createAppointment(sessionName, payload) {
  return internalApi("/internal/chatbot/appointments", "POST", {
    sessionName,
    ...payload
  });
}

async function cancelAppointment(sessionName, appointmentId) {
  return internalApi(
    `/internal/chatbot/appointments/${appointmentId}?sessionName=${encodeURIComponent(sessionName)}`,
    "DELETE"
  );
}

async function handleIncomingMessage(runtime, msg) {
  if (!msg.from || msg.from === "status@broadcast" || msg.from.endsWith("@g.us")) {
    return;
  }

  if (msg.fromMe || !msg.body) {
    return;
  }

  const now = Date.now();
  const lastSeen = runtime.antiSpam.get(msg.from) || 0;

  if (now - lastSeen < 2500) {
    return;
  }

  runtime.antiSpam.set(msg.from, now);

  const chat = await msg.getChat();
  if (chat.isGroup) {
    return;
  }

  const context = await loadConnectionContext(runtime.sessionName);
  const settings = context.settings || {};
  const conversation = getConversation(runtime, msg.from);
  const originalText = msg.body.trim();
  const normalizedText = normalizeText(originalText);
  const pauseUntil = runtime.pauses.get(msg.from);

  if (pauseUntil && pauseUntil > now) {
    return;
  }

  if (pauseUntil && pauseUntil <= now) {
    runtime.pauses.delete(msg.from);
  }

  async function sendMenu() {
    resetConversation(runtime, msg.from);
    await sendText(runtime, msg.from, buildMenu(context));
  }

  if (["menu", "oi", "ola", "agendar", "agenda", "cancelar"].includes(normalizedText)) {
    await sendMenu();
    return;
  }

  if (conversation.step === "menu") {
    if (normalizedText === "1") {
      const days = await listDays(runtime.sessionName);

      if (!days.length) {
        await sendText(
          runtime,
          msg.from,
          settings.offHoursMessage ||
            "No momento nao ha horarios livres disponiveis para esta barbearia."
        );
        return;
      }

      conversation.step = "schedule_day";
      conversation.days = days;
      await sendText(
        runtime,
        msg.from,
        `Selecione um dia disponivel:\n\n${days
          .map(
            (day, index) =>
              `${index + 1} - ${formatDateBr(day.data)} (${day.disponiveis} horarios livres)`
          )
          .join("\n")}`
      );
      return;
    }

    if (normalizedText === "2") {
      if (!settings.allowCancellation) {
        await sendText(
          runtime,
          msg.from,
          settings.cancellationMessage ||
            "Cancelamentos nao estao disponiveis automaticamente nesta conta."
        );
        return;
      }

      const phone = phoneFromChat(msg.from);
      const appointments = await listAppointmentsForPhone(runtime.sessionName, phone);

      if (!appointments.length) {
        await sendText(
          runtime,
          msg.from,
          "Nao localizei agendamentos ativos para este numero. Envie menu para voltar ao inicio."
        );
        return;
      }

      conversation.step = "cancel_pick";
      conversation.cancellableAppointments = appointments;
      await sendText(
        runtime,
        msg.from,
        `Selecione o numero do agendamento que deseja cancelar:\n\n${appointments
          .map(
            (appointment, index) =>
              `${index + 1} - ${formatDateBr(appointment.data)} as ${appointment.hora} - ${appointment.servico}`
          )
          .join("\n")}`
      );
      return;
    }

    if (normalizedText === "3") {
      conversation.step = "subscription_due_day";
      await sendText(
        runtime,
        msg.from,
        "Plano de assinatura mensal.\n\n1 corte por semana via agendamentos.\nValor mensal de R$ 159,99.\n\nSe quiser seguir, responda com um numero de 1 a 28 informando o dia do vencimento desejado."
      );
      return;
    }

    if (normalizedText === "4") {
      runtime.pauses.set(msg.from, now + PAUSE_MS);
      resetConversation(runtime, msg.from);
      await sendText(
        runtime,
        msg.from,
        "Perfeito. O atendimento automatico sera pausado por 5 minutos para que um atendente continue esta conversa."
      );
      return;
    }

    await sendMenu();
    return;
  }

  if (conversation.step === "schedule_day") {
    const index = Number(normalizedText);
    const day = conversation.days?.[index - 1];

    if (!Number.isInteger(index) || !day) {
      await sendText(runtime, msg.from, "Opcao invalida. Escolha um dos dias da lista.");
      return;
    }

    const hours = await listHours(runtime.sessionName, day.data);

    if (!hours.length) {
      conversation.step = "menu";
      await sendText(
        runtime,
        msg.from,
        "Este dia acabou de ficar indisponivel. Envie menu para escolher outra data."
      );
      return;
    }

    conversation.step = "schedule_hour";
    conversation.date = day.data;
    conversation.hours = hours;
    await sendText(
      runtime,
      msg.from,
      `Horarios disponiveis para ${formatDateBr(day.data)}:\n\n${hours
        .map((hour, indexHour) => `${indexHour + 1} - ${hour}`)
        .join("\n")}`
    );
    return;
  }

  if (conversation.step === "schedule_hour") {
    const index = Number(normalizedText);
    const hour = conversation.hours?.[index - 1];

    if (!Number.isInteger(index) || !hour) {
      await sendText(runtime, msg.from, "Opcao invalida. Escolha um dos horarios da lista.");
      return;
    }

    conversation.step = "schedule_name";
    conversation.hour = hour;
    await sendText(runtime, msg.from, "Por favor, informe seu nome completo.");
    return;
  }

  if (conversation.step === "schedule_name") {
    conversation.step = "schedule_service";
    conversation.name = originalText;
    conversation.phone = phoneFromChat(msg.from);
    conversation.services =
      context.services?.map((service) => service.nome).filter(Boolean) || serviceFallback;
    await sendText(
      runtime,
      msg.from,
      `Informe o servico desejado:\n\n${conversation.services
        .map((service, index) => `${index + 1} - ${service}`)
        .join("\n")}`
    );
    return;
  }

  if (conversation.step === "schedule_service") {
    const service = mapService(originalText, conversation.services);
    const appointment = await createAppointment(runtime.sessionName, {
      nome: conversation.name,
      telefone: conversation.phone,
      data: conversation.date,
      hora: conversation.hour,
      servico: service
    });

    resetConversation(runtime, msg.from);
    await sendText(
      runtime,
      msg.from,
      `Agendamento confirmado para ${formatDateBr(appointment.data)} as ${appointment.hora}. Obrigado!`
    );
    await sendText(runtime, msg.from, buildMenu(context));
    return;
  }

  if (conversation.step === "subscription_due_day") {
    const dueDay = Number(normalizedText);

    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      await sendText(
        runtime,
        msg.from,
        "Opcao invalida. Envie um numero de 1 a 28 para definir o vencimento."
      );
      return;
    }

    runtime.pauses.set(msg.from, now + PAUSE_MS);
    resetConversation(runtime, msg.from);
    await sendText(
      runtime,
      msg.from,
      `Perfeito. Registrei seu interesse na assinatura mensal com vencimento no dia ${dueDay}. Um atendente pode continuar por aqui nos proximos minutos.`
    );
    return;
  }

  if (conversation.step === "cancel_pick") {
    const index = Number(normalizedText);
    const appointment = conversation.cancellableAppointments?.[index - 1];

    if (!Number.isInteger(index) || !appointment) {
      await sendText(
        runtime,
        msg.from,
        "Opcao invalida. Escolha um dos agendamentos listados para cancelar."
      );
      return;
    }

    await cancelAppointment(runtime.sessionName, appointment.id);
    resetConversation(runtime, msg.from);
    await sendText(
      runtime,
      msg.from,
      settings.cancellationMessage ||
        `Agendamento cancelado: ${formatDateBr(appointment.data)} as ${appointment.hora}.`
    );
    await sendText(runtime, msg.from, buildMenu(context));
  }
}

async function handleWebhookPayload(payload) {
  const sessionName = payload?.sessionName;
  const phone = payload?.data?.telefone;

  if (!sessionName || !phone) {
    return { ok: true, skipped: true };
  }

  const runtime = getRuntime(sessionName);
  await ensureRuntimeConnection(sessionName);

  const chatId = `${String(phone).replace(/\D/g, "")}@c.us`;
  const text =
    payload?.data?.texto ||
    (payload?.data?.lembrete
      ? `Lembrete: seu horario esta agendado para hoje, as ${payload.data.hora}.`
      : `Seu agendamento foi confirmado para ${payload.data.data} as ${payload.data.hora}.`);

  await runtime.client.sendMessage(chatId, text);
  return { ok: true };
}

function attachClientEvents(runtime) {
  runtime.client.on("qr", async (qr) => {
    console.log(`Escaneie o QR Code da sessao ${runtime.sessionName}:`);
    qrcode.generate(qr, { small: false });
    await updateQrAssets(runtime, qr);
    await syncConnectionStatus(runtime.sessionName, {
      status: "qr_disponivel",
      qrCode: qr,
      lastConnectedAt: runtime.qrUpdatedAt
    });
  });

  runtime.client.on("ready", async () => {
    runtime.connected = true;
    runtime.lastQr = null;
    runtime.qrDataUrl = null;
    runtime.qrPngBuffer = null;
    runtime.qrUpdatedAt = new Date().toISOString();

    const phoneNumber = runtime.client.info?.wid?.user || null;
    await syncConnectionStatus(runtime.sessionName, {
      status: "connected",
      qrCode: null,
      phoneNumber,
      lastConnectedAt: runtime.qrUpdatedAt
    });

    console.log(`Sessao ${runtime.sessionName} conectada com sucesso.`);
  });

  runtime.client.on("disconnected", async (reason) => {
    runtime.connected = false;
    runtime.lastQr = null;
    runtime.qrDataUrl = null;
    runtime.qrPngBuffer = null;
    runtime.qrUpdatedAt = new Date().toISOString();
    await syncConnectionStatus(runtime.sessionName, {
      status: "disconnected",
      qrCode: null
    });
    console.log(`Sessao ${runtime.sessionName} desconectada:`, reason);
  });

  runtime.client.on("message", async (msg) => {
    try {
      await handleIncomingMessage(runtime, msg);
    } catch (error) {
      console.log(`Erro na sessao ${runtime.sessionName}:`, error.message);
    }
  });
}

async function ensureRuntimeConnection(sessionName) {
  const runtime = getRuntime(sessionName);

  if (runtime.initialized) {
    return runtime.initializationPromise;
  }

  runtime.initialized = true;
  runtime.initializationPromise = runtime.client.initialize().catch((error) => {
    runtime.initialized = false;
    runtime.initializationPromise = null;
    throw error;
  });

  return runtime.initializationPromise;
}

async function initializeChatbot() {
  const connections = await internalApi("/internal/chatbot/connections").catch(() => []);

  await Promise.all(
    connections.map((connection) =>
      ensureRuntimeConnection(connection.session_name).catch((error) => {
        console.log("Falha ao iniciar sessao", connection.session_name, error.message);
      })
    )
  );
}

async function ensureFirstAvailableRuntime() {
  if (runtimes.size > 0) {
    return [...runtimes.values()][0];
  }

  const connections = await internalApi("/internal/chatbot/connections").catch(() => []);
  const first = connections[0];

  if (!first) {
    return null;
  }

  await ensureRuntimeConnection(first.session_name).catch(() => null);
  return getRuntime(first.session_name);
}

async function respondJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headersNoCache).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

function attachExpressRoute(app, handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.log("Erro no chatbot:", error.message);
      res.status(500).json({ error: "Falha interna do chatbot" });
    });
  };
}

function registerChatbotRoutes(app) {
  app.get(
    "/chatbot/status",
    attachExpressRoute(app, async (_req, res) => {
      const connections = await internalApi("/internal/chatbot/connections").catch(() => []);
      await Promise.all(
        connections.map((connection) =>
          ensureRuntimeConnection(connection.session_name).catch(() => null)
        )
      );
      res.set(headersNoCache);
      res.json({
        connections: [...runtimes.values()].map(getStatusPayload)
      });
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/status",
    attachExpressRoute(app, async (req, res) => {
      const runtime = getRuntime(req.params.sessionName);
      await loadConnectionContext(req.params.sessionName).catch(() => null);
      await ensureRuntimeConnection(req.params.sessionName).catch(() => null);
      res.set(headersNoCache);
      res.json(getStatusPayload(runtime));
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/qr.png",
    attachExpressRoute(app, async (req, res) => {
      const runtime = getRuntime(req.params.sessionName);
      await ensureRuntimeConnection(req.params.sessionName).catch(() => null);

      if (!runtime.qrPngBuffer) {
        res.set(headersNoCache);
        return res.status(404).json(getStatusPayload(runtime));
      }

      res.set(headersNoCache);
      res.set("Content-Type", "image/png");
      return res.send(runtime.qrPngBuffer);
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/qr",
    attachExpressRoute(app, async (req, res) => {
      const runtime = getRuntime(req.params.sessionName);
      await loadConnectionContext(req.params.sessionName).catch(() => null);
      await ensureRuntimeConnection(req.params.sessionName).catch(() => null);
      res.set(headersNoCache);
      res.type("html");
      res.send(renderQrPage(runtime));
    })
  );

  app.post(
    "/webhook",
    attachExpressRoute(app, async (req, res) => {
      const payload = req.body || {};
      const response = await handleWebhookPayload(payload);
      res.json(response);
    })
  );

  app.get(
    "/qr",
    attachExpressRoute(app, async (_req, res) => {
      const runtime = await ensureFirstAvailableRuntime();

      if (!runtime) {
        res.set(headersNoCache);
        res.type("html");
        res.send(renderQrPage(getRuntime("default")));
        return;
      }

      await loadConnectionContext(runtime.sessionName).catch(() => null);
      res.set(headersNoCache);
      res.type("html");
      res.send(renderQrPage(runtime));
    })
  );

  app.get(
    "/qr.png",
    attachExpressRoute(app, async (_req, res) => {
      const runtime = await ensureFirstAvailableRuntime();

      if (!runtime || !runtime.qrPngBuffer) {
        res.set(headersNoCache);
        return res.status(404).json({ status: "aguardando_qr" });
      }

      res.set(headersNoCache);
      res.set("Content-Type", "image/png");
      return res.send(runtime.qrPngBuffer);
    })
  );
}

async function handleStandaloneRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/chatbot/status") {
    const connections = await internalApi("/internal/chatbot/connections").catch(() => []);
    await Promise.all(
      connections.map((connection) =>
        ensureRuntimeConnection(connection.session_name).catch(() => null)
      )
    );
    return respondJson(res, 200, {
      connections: [...runtimes.values()].map(getStatusPayload)
    });
  }

  const dynamicMatch = pathname.match(
    /^\/chatbot\/connections\/([^/]+)\/(status|qr|qr\.png)$/
  );

  if (dynamicMatch) {
    const sessionName = decodeURIComponent(dynamicMatch[1]);
    const resource = dynamicMatch[2];
    const runtime = getRuntime(sessionName);
    await loadConnectionContext(sessionName).catch(() => null);
    await ensureRuntimeConnection(sessionName).catch(() => null);

    if (resource === "status") {
      return respondJson(res, 200, getStatusPayload(runtime));
    }

    if (resource === "qr.png") {
      if (!runtime.qrPngBuffer) {
        return respondJson(res, 404, getStatusPayload(runtime));
      }

      res.writeHead(200, {
        ...headersNoCache,
        "Content-Type": "image/png",
        "Content-Length": runtime.qrPngBuffer.length
      });
      res.end(runtime.qrPngBuffer);
      return;
    }

    res.writeHead(200, {
      ...headersNoCache,
      "Content-Type": "text/html; charset=utf-8"
    });
    res.end(renderQrPage(runtime));
    return;
  }

  if (pathname === "/qr" || pathname === "/qr.png") {
    const runtime = await ensureFirstAvailableRuntime();

    if (!runtime) {
      return respondJson(res, 404, { status: "aguardando_qr" });
    }

    if (pathname === "/qr.png") {
      if (!runtime.qrPngBuffer) {
        return respondJson(res, 404, getStatusPayload(runtime));
      }

      res.writeHead(200, {
        ...headersNoCache,
        "Content-Type": "image/png",
        "Content-Length": runtime.qrPngBuffer.length
      });
      res.end(runtime.qrPngBuffer);
      return;
    }

    res.writeHead(200, {
      ...headersNoCache,
      "Content-Type": "text/html; charset=utf-8"
    });
    res.end(renderQrPage(runtime));
    return;
  }

  if (pathname === "/webhook" && req.method === "POST") {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const response = await handleWebhookPayload(payload);
    return respondJson(res, 200, response);
  }

  return respondJson(res, 200, {
    connections: [...runtimes.values()].map(getStatusPayload)
  });
}

module.exports = {
  initializeChatbot,
  registerChatbotRoutes
};

if (require.main === module) {
  const server = http.createServer((req, res) => {
    handleStandaloneRequest(req, res).catch((error) => {
      console.log("Erro no servidor standalone do chatbot:", error.message);
      respondJson(res, 500, { error: "Falha interna do chatbot" });
    });
  });

  server.listen(PORT, () => {
    console.log(`Painel do chatbot ativo na porta ${PORT}.`);
  });

  initializeChatbot().catch((error) => {
    console.log("Falha ao iniciar chatbot:", error.message);
  });
}
