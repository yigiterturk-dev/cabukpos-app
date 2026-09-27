// scripts/db-rls.mjs — db/rls.sql'i sahip rolle uygular.
import { readFileSync } from "node:fs";
import postgres from "postgres";
const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL gerekli");
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../db/rls.sql", import.meta.url), "utf8"));
await sql.end();
console.log("RLS uygulandı");
