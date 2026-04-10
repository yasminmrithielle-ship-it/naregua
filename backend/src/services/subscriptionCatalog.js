import { query } from "../db.js";

function getExecutor(executor) {
  if (executor?.query) {
    return executor;
  }

  return { query };
}

export async function ensureDefaultPlans(barbeariaId, executor) {
  const db = getExecutor(executor);
  const existing = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM planos_assinatura
      WHERE barbearia_id = $1
    `,
    [barbeariaId]
  );

  if (existing.rows[0]?.total > 0) {
    await db.query(
      `
        UPDATE planos_assinatura
        SET nome = 'Assinatura Mensal',
            valor = 159.99,
            cortes_inclusos = 4,
            validade_dias = 30,
            ativo = true
        WHERE barbearia_id = $1
      `,
      [barbeariaId]
    );
    return;
  }

  await db.query(
    `
      INSERT INTO planos_assinatura
        (barbearia_id, nome, valor, cortes_inclusos, validade_dias, ativo)
      VALUES ($1, 'Assinatura Mensal', 159.99, 4, 30, true)
    `,
    [barbeariaId]
  );
}
