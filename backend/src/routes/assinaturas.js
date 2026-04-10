import express from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import { requireAdmin, requireOperationalUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  buildNextDueDate,
  scheduleSubscriptionReminders
} from "../services/reminderScheduler.js";
import { ensureDefaultPlans } from "../services/subscriptionCatalog.js";

const router = express.Router();

const subscriberSchema = z.object({
  planoId: z.coerce.number().int().positive("Plano invalido"),
  nome: z.string().trim().min(2, "Nome do cliente e obrigatorio"),
  telefone: z.string().trim().min(8, "Telefone invalido"),
  dataAdesao: z.string().optional(),
  dataVencimento: z.string().optional(),
  statusPagamento: z.enum(["pago", "pendente", "atrasado", "cancelado"]).optional(),
  observacoes: z.string().optional()
});

const paymentSchema = z.object({
  competencia: z.string().trim().min(4, "Competencia obrigatoria"),
  valor: z.coerce.number().positive("Valor invalido").optional(),
  dataPagamento: z.string().optional(),
  metodo: z.string().trim().optional(),
  status: z.enum(["pago", "pendente", "atrasado"]).optional(),
  proximoVencimento: z.string().optional()
});

const usageSchema = z.object({
  descricao: z.string().trim().min(2, "Descricao obrigatoria").optional(),
  quantidade: z.coerce.number().int().positive("Quantidade invalida").optional(),
  dataConsumo: z.string().optional()
});

function asExecutor(client) {
  return {
    query: (text, params) => client.query(text, params)
  };
}

async function getPlanById(planId, barbeariaId) {
  const result = await query(
    `
      SELECT *
      FROM planos_assinatura
      WHERE id = $1
        AND barbearia_id = $2
      LIMIT 1
    `,
    [planId, barbeariaId]
  );

  return result.rows[0] || null;
}

async function getSubscriberById(client, subscriberId, barbeariaId) {
  const result = await client.query(
    `
      SELECT c.*, p.nome AS plano_nome, p.valor AS plano_valor, p.cortes_inclusos, p.validade_dias
      FROM clientes_assinatura c
      INNER JOIN planos_assinatura p
        ON p.id = c.plano_id
      WHERE c.id = $1
        AND c.barbearia_id = $2
      LIMIT 1
    `,
    [subscriberId, barbeariaId]
  );

  return result.rows[0] || null;
}

