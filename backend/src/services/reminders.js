import cron from "node-cron";
import { sendChatbotTextMessage } from "../integrations/chatbotAdapter.js";
import {
  listPendingReminders,
  markReminderError,
  markReminderSent
} from "./reminderScheduler.js";

export function startReminders() {
  cron.schedule("*/5 * * * *", async () => {
    const reminders = await listPendingReminders(50);

    for (const reminder of reminders) {
      try {
        const response = await sendChatbotTextMessage({
          telefone: reminder.telefone,
          texto: reminder.mensagem,
          barbershopId: reminder.barbearia_id
        });

        if (response?.ok || response?.skipped) {
          await markReminderSent(reminder.id);
        } else {
          await markReminderError(reminder.id, "Falha ao enviar lembrete pelo webhook.");
        }
      } catch (error) {
        await markReminderError(reminder.id, error.message || "Erro desconhecido");
      }
    }
  });
}
