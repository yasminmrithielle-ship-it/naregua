import express from "express";
import { z } from "zod";
import { requireAdmin, requireOperationalUser } from "../middleware/auth.js";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureDefaultServices } from "../services/serviceCatalog.js";

const router = express.Router();

const serviceSchema = z.object({
  nome: z.string().trim().min(2, "Nome do servico e obrigatorio"),
  duracao: z.coerce.number().int().positive("Duracao invalida"),
  preco: z.coerce.number().positive("Preco invalido")
});

router.get("/servicos", requireOperationalUser, asyncHandler(async (req, res) => {
  const currentBarbershop = req.auth.membership.barbershopId;

  await ensureDefaultServices(currentBarbershop);

  const result = await query(
    `
      SELECT id, barbearia_id, nome, duracao, preco, ativo
      FROM servicos
      WHERE barbearia_id = $1
      ORDER BY nome ASC
    `,
    [currentBarbershop]
  );

  return res.json(result.rows);
}));

router.post("/servicos", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  const { nome, duracao, preco } = parsed.data;
  const currentBarbershop = req.auth.membership.barbershopId;

  const existing = await query(
    `
      SELECT id
      FROM servicos
      WHERE barbearia_id = $1
        AND LOWER(nome) = LOWER($2)
      LIMIT 1
    `,
    [currentBarbershop, nome]
  );

  if (existing.rows.length) {
    return res.status(409).json({ error: "Ja existe um servico com esse nome" });
  }

  const result = await query(
    `
      INSERT INTO servicos (barbearia_id, nome, duracao, preco)
      VALUES ($1, $2, $3, $4)
      RETURNING id, barbearia_id, nome, duracao, preco, ativo
    `,
    [currentBarbershop, nome, duracao, preco]
  );

  return res.status(201).json(result.rows[0]);
}));

router.put("/servicos/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parsed = serviceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  const { nome, duracao, preco } = parsed.data;
  const currentBarbershop = req.auth.membership.barbershopId;
  const currentService = await query(
    `
      SELECT id, nome
      FROM servicos
      WHERE id = $1
        AND barbearia_id = $2
      LIMIT 1
    `,
    [id, currentBarbershop]
  );

  if (!currentService.rows.length) {
    return res.status(404).json({ error: "Servico nao encontrado" });
  }

  const previousName = currentService.rows[0].nome;

  const conflict = await query(
    `
      SELECT id
      FROM servicos
      WHERE barbearia_id = $1
        AND LOWER(nome) = LOWER($2)
        AND id != $3
      LIMIT 1
    `,
    [currentBarbershop, nome, id]
  );

  if (conflict.rows.length) {
    return res.status(409).json({ error: "Ja existe um servico com esse nome" });
  }

  const result = await query(
    `
      UPDATE servicos
      SET nome = $1,
          duracao = $2,
          preco = $3,
          updated_at = NOW()
      WHERE id = $4
        AND barbearia_id = $5
      RETURNING id, barbearia_id, nome, duracao, preco, ativo
    `,
    [nome, duracao, preco, id, currentBarbershop]
  );

  await query(
    `
      UPDATE agendamentos
      SET
        servico = $1,
        servico_nome = $1
      WHERE barbearia_id = $2
        AND COALESCE(servico_nome, servico) = $3
    `,
    [nome, currentBarbershop, previousName]
  );

  return res.json(result.rows[0]);
}));

router.delete("/servicos/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentBarbershop = req.auth.membership.barbershopId;

  const serviceResult = await query(
    `
      SELECT id, nome
      FROM servicos
      WHERE id = $1
        AND barbearia_id = $2
      LIMIT 1
    `,
    [id, currentBarbershop]
  );

  if (!serviceResult.rows.length) {
    return res.status(404).json({ error: "Servico nao encontrado" });
  }

  const service = serviceResult.rows[0];
  const usage = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM agendamentos
      WHERE barbearia_id = $1
        AND COALESCE(servico_nome, servico) = $2
        AND status != 'cancelado'
    `,
    [currentBarbershop, service.nome]
  );

  if (usage.rows[0]?.total > 0) {
    return res.status(409).json({
      error: "Nao e possivel remover um servico com agendamentos ativos"
    });
  }

  await query(
    `
      DELETE FROM servicos
      WHERE id = $1
        AND barbearia_id = $2
    `,
    [id, currentBarbershop]
  );

  return res.json({ ok: true });
}));

export default router;
