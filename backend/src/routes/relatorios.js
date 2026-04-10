import express from "express";
import { requireOperationalUser } from "../middleware/auth.js";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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

export default router;
