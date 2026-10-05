// tests/rls-coverage.test.ts — #55: hangi tablonun RLS'li olduğunu ve hangisinin
// bilinçli olarak RLS'siz kaldığını kaynak dosyalardan doğrular. Yeni bir kiracı
// tablosu RLS'siz eklenirse (ve izin listesine yazılmazsa) bu test kırılır.
//
// RLS'siz kimlik/arama tabloları mimari gereğidir: kiracı bilinmeden jetonla aranır
// (devices/agents/sessions/integration_keys/platform_connections) ya da abonelik
// hattının ortak sayaçlarıdır. Tenant kapsamı uygulama katmanında zorunludur.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../db/rls.sql", import.meta.url), "utf8");

/** tenant_id = tenantRef() taşıyan tablolar. */
function tenantTables(): string[] {
  const names = [...schema.matchAll(/pgTable\("([a-z_]+)"/g)].map((m) => m[1]);
  return names.filter((name, i) => {
    const start = schema.indexOf(`pgTable("${name}"`);
    const next = names[i + 1];
    const end = next ? schema.indexOf(`pgTable("${next}"`) : schema.length;
    return /tenantId:\s*tenantRef\(\)/.test(schema.slice(start, end));
  });
}

/** rls.sql'de adı geçen (dolayısıyla RLS uygulanan) tablolar. */
function rlsCovered(): Set<string> {
  const found = new Set<string>();
  // Yalnızca gerçekten foreach array[...] içinde ilan edilen tabloları oku;
  // tüm SQL string'lerini taramak yorumlar ve fonksiyon gövdeleri yüzünden
  // yanlış bir "RLS kapsamı" kanıtı üretebilir.
  for (const block of rls.matchAll(/foreach\s+t\s+in\s+array\s+array\[([^\]]+)\]/gi)) {
    for (const m of block[1].matchAll(/'([a-z_]+)'/g)) found.add(m[1]);
  }
  // Array listelerine alınmayan tekil alter table kapılarını da say.
  for (const m of rls.matchAll(/alter table ([a-z_]+) enable row level security/gi)) found.add(m[1].toLowerCase());
  return found;
}

// Bilinçli istisnalar — her biri neden RLS'siz olduğunu ve kapsamın nerede
// uygulandığını açıklar. Buraya yeni satır eklemek kasıtlı bir karardır.
const ALLOWLIST: Record<string, string> = {
  users: "kimlik: e-posta/oturum ile kiracıdan önce aranır (lib/auth)",
  devices: "kimlik: cz_device jetonu kiracıdan önce aranır (lib/auth/kasa, /api/sync/catalog)",
  agents: "kimlik: ajan jetonu kiracıdan önce aranır (/api/agent/pair|heartbeat)",
  sessions: "kimlik: oturum hash'i kiracıdan önce aranır (lib/auth/session)",
  platform_connections: "kimlik: webhook jetonu kiracıdan önce aranır (lib/platform)",
  integration_keys: "kimlik: ajans anahtarı kiracıdan önce aranır (lib/integrations/keys)",
  billing_payments: "abonelik: kiracı yönetim akışında kapsanır (lib/billing)",
  billing_invoices: "abonelik: /fatura/<token> definer sorgusuyla okunur (lib/billing/invoice)",
};

test("#55: kiracı tabloları ya RLS'li ya bilinçli izin listesinde", () => {
  const schemaNames = new Set(tenantTables());
  const covered = rlsCovered();
  const unprotected = tenantTables().filter((t) => !covered.has(t));
  const unknownAllowlistEntries = Object.keys(ALLOWLIST).filter((t) => !schemaNames.has(t));
  assert.deepEqual(unknownAllowlistEntries, [], `İzin listesinde şemada olmayan tablolar: ${unknownAllowlistEntries.join(", ")}`);
  const unexpected = unprotected.filter((t) => !(t in ALLOWLIST));
  assert.deepEqual(unexpected, [], `RLS'siz ve izin listesinde olmayan tablolar: ${unexpected.join(", ")}`);
  const stale = Object.keys(ALLOWLIST).filter((t) => !unprotected.includes(t));
  assert.deepEqual(stale, [], `İzin listesinde olup artık RLS'li tablolar (listeyi güncelle): ${stale.join(", ")}`);
});

test("#55: audit_log yalnız eklenebilir (append-only DB koruması)", () => {
  assert.match(rls, /revoke update, delete, truncate on audit_log from cabukpos_app/i);
  assert.match(rls, /grant select, insert on audit_log to cabukpos_app/i);
});
