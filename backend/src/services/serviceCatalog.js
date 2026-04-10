import { query } from "../db.js";
import {
  DEFAULT_BARBERSHOP_ID,
  DEFAULT_BARBERSHOP_NAME
} from "../config.js";

const DEFAULT_SERVICES = [
  { nome: "Corte", duracao: 60, preco: 35 },
  { nome: "Barba", duracao: 45, preco: 25 },
  { nome: "Corte + Barba", duracao: 90, preco: 55 },
  { nome: "Pintura", duracao: 60, preco: 40 },
  { nome: "Sobrancelha", duracao: 30, preco: 15 }
];

function getExecutor(executor) {
  if (executor?.query) {
    return executor;
  }

  return { query };
}

export async function ensureDefaultServices(
  barbeariaId = DEFAULT_BARBERSHOP_ID,
  executor
) {
  const db = getExecutor(executor);

  await db.query(
    `
      INSERT INTO barbearias (id, nome, slug, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [barbeariaId, DEFAULT_BARBERSHOP_NAME, barbeariaId]
  );

  const existing = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM servicos
      WHERE barbearia_id = $1
    `,
    [barbeariaId]
  );

  if (existing.rows[0]?.total > 0) {
    return;
  }

  for (const service of DEFAULT_SERVICES) {
    await db.query(
      `
        INSERT INTO servicos (barbearia_id, nome, duracao, preco, ativo)
        VALUES ($1, $2, $3, $4, true)
      `,
      [barbeariaId, service.nome, service.duracao, service.preco]
    );
  }
}

export function getDefaultServices() {
  return DEFAULT_SERVICES;
}
