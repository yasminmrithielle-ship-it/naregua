const http = require("http");
const path = require("path");
const { URL } = require("url");
const sessionManager = require("./sessionManager");

if (require.main === module && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.join(__dirname, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.log("Falha ao carregar chatbot/.env:", error.message);
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const INTERNAL_SECRET =
  process.env.CHATBOT_INTERNAL_SECRET || "barbergo-chatbot-secret";

const headersNoCache = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store"
};

function isInternalAuthorized(req) {
  const providedSecret =
    req.headers["x-chatbot-secret"] ||
    req.headers["x-internal-chatbot-secret"] ||
    "";

  return Boolean(providedSecret) && providedSecret === INTERNAL_SECRET;
}

function requireInternalRequest(req, res) {
  if (isInternalAuthorized(req)) {
    return true;
  }

  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Internal chatbot secret invalido." }));
  return false;
}

function requireInternalExpress(req, res, next) {
  if (isInternalAuthorized(req)) {
    return next();
  }

  return res.status(401).json({ error: "Internal chatbot secret invalido." });
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

function attachExpressRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.log("Erro no chatbot:", error.message);
      res.status(500).json({ error: "Falha interna do chatbot" });
    });
  };
}

async function ensureFirstAvailableRuntime() {
  const sessions = await sessionManager.listSessions().catch(() => []);
  const first = sessions[0];

  if (!first?.barbeariaId) {
    return null;
  }

  await sessionManager.startSession(first.barbeariaId).catch(() => null);
  return sessionManager.getRuntime(first.barbeariaId);
}

function registerManagementRoutes(app) {
  app.get(
    "/internal/chatbot/sessions/status",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.query.barbeariaId || "").trim();

      if (!barbeariaId) {
        return res.status(400).json({ error: "Parametro barbeariaId e obrigatorio." });
      }

      const payload = await sessionManager.getSessionStatus(barbeariaId);
      return res.json(payload);
    })
  );

  app.get(
    "/internal/chatbot/sessions/qr",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.query.barbeariaId || "").trim();

      if (!barbeariaId) {
        return res.status(400).json({ error: "Parametro barbeariaId e obrigatorio." });
      }

      const payload = await sessionManager.getQrCode(barbeariaId);
      return res.json(payload);
    })
  );

  app.post(
    "/internal/chatbot/sessions/start",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.body?.barbeariaId || "").trim();

      if (!barbeariaId) {
        return res.status(400).json({ error: "barbeariaId obrigatorio." });
      }

      const payload = await sessionManager.startSession(barbeariaId);
      return res.json(payload);
    })
  );

  app.post(
    "/internal/chatbot/sessions/restart",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.body?.barbeariaId || "").trim();

      if (!barbeariaId) {
        return res.status(400).json({ error: "barbeariaId obrigatorio." });
      }

      const payload = await sessionManager.restartSession(barbeariaId);
      return res.json(payload);
    })
  );

  app.post(
    "/internal/chatbot/sessions/disconnect",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.body?.barbeariaId || "").trim();

      if (!barbeariaId) {
        return res.status(400).json({ error: "barbeariaId obrigatorio." });
      }

      const payload = await sessionManager.disconnectSession(barbeariaId);
      return res.json(payload);
    })
  );

  app.post(
    "/internal/chatbot/messages/send",
    requireInternalExpress,
    attachExpressRoute(async (req, res) => {
      const barbeariaId = String(req.body?.barbeariaId || "").trim();
      const telefone = String(req.body?.telefone || "").trim();
      const mensagem = String(req.body?.mensagem || "").trim();

      if (!barbeariaId || !telefone || !mensagem) {
        return res.status(400).json({
          error: "barbeariaId, telefone e mensagem sao obrigatorios."
        });
      }

      const payload = await sessionManager.sendMessage(barbeariaId, telefone, mensagem);
      return res.json(payload);
    })
  );
}

