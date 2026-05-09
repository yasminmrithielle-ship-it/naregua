import {
  buildPublicChatbotUrl,
  getChatbotEnabled,
  getChatbotInternalSecret,
  getPublicApiUrl,
  getPublicChatbotUrl
} from "../config.js";

let localController = null;

async function requestChatbot(path, { method = "GET", body = null, internal = false } = {}) {
  const baseUrl = getPublicChatbotUrl();

  if (!baseUrl) {
    throw new Error("Chatbot nao configurado neste ambiente.");
  }

  const response = await fetch(buildPublicChatbotUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(internal ? { "x-chatbot-secret": getChatbotInternalSecret() } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(json?.error || `Falha ao acessar chatbot (${response.status}).`);
  }

  return json;
}

function buildDisabledStatus() {
  return {
    status: "disabled",
    sessionName: null,
    qrCode: null,
    qrDataUrl: null,
    qrPageUrl: "",
    qrImageUrl: "",
    telefoneConectado: null,
    provider: "whatsapp-web.js",
    mode: getPublicChatbotUrl() ? "proxy" : "disabled"
  };
}

function hasExternalChatbotUrl() {
  const chatbotUrl = getPublicChatbotUrl();
  const apiUrl = getPublicApiUrl();

  if (!chatbotUrl) {
    return false;
  }

  if (getChatbotEnabled()) {
    return false;
  }

  return !apiUrl || chatbotUrl !== apiUrl;
}

export function registerLocalChatbotController(controller) {
  localController = controller;
}

export function hasLocalChatbotController() {
  return Boolean(localController);
}

export async function getTenantChatbotStatus(barbeariaId) {
  if (localController) {
    return localController.getSessionStatus(barbeariaId);
  }

  if (hasExternalChatbotUrl()) {
    return requestChatbot(
      `/internal/chatbot/sessions/status?barbeariaId=${encodeURIComponent(barbeariaId)}`,
      {
        internal: true
      }
    );
  }

  return buildDisabledStatus();
}

export async function getTenantQrCode(barbeariaId) {
  if (localController) {
    return localController.getQrCode(barbeariaId);
  }

  if (hasExternalChatbotUrl()) {
    return requestChatbot(
      `/internal/chatbot/sessions/qr?barbeariaId=${encodeURIComponent(barbeariaId)}`,
      {
        internal: true
      }
    );
  }

  return buildDisabledStatus();
}

export async function startTenantChatbotSession(barbeariaId) {
  if (localController) {
    return localController.startSession(barbeariaId);
  }

  if (!hasExternalChatbotUrl()) {
    return buildDisabledStatus();
  }

  return requestChatbot("/internal/chatbot/sessions/start", {
    method: "POST",
    internal: true,
    body: { barbeariaId }
  });
}

export async function restartTenantChatbotSession(barbeariaId) {
  if (localController) {
    return localController.restartSession(barbeariaId);
  }

  if (!hasExternalChatbotUrl()) {
    return buildDisabledStatus();
  }

  return requestChatbot("/internal/chatbot/sessions/restart", {
    method: "POST",
    internal: true,
    body: { barbeariaId }
  });
}

export async function disconnectTenantChatbotSession(barbeariaId) {
  if (localController) {
    return localController.disconnectSession(barbeariaId);
  }

  if (!hasExternalChatbotUrl()) {
    return buildDisabledStatus();
  }

  return requestChatbot("/internal/chatbot/sessions/disconnect", {
    method: "POST",
    internal: true,
    body: { barbeariaId }
  });
}

export async function sendTenantChatbotMessage(barbeariaId, telefone, mensagem) {
  if (localController) {
    return localController.sendMessage(barbeariaId, telefone, mensagem);
  }

  if (hasExternalChatbotUrl()) {
    return requestChatbot("/internal/chatbot/messages/send", {
      method: "POST",
      internal: true,
      body: {
        barbeariaId,
        telefone,
        mensagem
      }
    });
  }

  return { ok: false, skipped: true };
}

export async function listChatbotPublicConnections() {
  if (localController) {
    return localController.listSessions();
  }

  if (hasExternalChatbotUrl()) {
    const payload = await requestChatbot("/chatbot/status");
    return payload.connections || [];
  }

  return [];
}
