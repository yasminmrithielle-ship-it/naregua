import express from "express";
import { requireOperationalUser } from "../middleware/auth.js";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireFeatureAccess } from "../middleware/subscriptionAccess.js";

const router = express.Router();

router.get("/relatorios/resumo", requireOperationalUser, asyncHandler(async (req, res) => {
  const { data } = req.query;
  const currentBarbershop = req.auth.membership.barbershopId;
  const result = await query(
    `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE a.status = 'confirmado') AS confirmados,
        COUNT(*) FILTER (WHERE a.status = 'cancelado') AS cancelados,
        COUNT(*) FILTER (WHERE a.status = 'concluido') AS concluidos,
        COALESCE(SUM(s.preco), 0) AS faturamento_estimado
      FROM agendamentos a
      LEFT JOIN servicos s
        ON s.nome = a.servico
       AND s.barbearia_id = a.barbearia_id
      WHERE ($1::date IS NULL OR a.data = $1::date)
        AND a.barbearia_id = $2
    `,
    [data || null, currentBarbershop]
  );

  return res.json(result.rows[0]);
}));

router.get(
  "/relatorios/advanced",
  requireOperationalUser,
  requireFeatureAccess("advanced_reports"),
  asyncHandler(async (req, res) => {
    const currentBarbershop = req.auth.membership.barbershopId;
    const result = await query(
      `
        SELECT
          COALESCE(servico_nome, servico) AS servico,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'concluido')::int AS concluidos,
          COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelados
        FROM agendamentos
        WHERE barbearia_id = $1
          AND date_trunc('month', data) = date_trunc('month', CURRENT_DATE)
        GROUP BY COALESCE(servico_nome, servico)
        ORDER BY total DESC, servico ASC
      `,
      [currentBarbershop]
    );

    return res.json({
      servicos: result.rows
    });
  })
);

export default router;
