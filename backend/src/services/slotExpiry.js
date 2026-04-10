import cron from "node-cron";
import { query } from "../db.js";
import { BARBERSHOP_TIMEZONE } from "../config.js";

function getCurrentBarbershopDateTime(timezone = BARBERSHOP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone || BARBERSHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function getCurrentSlotReference(timezone = BARBERSHOP_TIMEZONE) {
  return getCurrentBarbershopDateTime(timezone);
}

async function deactivateForBarbershop(barbershopId, timezone) {
  const { date, time } = getCurrentBarbershopDateTime(timezone);

  const result = await query(
    `
      UPDATE horarios h
      SET disponivel = false
      WHERE h.barbearia_id = $1
        AND h.data = $2::date
        AND h.disponivel = true
        AND h.hora < $3
        AND NOT EXISTS (
          SELECT 1
          FROM agendamentos a
          WHERE a.data = h.data
            AND a.hora = h.hora
            AND a.barbearia_id = h.barbearia_id
            AND a.status != 'cancelado'
        )
    `,
    [barbershopId, date, time]
  );

  return result.rowCount || 0;
}

export async function deactivateExpiredOpenSlots(barbershopId = null, timezone = null) {
  if (barbershopId) {
    return deactivateForBarbershop(barbershopId, timezone);
  }

  const barbershops = await query(
    `
      SELECT id, timezone
      FROM barbearias
      WHERE status = 'active'
    `
  );

  let total = 0;

  for (const item of barbershops.rows) {
    total += await deactivateForBarbershop(item.id, item.timezone || BARBERSHOP_TIMEZONE);
  }

  return total;
}

export function startSlotExpiryMonitor() {
  cron.schedule("* * * * *", async () => {
    try {
      await deactivateExpiredOpenSlots();
    } catch (error) {
      console.error("Falha ao desativar horarios expirados:", error);
    }
  });
}