function registerPublicRoutes(app) {
  app.get(
    "/chatbot/status",
    attachExpressRoute(async (_req, res) => {
      const connections = await sessionManager.listSessions();
      res.set(headersNoCache);
      res.json({ connections });
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/status",
    attachExpressRoute(async (req, res) => {
      const runtime = await sessionManager.ensureRuntimeBySessionName(req.params.sessionName);
      res.set(headersNoCache);
      res.json(await sessionManager.getSessionStatus(runtime.barbeariaId));
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/qr.png",
    attachExpressRoute(async (req, res) => {
      const runtime = await sessionManager.ensureRuntimeBySessionName(req.params.sessionName);

      if (!runtime.qrPngBuffer) {
        res.set(headersNoCache);
        return res.status(404).json(await sessionManager.getSessionStatus(runtime.barbeariaId));
      }

      res.set(headersNoCache);
      res.set("Content-Type", "image/png");
      return res.send(runtime.qrPngBuffer);
    })
  );

  app.get(
    "/chatbot/connections/:sessionName/qr",
    attachExpressRoute(async (req, res) => {
      const runtime = await sessionManager.ensureRuntimeBySessionName(req.params.sessionName);
      await sessionManager.startSession(runtime.barbeariaId).catch(() => null);
      res.set(headersNoCache);
      res.type("html");
      res.send(sessionManager.renderQrPage(runtime));
    })
  );

  app.post(
    "/webhook",
    attachExpressRoute(async (req, res) => {
      const payload = req.body || {};
      const response = await sessionManager.handleWebhookPayload(payload);
      res.json(response);
    })
  );

  app.get(
    "/qr",
    attachExpressRoute(async (_req, res) => {
      const runtime = await ensureFirstAvailableRuntime();

      if (!runtime) {
        res.set(headersNoCache);
        res.type("html");
        res.send(
          "<html><body><main style='font-family:Arial,sans-serif;padding:24px;'>Nenhuma sessao ativa disponivel.</main></body></html>"
        );
        return;
      }

      res.set(headersNoCache);
      res.type("html");
      res.send(sessionManager.renderQrPage(runtime));
    })
  );

  app.get(
    "/qr.png",
    attachExpressRoute(async (_req, res) => {
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

function registerChatbotRoutes(app) {
  registerManagementRoutes(app);
  registerPublicRoutes(app);
}

async function handleStandaloneRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/chatbot/status") {
    return respondJson(res, 200, {
      connections: await sessionManager.listSessions()
    });
  }

  const dynamicMatch = pathname.match(
    /^\/chatbot\/connections\/([^/]+)\/(status|qr|qr\.png)$/
  );

  if (dynamicMatch) {
    const sessionName = decodeURIComponent(dynamicMatch[1]);
    const resource = dynamicMatch[2];
    const runtime = await sessionManager.ensureRuntimeBySessionName(sessionName);

    if (resource === "status") {
      return respondJson(res, 200, await sessionManager.getSessionStatus(runtime.barbeariaId));
    }

    if (resource === "qr.png") {
      if (!runtime.qrPngBuffer) {
        return respondJson(res, 404, await sessionManager.getSessionStatus(runtime.barbeariaId));
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
    res.end(sessionManager.renderQrPage(runtime));
    return;
  }

  if (pathname === "/qr" || pathname === "/qr.png") {
    const runtime = await ensureFirstAvailableRuntime();

    if (!runtime) {
      return respondJson(res, 404, { status: "aguardando_qr" });
    }

    if (pathname === "/qr.png") {
      if (!runtime.qrPngBuffer) {
        return respondJson(res, 404, await sessionManager.getSessionStatus(runtime.barbeariaId));
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
    res.end(sessionManager.renderQrPage(runtime));
    return;
  }

  if (pathname === "/webhook" && req.method === "POST") {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const response = await sessionManager.handleWebhookPayload(payload);
    return respondJson(res, 200, response);
  }

  if (pathname.startsWith("/internal/chatbot/")) {
    if (!requireInternalRequest(req, res)) {
      return;
    }

    if (pathname === "/internal/chatbot/sessions/status" && req.method === "GET") {
      const barbeariaId = String(url.searchParams.get("barbeariaId") || "").trim();
      if (!barbeariaId) {
        return respondJson(res, 400, { error: "Parametro barbeariaId e obrigatorio." });
      }
      return respondJson(res, 200, await sessionManager.getSessionStatus(barbeariaId));
    }

    if (pathname === "/internal/chatbot/sessions/qr" && req.method === "GET") {
      const barbeariaId = String(url.searchParams.get("barbeariaId") || "").trim();
      if (!barbeariaId) {
        return respondJson(res, 400, { error: "Parametro barbeariaId e obrigatorio." });
      }
      return respondJson(res, 200, await sessionManager.getQrCode(barbeariaId));
    }

    const body = JSON.parse((await readBody(req)) || "{}");
    const barbeariaId = String(body?.barbeariaId || "").trim();

    if (
      [
        "/internal/chatbot/sessions/start",
        "/internal/chatbot/sessions/restart",
        "/internal/chatbot/sessions/disconnect"
      ].includes(pathname) &&
      !barbeariaId
    ) {
      return respondJson(res, 400, { error: "barbeariaId obrigatorio." });
    }

    if (pathname === "/internal/chatbot/sessions/start" && req.method === "POST") {
      return respondJson(res, 200, await sessionManager.startSession(barbeariaId));
    }

    if (pathname === "/internal/chatbot/sessions/restart" && req.method === "POST") {
      return respondJson(res, 200, await sessionManager.restartSession(barbeariaId));
    }

    if (pathname === "/internal/chatbot/sessions/disconnect" && req.method === "POST") {
      return respondJson(res, 200, await sessionManager.disconnectSession(barbeariaId));
    }

    if (pathname === "/internal/chatbot/messages/send" && req.method === "POST") {
      const telefone = String(body?.telefone || "").trim();
      const mensagem = String(body?.mensagem || "").trim();
      if (!barbeariaId || !telefone || !mensagem) {
        return respondJson(res, 400, {
          error: "barbeariaId, telefone e mensagem sao obrigatorios."
        });
      }
      return respondJson(
        res,
        200,
        await sessionManager.sendMessage(barbeariaId, telefone, mensagem)
      );
    }

    return respondJson(res, 404, { error: "Rota interna do chatbot nao encontrada." });
  }

  return respondJson(res, 200, {
    connections: await sessionManager.listSessions()
  });
}

module.exports = {
  initializeChatbot: sessionManager.initializeChatbot,
  registerChatbotRoutes,
  startSession: sessionManager.startSession,
  stopSession: sessionManager.stopSession,
  restartSession: sessionManager.restartSession,
  disconnectSession: sessionManager.disconnectSession,
  getSessionStatus: sessionManager.getSessionStatus,
  getQrCode: sessionManager.getQrCode,
  sendMessage: sessionManager.sendMessage,
  listSessions: sessionManager.listSessions
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

  sessionManager.initializeChatbot().catch((error) => {
    console.log("Falha ao iniciar chatbot:", error.message);
  });
}
