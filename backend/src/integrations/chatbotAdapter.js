import dotenv from "dotenv";
import {
  getBarbershopDisplayName,
  getPrimaryWhatsAppConnection
} from "../services/barbershopService.js";

dotenv.config();

async function buildWebhookPayload(payload, barbershopId = null) {
  if (!barbershopId) {
    return payload;
  }

  const connection = await getPrimaryWhatsAppConnection(barbershopId);

  return {
    ...payload,
    barbershopId,
    sessionName: connection?.session_name || null
  };
}

async function sendWebhook(payload, barbershopId = null) {
  if (!process.env.CHATBOT_WEBHOOK_URL) {
    return { ok: false, skipped: true };
  }

  const requestPayload = await buildWebhookPayload(payload, barbershopId);
  const response = await fetch(process.env.CHATBOT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload)
  });

  return { ok: response.ok };
}

export async function sendChatbotConfirmation(agendamento) {
  return sendWebhook(
    {
      type: "agendamento_confirmado",
      data: agendamento
    },
    agendamento.barbearia_id
  );
}

export async function sendChatbotCompletionThanks(agendamento) {
  const barbershopName = await getBarbershopDisplayName(agendamento.barbearia_id);

  return sendWebhook(
    {
      type: "agendamento_concluido",
      data: {
        telefone: agendamento.telefone,
        texto: `Agradecemos, ${agendamento.nome}, pela confianca em nosso atendimento. Foi um prazer recebe-lo(a) na ${barbershopName}. Esperamos ve-lo(a) novamente em breve.`
      }
    },
    agendamento.barbearia_id
  );
}

export async function sendChatbotTextMessage({ telefone, texto, barbershopId = null }) {
  return sendWebhook(
    {
      type: "mensagem_customizada",
      data: {
        telefone,
        texto
      }
    },
    barbershopId
  );
}
