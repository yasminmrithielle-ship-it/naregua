import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAdmin, requireOperationalUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

const barberSchema = z.object({
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  telefone: z.string().trim().optional(),
  fotoUrl: z.string().trim().url().optional().or(z.literal("")),
  especialidade: z.string().trim().optional(),
  ativo: z.boolean().optional()
});

router.get("/barbeiros", requireOperationalUser, asyncHandler(async (req, res) => {
  const result = await query(
    `
      SELECT
        id,
        barbearia_id,
        nome,
        COALESCE(telefone, phone) AS telefone,
        foto_url,
        especialidade,
        COALESCE(ativo, active, true) AS ativo,
        created_at
      FROM barbeiros
      WHERE barbearia_id = $1
      ORDER BY nome ASC
    `,
    [req.auth.membership.barbershopId]
  );

  return res.json(result.rows);
}));

router.post("/barbeiros", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = barberSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const result = await query(
    `
      INSERT INTO barbeiros (
        barbearia_id,
        nome,
        phone,
        telefone,
        foto_url,
        especialidade,
        active,
        ativo
      )
      VALUES ($1, $2, $3, $3, $4, $5, $6, $6)
      RETURNING *
    `,
    [
      req.auth.membership.barbershopId,
      parsed.data.nome,
      parsed.data.telefone || null,
      parsed.data.fotoUrl || null,
      parsed.data.especialidade || null,
      parsed.data.ativo ?? true
    ]
  );

  return res.status(201).json(result.rows[0]);
}));

router.put("/barbeiros/:id", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = barberSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const result = await query(
    `
      UPDATE barbeiros
      SET
        nome = $1,
        phone = $2,
        telefone = $2,
        foto_url = $3,
        especialidade = $4,
        active = $5,
        ativo = $5,
        updated_at = NOW()
      WHERE id = $6
        AND barbearia_id = $7
      RETURNING *
    `,
    [
      parsed.data.nome,
      parsed.data.telefone || null,
      parsed.data.fotoUrl || null,
      parsed.data.especialidade || null,
      parsed.data.ativo ?? true,
      req.params.id,
      req.auth.membership.barbershopId
    ]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Barbeiro nao encontrado" });
  }

  return res.json(result.rows[0]);
}));

export default router;
