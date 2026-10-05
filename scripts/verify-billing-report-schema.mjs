// Billing/report cronlarının ihtiyaç duyduğu production şemasını değiştirmeden doğrular.
// Kullanım: MIGRATE_DATABASE_URL=<owner bağlantısı> npm run db:verify:billing-report
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL gerekli");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const [objects] = await sql.unsafe(`
  select
    to_regclass('public.billing_invoices') as billing_invoices,
    to_regclass('public.billing_invoice_counters') as billing_invoice_counters,
    to_regclass('public.report_settings') as report_settings,
    to_regprocedure('public.report_due_tenants(text,timestamptz)') as report_due_tenants
`);
await sql.end();

const checks = [
  ["billing_invoices tablosu", objects?.billing_invoices],
  ["billing_invoice_counters tablosu", objects?.billing_invoice_counters],
  ["report_settings tablosu", objects?.report_settings],
  ["report_due_tenants(text,timestamptz) fonksiyonu", objects?.report_due_tenants],
];

for (const [label, value] of checks) console.log(`${value ? "OK " : "MISS "}${label}`);
const missing = checks.filter(([, value]) => !value);
if (missing.length) {
  console.error(`Billing/report schema doğrulaması başarısız: ${missing.length} eksik nesne.`);
  process.exitCode = 1;
} else {
  console.log(`Billing/report schema doğrulaması başarılı: ${checks.length} kontrol.`);
}
