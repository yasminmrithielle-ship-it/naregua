import { query } from "../db.js";

export const DEFAULT_SAAS_PLAN = {
  nome: "Plano",
  preco: 89.9,
  limiteAgendamentos: null,
  limiteChatbots: 1,
  ativo: true
};

function getExecutor(executor) {
  if (executor?.query) {
    return executor;
  }

  return { query };
}

export async function ensureDefaultSaasPlans(executor) {
  const db = getExecutor(executor);
  const plan = DEFAULT_SAAS_PLAN;

  const result = await db.query(
    `
      INSERT INTO planos_saas (
        nome,
        preco,
        limite_agendamentos,
        limite_chatbots,
        ativo
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (nome) DO UPDATE
      SET
        preco = EXCLUDED.preco,
        limite_agendamentos = EXCLUDED.limite_agendamentos,
        limite_chatbots = EXCLUDED.limite_chatbots,
        ativo = EXCLUDED.ativo,
        atualizado_em = NOW()
      RETURNING id
    `,
    [
      plan.nome,
      plan.preco,
      plan.limiteAgendamentos,
      plan.limiteChatbots,
      plan.ativo
    ]
  );

  const defaultPlanId = result.rows[0]?.id;

  await db.query(
    `
      UPDATE planos_saas
      SET ativo = false,
          atualizado_em = NOW()
      WHERE nome != $1
    `,
    [plan.nome]
  );

  if (defaultPlanId) {
    await db.query(
      `
        UPDATE assinaturas_saas
        SET plano_id = $1,
            atualizado_em = NOW()
        WHERE plano_id != $1
      `,
      [defaultPlanId]
    );
  }
}

export async function getDefaultSaasPlan(executor) {
  const db = getExecutor(executor);
  const result = await db.query(
    `
      SELECT *
      FROM planos_saas
      WHERE ativo = true
      ORDER BY criado_em ASC
      LIMIT 1
    `
  );
  return result.rows[0] || null;
}

export async function createInitialTrialSubscription(executor, barbeariaId, trialDays = 14) {
  const db = getExecutor(executor);
  await ensureDefaultSaasPlans(db);
  const defaultPlan = await getDefaultSaasPlan(db);

  if (!defaultPlan) {
    throw new Error("Nenhum plano SaaS ativo foi encontrado.");
  }

  const result = await db.query(
    `
      INSERT INTO assinaturas_saas (
        barbearia_id,
        plano_id,
        status,
        inicio_trial,
        fim_trial,
        vencimento
      )
      VALUES (
        $1,
        $2,
        'active',
        CURRENT_DATE,
        NULL,
        CURRENT_DATE + make_interval(days => $3)
      )
      ON CONFLICT (barbearia_id) DO NOTHING
      RETURNING *
    `,
    [barbeariaId, defaultPlan.id, Number(trialDays)]
  );

  return result.rows[0] || null;
}

export async function ensureSaasSubscriptionsForActiveBarbershops(executor) {
  const db = getExecutor(executor);
  await ensureDefaultSaasPlans(db);
  const defaultPlan = await getDefaultSaasPlan(db);

  if (!defaultPlan) {
    throw new Error("Nenhum plano ativo foi encontrado.");
  }

  await db.query(
    `
      UPDATE barbearias
      SET
        subscription_plan = 'plano',
        plano = 'Plano',
        updated_at = NOW(),
        atualizado_em = NOW()
      WHERE status IN ('ativo', 'teste', 'active')
    `
  );

  await db.query(
    `
      INSERT INTO assinaturas_saas (
        barbearia_id,
        plano_id,
        status,
        inicio_trial,
        fim_trial,
        vencimento
      )
      SELECT
        b.id,
        $1,
        'active',
        CURRENT_DATE,
        NULL,
        CURRENT_DATE + INTERVAL '1 month'
      FROM barbearias b
      WHERE b.status IN ('ativo', 'teste', 'active')
        AND NOT EXISTS (
          SELECT 1
          FROM assinaturas_saas a
          WHERE a.barbearia_id = b.id
        )
    `,
    [defaultPlan.id]
  );

  await db.query(
    `
      UPDATE assinaturas_saas a
      SET
        plano_id = $1,
        status = 'active',
        fim_trial = NULL,
        vencimento = CASE
          WHEN a.vencimento IS NULL OR a.vencimento < CURRENT_DATE
            THEN CURRENT_DATE + INTERVAL '1 month'
          ELSE a.vencimento
        END,
        atualizado_em = NOW()
      FROM barbearias b
      WHERE b.id = a.barbearia_id
        AND b.status IN ('ativo', 'teste', 'active')
        AND a.status NOT IN ('canceled', 'cancelado', 'past_due', 'bloqueado')
    `,
    [defaultPlan.id]
  );
}

export async function getCurrentSaasSubscription(barbeariaId) {
  const result = await query(
    `
      SELECT
        a.*,
        p.nome AS plano_nome,
        p.preco AS plano_preco,
        p.limite_agendamentos,
        p.limite_chatbots
      FROM assinaturas_saas a
      INNER JOIN planos_saas p
        ON p.id = a.plano_id
      WHERE a.barbearia_id = $1
      ORDER BY a.criado_em DESC
      LIMIT 1
    `,
    [barbeariaId]
  );

  return result.rows[0] || null;
}

function isSubscriptionBlocked(subscription) {
  if (!subscription) {
    return true;
  }

  if (["canceled", "cancelado", "past_due", "bloqueado"].includes(subscription.status)) {
    return true;
  }

  if (
    subscription.status === "trial" &&
    subscription.fim_trial &&
    String(subscription.fim_trial).slice(0, 10) < new Date().toISOString().slice(0, 10)
  ) {
    return true;
  }

  return false;
}

async function countMonthlyAppointments(barbeariaId) {
  const result = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM agendamentos
      WHERE barbearia_id = $1
        AND date_trunc('month', data) = date_trunc('month', CURRENT_DATE)
        AND status != 'cancelado'
    `,
    [barbeariaId]
  );

  return Number(result.rows[0]?.total || 0);
}

export async function assertFeatureAccess(barbeariaId, feature) {
  const subscription = await getCurrentSaasSubscription(barbeariaId);

  if (isSubscriptionBlocked(subscription)) {
    throw new Error(
      "A assinatura desta barbearia nao permite usar este recurso no momento."
    );
  }

  if (feature === "chatbot" && Number(subscription.limite_chatbots || 0) < 1) {
    throw new Error("O plano atual nao inclui chatbot WhatsApp.");
  }

  if (feature === "appointments") {
    const usage = await countMonthlyAppointments(barbeariaId);

    if (
      subscription.limite_agendamentos &&
      usage >= Number(subscription.limite_agendamentos)
    ) {
      throw new Error(
        "O limite mensal de agendamentos do plano atual foi atingido. Regularize a assinatura para continuar."
      );
    }
  }

  return subscription;
}
