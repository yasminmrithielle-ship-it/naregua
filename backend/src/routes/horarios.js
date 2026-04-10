import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAdmin, requireOperationalUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deactivateExpiredOpenSlots,
  getCurrentSlotReference
} from "../services/slotExpiry.js";

const router = express.Router();
const WEEKLY_SLOTS = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00"
];
const ALLOWED_WEEK_DAYS = [2, 3, 4, 5, 6];

const horariosSchema = z.object({
  data: z.string(),
  hora: z.string()
});

const disponibilidadeSchema = z.object({
  disponivel: z.boolean()
});

const gerarSemanaSchema = z.object({
  dataInicial: z.string().optional()
});

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function toDateOnly(value) {
  return new Date(`${value}T00:00:00`);
}

function getStartDate(baseDate = new Date()) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);

  while (!ALLOWED_WEEK_DAYS.includes(date.getDay())) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function buildWeeklyDates(startDateValue) {
  const startDate = getStartDate(startDateValue ? toDateOnly(startDateValue) : new Date());
  const dates = [];

  for (let offset = 0; dates.length < ALLOWED_WEEK_DAYS.length; offset += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + offset);

    if (ALLOWED_WEEK_DAYS.includes(current.getDay())) {
      dates.push(formatDate(current));
    }
  }

  return dates;
}

router.get("/horarios-disponiveis", asyncHandler(async (req, res) => {
  const { data, barbeariaId } = req.query;
  if (!data || !barbeariaId) {
    return res.status(400).json({ error: "Parametros data e barbeariaId sao obrigatorios" });
  }

  await deactivateExpiredOpenSlots(barbeariaId);
  const { date: currentDate, time: currentTime } = getCurrentSlotReference();

  const result = await query(
    `
      SELECT h.hora
      FROM horarios h
      LEFT JOIN agendamentos a
        ON a.data = h.data
       AND a.hora = h.hora
       AND a.status != 'cancelado'
       AND a.barbearia_id = h.barbearia_id
      WHERE h.data = $1
        AND h.disponivel = true
        AND h.barbearia_id = COALESCE($2, h.barbearia_id)
        AND a.id IS NULL
        AND (
          h.data > $3::date
          OR (h.data = $3::date AND h.hora >= $4)
        )
      ORDER BY h.hora ASC
    `,
    [data, barbeariaId || null, currentDate, currentTime]
  );

  return res.json(result.rows.map((row) => row.hora));
}));

