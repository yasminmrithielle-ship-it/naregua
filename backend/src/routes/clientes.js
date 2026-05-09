import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAdmin, requireOperationalUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

const clientSchema = z.object({
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  telefone: z.string().trim().min(8, "Telefone obrigatorio"),
  email: z.string().trim().email("Email invalido").optional().or(z.literal("")),
  notas: z.string().trim().optional()
});

router.get("/clientes", requireOperationalUser, asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const currentBarbershop = req.auth.membership.barbershopId;
  const like = search ? `%${search}%` : null;

  const result = await query(
    `
      SELECT
        c.id,
        c.nome,
        c.telefone,
        c.email,
        c.notas,
        COALESCE(c.total_agendamentos, (
          SELECT COUNT(*)::int
          FROM agendamentos a
          WHERE a.barbearia_id = c.barbearia_id
            AND REGEXP_REPLACE(COALESCE(a.cliente_telefone, a.telefone, ''), '\D', '', 'g')
              = REGEXP_REPLACE(COALESCE(c.telefone, ''), '\D', '', 'g')
            AND a.status != 'cancelado'
        )) AS total_agendamentos,
        COALESCE(c.ultimo_agendamento, (
          SELECT MAX(a.data)
          FROM agendamentos a
          WHERE a.barbearia_id = c.barbearia_id
            AND REGEXP_REPLACE(COALESCE(a.cliente_telefone, a.telefone, ''), '\D', '', 'g')
              = REGEXP_REPLACE(COALESCE(c.telefone, ''), '\D', '', 'g')
            AND a.status != 'cancelado'
        )) AS ultimo_agendamento,
        c.created_at
      FROM clientes c
      WHERE c.barbearia_id = $1
        AND (
          $2::text IS NULL
          OR c.nome ILIKE $2
          OR c.telefone ILIKE $2
          OR COALESCE(c.email, '') ILIKE $2
        )
      ORDER BY ultimo_agendamento DESC NULLS LAST, c.nome ASC
    `,
    [currentBarbershop, like]
  );

  return res.json(result.rows);
}));

router.post("/clientes", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = clientSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const currentBarbershop = req.auth.membership.barbershopId;
  const result = await query(
    `
      INSERT INTO clientes (
        barbearia_id,
        nome,
        telefone,
        email,
        notas
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (barbearia_id, telefone) DO UPDATE
      SET
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        notas = EXCLUDED.notas,
        updated_at = NOW()
      RETURNING *
    `,
    [
      currentBarbershop,
      parsed.data.nome,
      parsed.data.telefone,
      parsed.data.email || null,
      parsed.data.notas || null
    ]
  );

  return res.status(201).json(result.rows[0]);
}));

router.put("/clientes/:id", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = clientSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const result = await query(
    `
      UPDATE clientes
      SET
        nome = $1,
        telefone = $2,
        email = $3,
        notas = $4,
        updated_at = NOW()
      WHERE id = $5
        AND barbearia_id = $6
      RETURNING *
    `,
    [
      parsed.data.nome,
      parsed.data.telefone,
      parsed.data.email || null,
      parsed.data.notas || null,
      req.params.id,
      req.auth.membership.barbershopId
    ]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Cliente nao encontrado" });
  }

  return res.json(result.rows[0]);
}));

export default router;
