import { query } from "../db.js";
import { getBarbershopDisplayName } from "./barbershopService.js";

function toDateTime(date, time = "09:00") {
  return new Date(`${String(date).slice(0, 10)}T${time}:00`);
}

function formatDateBr(date) {
  const [year, month, day] = String(date).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTimeForDatabase(value) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function subtractHours(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function subtractDays(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function isFuture(date) {
  return new Date(date).getTime() > Date.now();
}

function formatIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildAppointmentMessages(appointment, barbershopName) {
  const appointmentDateTime = toDateTime(appointment.data, appointment.hora);

  return [
    {
      categoria: "agendamento_1_dia_antes",
      agendadoPara: subtractDays(appointmentDateTime, 1),
      mensagem: `Oi, ${appointment.nome}! Lembrete do seu horario amanha, ${formatDateBr(appointment.data)}, as ${appointment.hora}, para ${appointment.servico} na ${barbershopName}.`
    },
    {
      categoria: "agendamento_mesmo_dia",
      agendadoPara: subtractHours(appointmentDateTime, 3),
      mensagem: `Oi, ${appointment.nome}! Seu atendimento e hoje, ${formatDateBr(appointment.data)}, as ${appointment.hora}, para ${appointment.servico}. Se precisar remarcar, fale conosco.`
    }
  ].filter((item) => isFuture(item.agendadoPara));
}

function buildSubscriptionMessages(subscriber, barbershopName) {
  const dueDate = toDateTime(subscriber.data_vencimento, "09:00");

  return [
    {
      categoria: "assinatura_3_dias",
      agendadoPara: subtractDays(dueDate, 3),
      mensagem: `Oi, ${subscriber.nome}! Seu plano ${subscriber.plano_nome} vence em 3 dias, no dia ${formatDateBr(subscriber.data_vencimento)}. Mantenha o pagamento em dia para continuar usando seus cortes na ${barbershopName}.`
    },
    {
      categoria: "assinatura_1_dia",
      agendadoPara: subtractDays(dueDate, 1),
      mensagem: `Oi, ${subscriber.nome}! Seu plano ${subscriber.plano_nome} vence amanha, no dia ${formatDateBr(subscriber.data_vencimento)}.`
    },
    {
      categoria: "assinatura_vencimento",
      agendadoPara: dueDate,
      mensagem: `Oi, ${subscriber.nome}! Seu plano ${subscriber.plano_nome} vence hoje (${formatDateBr(subscriber.data_vencimento)}). Se ja realizou o pagamento, desconsidere esta mensagem.`
    }
  ].filter((item) => isFuture(item.agendadoPara));
}

async function clearPendingReminders(executor, referenceType, referenceId) {
  await executor.query(
    `
      UPDATE lembretes
      SET status = 'cancelado'
      WHERE referencia_tipo = $1
        AND referencia_id = $2
        AND status = 'pendente'
    `,
    [referenceType, referenceId]
  );
}

async function insertReminderBatch(
  executor,
  reminders,
  referenceType,
  referenceId,
  barbeariaId,
  telefone,
  nomeCliente
) {
  for (const reminder of reminders) {
    await executor.query(
      `
        INSERT INTO lembretes
          (barbearia_id, referencia_tipo, referencia_id, categoria, telefone, nome_cliente, mensagem, agendado_para, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp, 'pendente')
      `,
      [
        barbeariaId,
        referenceType,
        referenceId,
        reminder.categoria,
        telefone,
        nomeCliente,
        reminder.mensagem,
        formatDateTimeForDatabase(reminder.agendadoPara)
      ]
    );
  }
}

export async function scheduleAppointmentReminders(executor, appointment) {
  const barbershopName = await getBarbershopDisplayName(appointment.barbearia_id);
  await clearPendingReminders(executor, "agendamento", appointment.id);
  await insertReminderBatch(
    executor,
    buildAppointmentMessages(appointment, barbershopName),
    "agendamento",
    appointment.id,
    appointment.barbearia_id,
    appointment.telefone,
    appointment.nome
  );
}

export async function cancelAppointmentReminders(executor, appointmentId) {
  await clearPendingReminders(executor, "agendamento", appointmentId);
}

export async function scheduleSubscriptionReminders(executor, subscriber) {
  const barbershopName = await getBarbershopDisplayName(subscriber.barbearia_id);
  await clearPendingReminders(executor, "assinatura", subscriber.id);
  await insertReminderBatch(
    executor,
    buildSubscriptionMessages(subscriber, barbershopName),
    "assinatura",
    subscriber.id,
    subscriber.barbearia_id,
    subscriber.telefone,
    subscriber.nome
  );
}

export async function listPendingReminders(limit = 20) {
  const result = await query(
    `
      SELECT *
      FROM lembretes
      WHERE status = 'pendente'
        AND agendado_para <= NOW()
      ORDER BY agendado_para ASC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

export async function markReminderSent(reminderId) {
  await query(
    `
      UPDATE lembretes
      SET status = 'enviado',
          enviado_em = NOW(),
          tentativas = tentativas + 1,
          ultimo_erro = NULL
      WHERE id = $1
    `,
    [reminderId]
  );
}

export async function markReminderError(reminderId, errorMessage) {
  await query(
    `
      UPDATE lembretes
      SET tentativas = tentativas + 1,
          ultimo_erro = $2,
          status = CASE WHEN tentativas + 1 >= 3 THEN 'erro' ELSE 'pendente' END
      WHERE id = $1
    `,
    [reminderId, String(errorMessage || "Erro desconhecido").slice(0, 500)]
  );
}

export function buildNextDueDate(paymentDate, validityDays) {
  return formatIsoDate(addDays(toDateTime(paymentDate, "09:00"), Number(validityDays)));
}