router.get("/dias-disponiveis", asyncHandler(async (req, res) => {
  const { dataInicial, barbeariaId } = req.query;
  if (!barbeariaId) {
    return res.status(400).json({ error: "Parametro barbeariaId e obrigatorio" });
  }
  const datas = buildWeeklyDates(
    typeof dataInicial === "string" && dataInicial ? dataInicial : undefined
  );
  await deactivateExpiredOpenSlots(barbeariaId);
  const { date: currentDate, time: currentTime } = getCurrentSlotReference();

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
        AND h.barbearia_id = COALESCE($2, h.barbearia_id)
      GROUP BY h.data
      ORDER BY h.data ASC
    `,
    [datas, barbeariaId || null, currentDate, currentTime]
  );

  const disponibilidadePorData = new Map(
    result.rows.map((row) => [formatDate(new Date(row.data)), Number(row.disponiveis)])
  );

  return res.json(
    datas
      .map((data) => ({
        data,
        disponiveis: disponibilidadePorData.get(data) || 0
      }))
      .filter((dia) => dia.disponiveis > 0)
  );
}));

router.get("/horarios", requireOperationalUser, asyncHandler(async (req, res) => {
  const { dataInicial, dataFinal } = req.query;
  const currentBarbershop = req.auth.membership.barbershopId;
  await deactivateExpiredOpenSlots(currentBarbershop, req.auth.barbershop.timezone);
  const result = await query(
    `
      SELECT h.*
      FROM horarios h
      WHERE ($1::date IS NULL OR h.data >= $1)
        AND ($2::date IS NULL OR h.data <= $2)
        AND h.barbearia_id = $3
      ORDER BY h.data ASC, h.hora ASC
    `,
    [dataInicial || null, dataFinal || null, currentBarbershop]
  );

  return res.json(result.rows);
}));

router.post("/horarios", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = horariosSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { data, hora } = parsed.data;
  const currentBarbershop = req.auth.membership.barbershopId;
  const { date: currentDate, time: currentTime } = getCurrentSlotReference(
    req.auth.barbershop.timezone
  );

  if (data < currentDate || (data === currentDate && hora < currentTime)) {
    return res.status(409).json({ error: "Nao e possivel criar um horario que ja passou" });
  }

  const result = await query(
    `
      INSERT INTO horarios (barbearia_id, data, hora, disponivel)
      SELECT $1, $2, $3, true
      WHERE NOT EXISTS (
        SELECT 1
        FROM horarios
        WHERE barbearia_id = $1
          AND data = $2
          AND hora = $3
      )
      RETURNING *
    `,
    [currentBarbershop, data, hora]
  );

  if (!result.rows.length) {
    return res.status(409).json({ error: "Horario ja existe" });
  }

  return res.status(201).json(result.rows[0]);
}));

router.post("/horarios/gerar-semana", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = gerarSemanaSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { dataInicial } = parsed.data;
  const currentBarbershop = req.auth.membership.barbershopId;
  const datas = buildWeeklyDates(dataInicial);
  const inserted = [];

  for (const data of datas) {
    for (const hora of WEEKLY_SLOTS) {
      const result = await query(
        `
          INSERT INTO horarios (barbearia_id, data, hora, disponivel)
          SELECT $1, $2, $3, true
          WHERE NOT EXISTS (
            SELECT 1
            FROM horarios
            WHERE barbearia_id = $1
              AND data = $2
              AND hora = $3
          )
          RETURNING *
        `,
        [currentBarbershop, data, hora]
      );

      if (result.rows[0]) {
        inserted.push(result.rows[0]);
      }
    }
  }

  return res.status(201).json({
    inserted: inserted.length,
    datas,
    horarios: inserted
  });
}));

router.delete("/horarios", requireAdmin, asyncHandler(async (req, res) => {
  const { data } = req.query;

  if (!data) {
    return res.status(400).json({ error: "Parametro data e obrigatorio" });
  }

  const currentBarbershop = req.auth.membership.barbershopId;
  const activeAppointments = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM agendamentos
      WHERE barbearia_id = $1
        AND data = $2::date
        AND status != 'cancelado'
    `,
    [currentBarbershop, data]
  );

  if (activeAppointments.rows[0]?.total > 0) {
    return res.status(409).json({
      error: "Existem atendimentos ativos neste dia. Cancele ou remarque os agendamentos antes de excluir a data."
    });
  }

  const result = await query(
    `
      DELETE FROM horarios
      WHERE barbearia_id = $1
        AND data = $2::date
    `,
    [currentBarbershop, data]
  );

  return res.json({
    ok: true,
    removidos: result.rowCount || 0,
    data
  });
}));

router.put("/horarios/:id/disponibilidade", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = disponibilidadeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { id } = req.params;
  await deactivateExpiredOpenSlots(
    req.auth.membership.barbershopId,
    req.auth.barbershop.timezone
  );

  if (parsed.data.disponivel) {
    const horarioResult = await query(
      `
        SELECT id, data, hora
        FROM horarios
        WHERE id = $1
          AND barbearia_id = $2
        LIMIT 1
      `,
      [id, req.auth.membership.barbershopId]
    );

    if (!horarioResult.rows.length) {
      return res.status(404).json({ error: "Horario nao encontrado" });
    }

    const horario = horarioResult.rows[0];
    const { date: currentDate, time: currentTime } = getCurrentSlotReference(
      req.auth.barbershop.timezone
    );

    if (
      String(horario.data).slice(0, 10) < currentDate ||
      (String(horario.data).slice(0, 10) === currentDate && horario.hora < currentTime)
    ) {
      return res.status(409).json({ error: "Nao e possivel reativar um horario que ja passou" });
    }
  }

  const result = await query(
    `
      UPDATE horarios
      SET disponivel = $1
      WHERE id = $2
        AND barbearia_id = $3
      RETURNING *
    `,
    [parsed.data.disponivel, id, req.auth.membership.barbershopId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Horario nao encontrado" });
  }

  return res.json(result.rows[0]);
}));

export default router;
