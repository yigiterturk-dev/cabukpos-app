#!/usr/bin/env node
// Yedeği izole staging veritabanına gerçekten geri yükler ve taban tablo
// duman testini çalıştırır; canlıya hiç dokunmaz. Checklist kalemi:
// "İzole staging veritabanına gerçek restore yapıldı".
// Kullanım: npm run db:restore:rehearsal -- --file=backups/cabukpos-....dump
//   (--file verilmezse BACKUP_DIR altındaki en yeni .dump seçilir)
import { readdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, extname } from "node:path";
import { spawn } from "node:child_process";

const target = process.env.REHEARSAL_DATABASE_URL;
if (!target) throw new Error("REHEARSAL_DATABASE_URL gerekli (izole staging DB); uygulama/canlı URL'ini kullanmayın.");
for (const forbidden of ["MIGRATE_DATABASE_URL", "DATABASE_URL"]) {
  const live = process.env[forbidden];
  if (live && live === target) throw new Error(`REHEARSAL_DATABASE_URL ${forbidden} ile aynı olamaz; canlıya restore riski.`);
}

const arg = process.argv.slice(2).find((x) => x.startsWith("--file="));
let file = arg?.slice("--file=".length);
if (!file) {
  const dir = resolve(process.env.BACKUP_DIR || "./backups");
  const dumps = (await readdir(dir)).filter((f) => extname(f) === ".dump").map((f) => join(dir, f));
  if (dumps.length === 0) throw new Error(`${dir} altında .dump yok; önce npm run db:backup çalıştırın veya --file= verin.`);
  file = (await Promise.all(dumps.map(async (f) => [f, (await stat(f)).mtimeMs]))).sort((a, b) => b[1] - a[1])[0][0];
}
await access(file, constants.R_OK);

const run = (cmd, args, opts = {}) =>
  new Promise((resolveExit, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", opts.capture ? "pipe" : "inherit", "inherit"], env: process.env });
    let out = "";
    if (opts.capture) child.stdout.on("data", (c) => { out += c; });
    child.once("error", reject);
    child.once("exit", (status, signal) => resolveExit({ code: status ?? (signal ? 1 : 0), out }));
  });

// --clean --if-exists mevcut veritabanını bekler; hedef yoksa pg_restore
// "database does not exist" ile düşer. Önce yönetim DB'sinden hedefi oluştur.
{
  const u = new URL(target);
  const name = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const created = await run("psql", ["--dbname", admin.toString(), "--quiet", "--command",
    `create database "${name.replaceAll('"', '""')}"`]);
  // Zaten varsa psql hata döner; --clean --if-exists onu temizler.
  if (created.code !== 0) {
    const probe = await run("psql", ["--dbname", target, "--quiet", "--command", "select 1"], { capture: true });
    if (probe.code !== 0) throw new Error(`Hedef veritabanı yok ve bağlantı rolünün CREATEDB yetkisi olmayabilir. Yönetici olarak "createdb ${name}" çalıştırıp tekrar deneyin.`);
  }
}

// Do not allow pg_restore to continue past a failed object and report a false
// positive based only on the later tenants smoke query.
// --no-owner + --no-acl: yedekteki ACL/ownership ifadelerini atla (bunlar zaten
// db:rls ile kurulur; farklı ortama taşınamaz) — veri ve şema tam yüklenir.
const restore = await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", "--dbname", target, file]);
if (restore.code !== 0) throw new Error(`pg_restore başarısız (kod ${restore.code}).`);

const smoke = await run("psql", ["--dbname", target, "--tuples-only", "--no-align", "--command",
  "select case when (select count(*) from tenants) > 0 and to_regclass('public.billing_invoices') is not null and to_regprocedure('public.report_due_tenants(text,timestamp with time zone)') is not null then 'OK' else 'INCOMPLETE' end;"], { capture: true });
if (smoke.code !== 0) throw new Error("Restore sonrası sorgu çalışmadı.");
if (smoke.out.trim() !== "OK") throw new Error("Restore edilen veritabanı eksik: tenants dolu, billing_invoices ve report_due_tenants hazır olmalı.");

console.log(`Restore provası tamam: ${file} -> izole DB'ye yüklendi, tenants dolu.`);