router.get("/assinaturas/resumo", requireOperationalUser, asyncHandler(async (req, res) => {
  const currentBarbershop = req.auth.membership.barbershopId;
  await ensureDefaultPlans(currentBarbershop);

  const [summaryResult, expiringResult, paymentsResult] = await Promise.all([
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE c.ativo = true) AS total_ativos,
          COUNT(*) FILTER (WHERE c.ativo = true AND c.status_pagamento = 'pago') AS pagamentos_em_dia,
          COUNT(*) FILTER (WHERE c.ativo = true AND c.status_pagamento = 'pendente') AS pagamentos_pendentes,
          COUNT(*) FILTER (WHERE c.ativo = true AND c.status_pagamento = 'atrasado') AS pagamentos_atrasados,
          COUNT(*) FILTER (
            WHERE c.ativo = true
              AND c.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          ) AS vencendo_semana,
          COALESCE(SUM(CASE WHEN c.ativo = true THEN p.valor ELSE 0 END), 0) AS receita_recorrente,
          COALESCE((
            SELECT SUM(pg.valor)
            FROM pagamentos_assinatura pg
            WHERE pg.barbearia_id = $1
              AND pg.status = 'pago'
              AND date_trunc('month', pg.data_pagamento) = date_trunc('month', CURRENT_DATE)
          ), 0) AS pagamentos_mes,
          COALESCE((
            SELECT SUM(cs.quantidade)
            FROM consumos_assinatura cs
            WHERE cs.barbearia_id = $1
              AND date_trunc('month', cs.data_consumo) = date_trunc('month', CURRENT_DATE)
          ), 0) AS cortes_consumidos_mes
        FROM clientes_assinatura c
        INNER JOIN planos_assinatura p
          ON p.id = c.plano_id
        WHERE c.barbearia_id = $1
      `,
      [currentBarbershop]
    ),
    query(
      `
        SELECT
          c.id,
          c.nome,
          c.telefone,
          c.data_vencimento,
          c.status_pagamento,
          p.nome AS plano_nome
        FROM clientes_assinatura c
        INNER JOIN planos_assinatura p
          ON p.id = c.plano_id
        WHERE c.barbearia_id = $1
          AND c.ativo = true
        ORDER BY c.data_vencimento ASC
        LIMIT 5
      `,
      [currentBarbershop]
    ),
    query(
      `
        SELECT *
        FROM (
          SELECT
            CONCAT('assinatura-', pg.id) AS id,
            'assinatura' AS origem,
            c.nome AS cliente_nome,
            c.telefone AS cliente_telefone,
            pg.valor,
            pg.data_pagamento,
            pg.competencia AS descricao,
            NULL::text AS servico,
            pg.status,
            pg.metodo,
            pg.criado_em
          FROM pagamentos_assinatura pg
          INNER JOIN clientes_assinatura c
            ON c.id = pg.cliente_id
          WHERE pg.barbearia_id = $1

          UNION ALL

          SELECT
            CONCAT('atendimento-', pa.id) AS id,
            'atendimento' AS origem,
            pa.cliente_nome,
            pa.cliente_telefone,
            pa.valor,
            pa.data_pagamento,
            CONCAT('Atendimento finalizado em ', TO_CHAR(a.data, 'YYYY-MM-DD'), ' as ', a.hora) AS descricao,
            pa.servico,
            pa.status,
            pa.metodo,
            pa.criado_em
          FROM pagamentos_atendimento pa
          INNER JOIN agendamentos a
            ON a.id = pa.agendamento_id
          WHERE pa.barbearia_id = $1
        ) pagamentos
        ORDER BY data_pagamento DESC, criado_em DESC, id DESC
        LIMIT 5
      `,
      [currentBarbershop]
    )
  ]);

  return res.json({
    ...(summaryResult.rows[0] || {}),
    vencimentos_proximos: expiringResult.rows,
    ultimos_pagamentos: paymentsResult.rows
  });
}));

router.get("/assinaturas/planos", requireOperationalUser, asyncHandler(async (req, res) => {
  const currentBarbershop = req.auth.membership.barbershopId;
  await ensureDefaultPlans(currentBarbershop);

  const result = await query(
    `
      SELECT id, barbearia_id, nome, valor, cortes_inclusos, validade_dias, ativo
      FROM planos_assinatura
      WHERE barbearia_id = $1
      ORDER BY valor ASC, nome ASC
    `,
    [currentBarbershop]
  );

  return res.json(result.rows);
}));

router.get("/assinaturas/clientes", requireOperationalUser, asyncHandler(async (req, res) => {
  const currentBarbershop = req.auth.membership.barbershopId;
  const status = req.query.status;
  await ensureDefaultPlans(currentBarbershop);

  const result = await query(
    `
      SELECT
        c.id,
        c.nome,
        c.telefone,
        c.data_adesao,
        c.data_vencimento,
        c.status_pagamento,
        c.ativo,
        c.observacoes,
        p.id AS plano_id,
        p.nome AS plano_nome,
        p.valor AS plano_valor,
        p.cortes_inclusos,
        p.validade_dias,
        COALESCE((
          SELECT SUM(cs.quantidade)
          FROM consumos_assinatura cs
          WHERE cs.cliente_id = c.id
            AND date_trunc('month', cs.data_consumo) = date_trunc('month', CURRENT_DATE)
        ), 0) AS cortes_usados_mes,
        GREATEST(
          p.cortes_inclusos - COALESCE((
            SELECT SUM(cs.quantidade)
            FROM consumos_assinatura cs
            WHERE cs.cliente_id = c.id
              AND date_trunc('month', cs.data_consumo) = date_trunc('month', CURRENT_DATE)
          ), 0),
          0
        ) AS cortes_restantes
      FROM clientes_assinatura c
      INNER JOIN planos_assinatura p
        ON p.id = c.plano_id
      WHERE c.barbearia_id = $1
        AND ($2::text IS NULL OR c.status_pagamento = $2)
      ORDER BY c.data_vencimento ASC, c.nome ASC
    `,
    [currentBarbershop, status || null]
  );

  return res.json(result.rows);
}));

router.post("/assinaturas/clientes", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = subscriberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { planoId, nome, telefone, dataAdesao, dataVencimento, statusPagamento, observacoes } = parsed.data;
  const currentBarbershop = req.auth.membership.barbershopId;
  const plan = await getPlanById(planoId, currentBarbershop);

  if (!plan) {
    return res.status(404).json({ error: "Plano nao encontrado" });
  }

  const createdAt = dataAdesao || new Date().toISOString().slice(0, 10);
  const result = await query(
    `
      INSERT INTO clientes_assinatura
        (barbearia_id, plano_id, nome, telefone, data_adesao, data_vencimento, status_pagamento, ativo, observacoes)
      VALUES
        ($1, $2, $3, $4, $5::date, COALESCE($6::date, ($5::date + make_interval(days => $7))), $8, true, $9)
      RETURNING *
    `,
    [currentBarbershop, planoId, nome, telefone, createdAt, dataVencimento || null, plan.validade_dias, statusPagamento || "pendente", observacoes || null]
  );

  await scheduleSubscriptionReminders(
    { query },
    {
      ...result.rows[0],
      barbearia_id: currentBarbershop,
      plano_nome: plan.nome
    }
  );

  return res.status(201).json(result.rows[0]);
}));

router.post("/assinaturas/clientes/:id/pagamentos", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const subscriber = await getSubscriberById(
      client,
      id,
      req.auth.membership.barbershopId
    );

    if (!subscriber) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Assinante nao encontrado" });
    }

    const paymentDate = parsed.data.dataPagamento || new Date().toISOString().slice(0, 10);
    const paymentStatus = parsed.data.status || "pago";
    const amount = parsed.data.valor || subscriber.plano_valor;
    const nextDueDate = parsed.data.proximoVencimento || buildNextDueDate(paymentDate, subscriber.validade_dias);

    const paymentResult = await client.query(
      `
        INSERT INTO pagamentos_assinatura
          (cliente_id, barbearia_id, valor, competencia, data_pagamento, status, metodo)
        VALUES ($1, $2, $3, $4, $5::date, $6, $7)
        RETURNING *
      `,
      [id, subscriber.barbearia_id, amount, parsed.data.competencia, paymentDate, paymentStatus, parsed.data.metodo || "manual"]
    );

    await client.query(
      `
        UPDATE clientes_assinatura
        SET status_pagamento = $1,
            data_vencimento = $2::date
        WHERE id = $3
          AND barbearia_id = $4
      `,
      [
        paymentStatus === "pago" ? "pago" : paymentStatus,
        nextDueDate,
        id,
        req.auth.membership.barbershopId
      ]
    );

    await scheduleSubscriptionReminders(
      asExecutor(client),
      {
        ...subscriber,
        data_vencimento: nextDueDate
      }
    );

    await client.query("COMMIT");
    return res.status(201).json({
      pagamento: paymentResult.rows[0],
      proximo_vencimento: nextDueDate
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

router.post("/assinaturas/clientes/:id/consumos", requireAdmin, asyncHandler(async (req, res) => {
  const parsed = usageSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { id } = req.params;
  const client = await pool.connect();

  try {
    const subscriber = await getSubscriberById(
      client,
      id,
      req.auth.membership.barbershopId
    );

    if (!subscriber) {
      return res.status(404).json({ error: "Assinante nao encontrado" });
    }

    const result = await client.query(
      `
        INSERT INTO consumos_assinatura
          (cliente_id, barbearia_id, data_consumo, descricao, quantidade)
        VALUES ($1, $2, $3::date, $4, $5)
        RETURNING *
      `,
      [id, subscriber.barbearia_id, parsed.data.dataConsumo || new Date().toISOString().slice(0, 10), parsed.data.descricao || "Corte", parsed.data.quantidade || 1]
    );

    return res.status(201).json(result.rows[0]);
  } finally {
    client.release();
  }
}));

export default router;
