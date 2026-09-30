#!/usr/bin/env node
// Yedeği açmadan pg_restore katalog listesini okur; geri yükleme yapmaz.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

const arg = process.argv.slice(2).find((x) => x.startsWith("--file="));
const file = arg?.slice("--file=".length);
if (!file) throw new Error("Kullanım: npm run db:backup:verify -- --file=/secure/cabukpos/backup.dump");
await access(file, constants.R_OK);

const child = spawn("pg_restore", ["--list", file], { stdio: ["ignore", "pipe", "inherit"] });
let bytes = 0;
child.stdout.on("data", (chunk) => { bytes += chunk.length; });
const code = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (status, signal) => resolveExit(status ?? (signal ? 1 : 0)));
});
if (code !== 0) throw new Error(`Yedek doğrulanamadı (kod ${code}).`);
console.log(`Yedek kataloğu okunabildi: ${file} (${bytes} byte çıktı)`);
