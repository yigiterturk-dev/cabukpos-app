import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL gerekli");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const checks = [];
const columns = await sql.unsafe("select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'growth_campaign_events' and column_name = 'recipient_ref') or (table_name = 'growth_campaigns' and column_name in ('approved_at', 'approved_by')))");
for (const required of [
  ["growth_campaign_events", "recipient_ref"],
  ["growth_campaigns", "approved_at"],
  ["growth_campaigns", "approved_by"],
]) checks.push({ ok: columns.some((column) => column.table_name === required[0] && column.column_name === required[1]), label: required[0] + "." + required[1] });

const tables = await sql.unsafe("select c.relname, c.relrowsecurity, c.relforcerowsecurity, exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'tenant_isolation') as has_tenant_policy from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('growth_campaigns', 'growth_campaign_events', 'growth_recipient_refs') order by c.relname");
for (const table of tables) checks.push({
  ok: table.relrowsecurity && table.relforcerowsecurity && table.has_tenant_policy,
  label: table.relname + " RLS + tenant_isolation",
});

const [role] = await sql.unsafe("select rolbypassrls from pg_roles where rolname = 'cabukpos_app'");
checks.push({ ok: role?.rolbypassrls === false, label: "cabukpos_app BYPASSRLS kapalı" });
await sql.end();

for (const check of checks) console.log((check.ok ? "OK " : "MISS ") + check.label);
const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error("Growth schema doğrulaması başarısız: " + failed.length + " kontrol.");
  process.exitCode = 1;
} else {
  console.log("Growth schema doğrulaması başarılı: " + checks.length + " kontrol.");
}
