import pg from "pg";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getDatabaseUrl } from "./config.js";

dotenv.config();

const { Pool } = pg;
const connectionString = getDatabaseUrl();
const requireSsl =
  process.env.DATABASE_SSL === "true" ||
  process.env.DATABASE_REQUIRE_SSL === "true" ||
  connectionString?.includes("supabase.co");

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 15000),
  ssl: requireSsl
    ? {
        rejectUnauthorized: false
      }
    : false
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "./sql/schema.sql");
let initialized = false;
let databaseReady = false;
let lastDatabaseError = null;

function normalizeDatabaseError(error) {
  if (!error) {
    return null;
  }

  const code = error.code || null;
  let recommendation = null;

  if (code === "28P01" || error.routine === "auth_failed") {
    recommendation =
      "Falha de autenticacao no Postgres. Revise a senha dentro de DATABASE_URL ou gere uma nova connection string no Supabase.";
  } else if (code === "EACCES" && connectionString?.includes(".supabase.co")) {
    recommendation =
      "O host direto do Supabase pode ter resolvido para IPv6 no ambiente local. Prefira a URI de Connection Pooling (pooler.supabase.com), que costuma funcionar melhor em Windows/IPv4.";
  } else if (code === "ECONNREFUSED") {
    recommendation =
      "Nao foi possivel alcancar o banco. Verifique host, porta e se o servico do Postgres esta acessivel.";
  } else if (code === "ENOTFOUND") {
    recommendation =
      "Host do banco nao encontrado. Confira se DATABASE_URL aponta para o projeto/host correto.";
  }

  return {
    message: error.message || "Erro desconhecido ao conectar no banco.",
    code,
    detail: error.detail || null,
    hint: error.hint || null,
    routine: error.routine || null,
    recommendation
  };
}

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export function getDatabaseStatus() {
  return {
    ready: databaseReady,
    initialized,
    hasConnectionString: Boolean(connectionString),
    ssl: Boolean(requireSsl),
    error: lastDatabaseError?.message || null,
    errorCode: lastDatabaseError?.code || null,
    recommendation: lastDatabaseError?.recommendation || null
  };
}

export async function initializeDatabase() {
  if (initialized) {
    return getDatabaseStatus();
  }

  if (!connectionString) {
    lastDatabaseError = normalizeDatabaseError(
      new Error("DATABASE_URL nao configurada")
    );
    throw new Error(lastDatabaseError.message);
  }

  const sql = await fs.readFile(schemaPath, "utf8");

  try {
    await pool.query("SELECT 1");
    await pool.query(sql);
    initialized = true;
    databaseReady = true;
    lastDatabaseError = null;
    return getDatabaseStatus();
  } catch (error) {
    databaseReady = false;
    lastDatabaseError = normalizeDatabaseError(error);
    throw error;
  }
}

export async function checkDatabaseConnection() {
  try {
    await pool.query("SELECT 1");
    databaseReady = true;
    lastDatabaseError = null;
  } catch (error) {
    databaseReady = false;
    lastDatabaseError = normalizeDatabaseError(error);
    throw error;
  }

  return getDatabaseStatus();
}
