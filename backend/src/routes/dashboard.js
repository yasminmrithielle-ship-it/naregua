import express from "express";
import { requireOperationalUser } from "../middleware/auth.js";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getTenantChatbotStatus } from "../services/chatbotGateway.js";
import { getCurrentSaasSubscription } from "../services/saasService.js";

const router = express.Router();

router.get("/dashboard", requireOperationalUser, asyncHandler(async (req, res) => {
  const currentBarbershop = req.auth.membership.barbershopId;

  const [summaryResult, upcomingResult, newClientsResult, whatsappStatus, saasSubscription] =
    await Promise.all([
      query(
        `
          SELECT
            COUNT(*) FILTER (WHERE data = CURRENT_DATE) AS agendamentos_hoje,
            COUNT(*) FILTER (WHERE data = CURRENT_DATE AND status = 'confirmado') AS confirmados_hoje,
            COUNT(*) FILTER (WHERE data = CURRENT_DATE AND status = 'concluido') AS concluidos_hoje,
            COALESCE(SUM(s.preco) FILTER (WHERE a.data = CURRENT_DATE AND a.status != 'cancelado'), 0) AS faturamento_estimado
          FROM agendamentos a
          LEFT JOIN servicos s
            ON s.id = a.servico_id
          WHERE a.barbearia_id = $1
        `,
        [currentBarbershop]
      ),
      query(
        `
          SELECT id, cliente_nome, cliente_telefone, data, hora, servico_nome, status
          FROM agendamentos
          WHERE barbearia_id = $1
            AND status != 'cancelado'
            AND (data > CURRENT_DATE OR (data = CURRENT_DATE AND hora >= TO_CHAR(NOW(), 'HH24:MI')))
          ORDER BY data ASC, hora ASC
          LIMIT 5
        `,
        [currentBarbershop]
      ),
      query(
        `
          SELECT COUNT(*)::int AS total
          FROM clientes
          WHERE barbearia_id = $1
            AND created_at >= date_trunc('month', CURRENT_DATE)
        `,
        [currentBarbershop]
      ),
      getTenantChatbotStatus(currentBarbershop).catch(() => null),
      getCurrentSaasSubscription(currentBarbershop)
    ]);

  return res.json({
    resumo: summaryResult.rows[0] || {},
    proximos_horarios: upcomingResult.rows,
    clientes_novos_mes: newClientsResult.rows[0]?.total || 0,
    whatsapp_status: whatsappStatus,
    assinatura_saas: saasSubscription
  });
}));

export default router;
