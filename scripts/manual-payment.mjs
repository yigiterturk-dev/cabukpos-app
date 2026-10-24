#!/usr/bin/env node
// Manuel tahsilat: havale/EFT sonrası aboneliği uzatır ve audit_log'a yazar.
// Kullanım:
//   npm run billing:manual -- --email=isletme@ornek.com --months=1 --dry-run
//   npm run billing:manual -- --email=isletme@ornek.com --months=12 --confirm --note="Havale 22.10"
// Yalnız operatör çalıştırır. MIGRATE_DATABASE_URL (owner) tercih edilir; yoksa DATABASE_URL.
import postgres from "postgres";

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const flag = (name) => args.includes(`--${name}`);
const email = arg("email")?.trim().toLowerCase();
const months = Number(arg("months"));
const note = arg("note")?.trim().slice(0, 200) || null;
const dryRun = flag("dry-run");
const confirmed = flag("confirm");

if (flag("help") || !email || !Number.isInteger(months) || months < 1 || months > 24) {
  console.error("Kullanım: npm run billing:manual -- --email=<e-posta> --months=<1-24> [--dry-run] [--confirm] [--note=\"...\"]");
  process.exit(1);
}

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL (tercih) ya da DATABASE_URL gerekli.");
  process.exit(1);
}
if (!dryRun && !confirmed) {
  console.error("Yazmak için --confirm ekleyin. Önce --dry-run ile kontrol edin.");
  process.exit(1);
}

function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [row] = await sql`
    select u.email, t.id as tenant_id, t.name, t.paid_until
    from users u join tenants t on t.id = u.tenant_id
    where lower(u.email) = ${email}
    limit 1`;
  if (!row) {
    console.error(`Kullanıcı bulunamadı: ${email}`);
    process.exit(1);
  }
  const now = new Date();
  const base = row.paid_until && new Date(row.paid_until) > now ? new Date(row.paid_until) : now;
  const until = addMonths(base, months);
  console.log(`İşletme: ${row.name} (${row.email})`);
  console.log(`Mevcut bitiş: ${row.paid_until ? new Date(row.paid_until).toISOString() : "—"}`);
  console.log(`Yeni bitiş:   ${until.toISOString()} (+${months} ay)`);
  if (dryRun) {
    console.log("DRY RUN: değişiklik yazılmadı.");
  } else {
    await sql.begin(async (tx) => {
      await tx`update tenants set paid_until = ${until}, billing_reminded_end = null where id = ${row.tenant_id}`;
      await tx`insert into audit_log (tenant_id, actor, action, detail) values (
        ${row.tenant_id}, 'system:manual-payment', 'billing.manual',
        ${tx.json({ email: row.email, months, previousPaidUntil: row.paid_until, paidUntil: until.toISOString(), note })}
      )`;
    });
    console.log("Abonelik uzatıldı ve audit_log'a yazıldı.");
  }
} finally {
  await sql.end();
}
