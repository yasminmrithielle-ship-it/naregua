import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import horariosRoutes from "./routes/horarios.js";
import agendamentosRoutes from "./routes/agendamentos.js";
import adminRoutes from "./routes/admin.js";
import chatbotRoutes from "./routes/chatbot.js";
import relatoriosRoutes from "./routes/relatorios.js";
import { startReminders } from "./services/reminders.js";
import { startSlotExpiryMonitor } from "./services/slotExpiry.js";
import { errorHandler } from "./middleware/errorHandler.js";
import servicosRoutes from "./routes/servicos.js";
import assinaturasRoutes from "./routes/assinaturas.js";
import {
  checkDatabaseConnection,
  getDatabaseStatus,
  initializeDatabase
} from "./db.js";
import {
  getChatbotEnabled,
  getRuntimeSummary,
  validateRuntimeConfig
} from "./config.js";
import { ensureSeedData } from "./services/authService.js";
import { ensureChatbotScaffoldForActiveBarbershops } from "./services/barbershopService.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const chatbotEnabled = getChatbotEnabled();
const DATABASE_REQUIRED_PATH_PREFIXES = [
  "/auth",
  "/barbershop",
  "/internal",
  "/horarios",
  "/agendar",
  "/agendamento",
  "/agendamentos",
  "/relatorios",
  "/servicos",
  "/assinaturas",
  "/webhook"
];
const startupState = {
  degraded: false,
  errors: [],
  warnings: []
};

app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  const status = getDatabaseStatus();

  try {
    await checkDatabaseConnection();
  } catch (error) {
    return res.status(503).json({
      ok: false,
      startup: startupState,
      database: getDatabaseStatus()
    });
  }

  return res.json({
    ok: !startupState.degraded,
    startup: startupState,
    database: {
      ...status,
      ready: true,
      error: null,
      errorCode: null,
      recommendation: null
    }
  });
});

app.use((req, res, next) => {
  const needsDatabase = DATABASE_REQUIRED_PATH_PREFIXES.some((prefix) =>
    req.path === prefix || req.path.startsWith(`${prefix}/`)
  );

  if (!needsDatabase || getDatabaseStatus().ready) {
    return next();
  }

  return res.status(503).json({
    error: "Banco de dados indisponivel no momento.",
    startup: startupState,
    database: getDatabaseStatus()
  });
});

app.use(adminRoutes);
app.use(chatbotRoutes);
app.use(horariosRoutes);
app.use(agendamentosRoutes);
app.use(relatoriosRoutes);
app.use(servicosRoutes);
app.use(assinaturasRoutes);

function registerDisabledChatbotRoutes(application) {
  const payload = {
    status: "disabled",
    qrPagePath: "/qr",
    qrImagePath: "/qr.png",
    updatedAt: null,
    message: "Chatbot desativado neste ambiente."
  };

  application.get("/chatbot/status", (req, res) => {
    res.json(payload);
  });

  application.get("/chatbot/connections/:sessionName/status", (req, res) => {
    res.json({
      ...payload,
      sessionName: req.params.sessionName
    });
  });

  application.get("/chatbot/connections/:sessionName/qr.png", (req, res) => {
    res.status(404).json({
      ...payload,
      sessionName: req.params.sessionName
    });
  });

  application.get("/chatbot/connections/:sessionName/qr", (req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chatbot indisponivel</title>
  </head>
  <body style="font-family: Arial, sans-serif; background: #f6f3ee; color: #1f2937; display: grid; place-items: center; min-height: 100vh; margin: 0;">
    <main style="width: min(100%, 520px); background: #fffdf8; border-radius: 20px; padding: 28px; box-shadow: 0 18px 40px rgba(31, 41, 55, 0.12); text-align: center;">
      <h1>Chatbot indisponivel</h1>
      <p>O modulo do WhatsApp esta desativado neste ambiente.</p>
      <p>Sessao solicitada: <strong>${req.params.sessionName}</strong></p>
    </main>
  </body>
</html>`);
  });

  application.get("/qr.png", (req, res) => {
    res.status(404).json(payload);
  });

  application.get("/qr", (req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chatbot indisponivel</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f6f3ee;
        color: #1f2937;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(100%, 520px);
        background: #fffdf8;
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 18px 40px rgba(31, 41, 55, 0.12);
        text-align: center;
      }
      p {
        line-height: 1.6;
        color: #4b5563;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Chatbot indisponivel</h1>
      <p>O modulo do WhatsApp esta desativado neste ambiente de deploy.</p>
      <p>Se desejar usa-lo, habilite <strong>CHATBOT_ENABLED=true</strong> em um ambiente compativel.</p>
    </main>
  </body>
</html>`);
  });
}

