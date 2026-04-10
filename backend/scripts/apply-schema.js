import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../src/sql/schema.sql");

async function run() {
  const sql = await fs.readFile(schemaPath, "utf8");
  await pool.query(sql);
  console.log("Schema aplicado com sucesso.");
  await pool.end();
}

run().catch(async (error) => {
  console.error("Falha ao aplicar schema:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
