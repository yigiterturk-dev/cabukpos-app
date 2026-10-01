#!/usr/bin/env node
// Migration sahibi bağlantısıyla canlıya dokunmadan custom-format PostgreSQL yedeği alır.
// Kullanım: npm run db:backup [-- --output=/secure/path]
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL gerekli; uygulama DATABASE_URL'ini kullanmayın.");

const arg = process.argv.slice(2).find((x) => x.startsWith("--output="));
const target = arg?.slice("--output=".length) || process.env.BACKUP_DIR || "./backups";
const dir = resolve(target);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = resolve(dir, `cabukpos-${stamp}.dump`);
await mkdir(dirname(file), { recursive: true });

const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--file", file, url], { stdio: "inherit" });
const code = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (status, signal) => resolveExit(status ?? (signal ? 1 : 0)));
});
if (code !== 0) throw new Error(`pg_dump başarısız (kod ${code}).`);
// Restore rehearsal gate: pg_restore must be able to read the complete catalog.
// A full throwaway-database restore is scheduled separately in operations.
const rehearsal = spawn("pg_restore", ["--list", file], { stdio: ["ignore", "ignore", "inherit"] });
const rehearsalCode = await new Promise((resolveExit, reject) => {
  rehearsal.once("error", reject);
  rehearsal.once("exit", (status, signal) => resolveExit(status ?? (signal ? 1 : 0)));
});
if (rehearsalCode !== 0) throw new Error(`Yedek restore provası başarısız (kod ${rehearsalCode}).`);
console.log(`Yedek hazır: ${file}`);