function registerFrontendRoutes(application) {
  application.use(express.static(frontendDistPath));

  application.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/auth") ||
      req.path.startsWith("/barbershop") ||
      req.path.startsWith("/internal") ||
      req.path.startsWith("/horarios") ||
      req.path.startsWith("/agendar") ||
      req.path.startsWith("/agendamento") ||
      req.path.startsWith("/agendamentos") ||
      req.path.startsWith("/relatorios") ||
      req.path.startsWith("/servicos") ||
      req.path.startsWith("/assinaturas") ||
      req.path.startsWith("/chatbot") ||
      req.path.startsWith("/webhook") ||
      req.path === "/health" ||
      req.path === "/qr" ||
      req.path === "/qr.png"
    ) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

async function bootstrap() {
  const validation = validateRuntimeConfig();
  const runtimeSummary = getRuntimeSummary();
  let databaseInitialized = false;
  let startIntegratedChatbot = null;

  startupState.warnings = [...validation.warnings];
  startupState.errors = [...validation.errors];

  validation.warnings.forEach((warning) => {
    console.warn("Aviso de configuracao:", warning);
  });

  if (!validation.valid) {
    startupState.degraded = true;
    validation.errors.forEach((error) => {
      console.error("Erro de configuracao:", error);
    });
  }

  console.log("Resumo de inicializacao:", runtimeSummary);

  if (validation.valid) {
    try {
      await initializeDatabase();
      await ensureSeedData();
      await ensureChatbotScaffoldForActiveBarbershops();
      startReminders();
      startSlotExpiryMonitor();
      databaseInitialized = true;
    } catch (error) {
      startupState.degraded = true;
      startupState.errors = [
        ...startupState.errors,
        error.message || "Falha desconhecida ao inicializar o banco."
      ];
      console.error("Inicializacao em modo degradado:", error);
    }
  }

  if (chatbotEnabled && databaseInitialized) {
    try {
      const chatbotModule = await import("../../chatbot/robo.js");
      const { initializeChatbot, registerChatbotRoutes } = chatbotModule.default;
      registerChatbotRoutes(app);
      startIntegratedChatbot = initializeChatbot;
    } catch (error) {
      console.error("Falha ao carregar chatbot integrado:", error);
      registerDisabledChatbotRoutes(app);
    }
  } else {
    registerDisabledChatbotRoutes(app);
  }

  registerFrontendRoutes(app);
  app.use(errorHandler);

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`API rodando na porta ${port}`);
    console.log(`Chatbot integrado ${chatbotEnabled ? "habilitado" : "desabilitado"}.`);

    if (startIntegratedChatbot) {
      startIntegratedChatbot().catch((error) => {
        console.error("Falha ao iniciar chatbot integrado:", error);
      });
    }

    if (databaseInitialized) {
      console.log("Banco conectado, schema validado e tenant inicial pronto.");
    } else {
      console.warn(
        "Servidor iniciado em modo degradado. Consulte /health para detalhes do banco."
      );
    }
  });
}

bootstrap().catch((error) => {
  console.error("Falha inesperada durante bootstrap:", error);
  startupState.degraded = true;
  startupState.errors = [
    ...startupState.errors,
    error.message || "Falha inesperada durante bootstrap."
  ];
});
