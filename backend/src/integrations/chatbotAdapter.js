import { getBarbershopDisplayName } from "../services/barbershopService.js";
import { sendTenantChatbotMessage } from "../services/chatbotGateway.js";

export async function sendChatbotConfirmation(agendamento) {
  const message = `Agendamento confirmado para ${String(agendamento.data).slice(0, 10)} as ${agendamento.hora}.`;

  return sendTenantChatbotMessage(
    agendamento.barbearia_id,
    agendamento.telefone,
    message
  );
}

export async function sendChatbotCompletionThanks(agendamento) {
  const barbershopName = await getBarbershopDisplayName(agendamento.barbearia_id);

  return sendTenantChatbotMessage(
    agendamento.barbearia_id,
    agendamento.telefone,
    `Agradecemos, ${agendamento.nome}, pela confianca em nosso atendimento na ${barbershopName}.`
  );
}

export async function sendChatbotTextMessage({ telefone, texto, barbershopId = null }) {
  if (!barbershopId) {
    return { ok: false, skipped: true };
  }

  return sendTenantChatbotMessage(barbershopId, telefone, texto);
}
