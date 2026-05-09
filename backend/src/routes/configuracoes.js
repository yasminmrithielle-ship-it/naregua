import express from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getCurrentSaasSubscription } from "../services/saasService.js";

const router = express.Router();

const settingsSchema = z.object({
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  slug: z.string().trim().min(2, "Slug obrigatorio"),
  telefone: z.string().trim().optional(),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  corPrimaria: z.string().trim().optional(),
  timezone: z.string().trim().min(2, "Timezone obrigatoria")
});

router.get("/configuracoes/barbearia", requireAuth, asyncHandler(async (req, res) => {
  const [barbershopResult, saasSubscription] = await Promise.all([
    query(
      `
        SELECT
          id,
          nome,
          slug,
          COALESCE(telefone, phone) AS telefone,
          logo_url,
          COALESCE(cor_primaria, primary_color) AS cor_primaria,
          timezone,
          COALESCE(plano, subscription_plan) AS plano,
          status,
          onboarding_completed_at
        FROM barbearias
        WHERE id = $1
        LIMIT 1
      `,
      [req.auth.membership.barbershopId]
    ),
    getCurrentSaasSubscription(req.auth.membership.barbershopId)
  ]);

  return res.json({
    barbearia: barbershopResult.rows[0] || null,
    assinaturaSaas: saasSubscription
  });
}));

router.put("/configuracoes/barbearia", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const result = await query(
    `
      UPDATE barbearias
      SET
        nome = $1,
        slug = $2,
        phone = $3,
        telefone = $3,
        logo_url = $4,
        primary_color = $5,
        cor_primaria = $5,
        timezone = $6,
        updated_at = NOW(),
        atualizado_em = NOW()
      WHERE id = $7
      RETURNING *
    `,
    [
      parsed.data.nome,
      parsed.data.slug,
      parsed.data.telefone || null,
      parsed.data.logoUrl || null,
      parsed.data.corPrimaria || "#D4A64A",
      parsed.data.timezone,
      req.auth.membership.barbershopId
    ]
  );

  return res.json(result.rows[0]);
}));

export default router;
