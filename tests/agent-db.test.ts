// tests/agent-db.test.ts — ajan kaydı (cabukpos_test, uygulama rolü): eşleme, jeton, heartbeat, kasa bileti, DNS.
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
const { getDb, withTenant, closeDb, schema } = await import("@/db");
const { pairAgent, agentFromRequest, recordHeartbeat, kasaAgentFor } = await import("@/lib/agent/registry");
const { verifyTicket } = await import("@/lib/agent/ticket");
const { emptyAgentConfig } = await import("@/lib/agent/config");
const { agentHost, challengeHost, cloudflare } = await import("@/lib/agent/dns");
const { eq, sql } = await import("drizzle-orm");

const tenants = await getDb().insert(schema.tenants).values([{ name: "AJAN-A", vertical: "market" }, { name: "AJAN-B", vertical: "market" }]).returning();
after(async () => {
  for (const t of tenants) await getDb().delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await closeDb();
});

async function setup(tenantId: string, code: string, expired = false) {
  const [st] = await withTenant(tenantId, (tx) => tx.insert(schema.stores).values({ tenantId, name: "Merkez" }).returning());
  const [ag] = await getDb().insert(schema.agents).values({ tenantId, storeId: st.id, name: "PC", config: emptyAgentConfig(), pairingCode: code, pairingExpiresAt: sql`now() + interval '${sql.raw(expired ? "-1" : "15")} minutes'` }).returning();
  const [dv] = await getDb().insert(schema.devices).values({ tenantId, storeId: st.id, name: "Kasa", receiptPrefix: "K1" }).returning();
  return { st, ag, dv };
}
const bearer = (t: string) => new Request("http://x", { headers: { authorization: `Bearer ${t}` } });

test("ajan: eşleme tek kullanımlık ve süreli; iptal edilen jeton geçmez", async () => {
  const [A] = tenants;
  const { ag } = await setup(A.id, "AAAA2222");
  assert.equal(await pairAgent("aaaa2222"), null); // büyük harf beklenir (rota büyütür)
  const r = await pairAgent("AAAA2222");
  assert.ok(r && r.agentId === ag.id && r.tenantId === A.id);
  assert.equal(await pairAgent("AAAA2222"), null);
  assert.equal((await agentFromRequest(bearer(r!.token)))?.id, ag.id);
  assert.equal(await agentFromRequest(bearer("yanlis")), null);
  await getDb().update(schema.agents).set({ revokedAt: sql`now()` }).where(eq(schema.agents.id, ag.id));
  assert.equal(await agentFromRequest(bearer(r!.token)), null);
});

test("ajan: süresi geçmiş kod; heartbeat yalnız kendi kiracısının iptallerini indirir; kasa bileti", async () => {
  const [, B] = tenants;
  const x = await setup(B.id, "BBBB3333", true);
  assert.equal(await pairAgent("BBBB3333"), null);
  await getDb().update(schema.agents).set({ pairingExpiresAt: sql`now() + interval '5 minutes'` }).where(eq(schema.agents.id, x.ag.id));
  const r = (await pairAgent("BBBB3333"))!;
  const agent = (await agentFromRequest(bearer(r.token)))!;
  // A kiracısında iptal edilmiş cihaz B'ye inmemeli
  const [aDev] = await getDb().select().from(schema.devices).where(eq(schema.devices.tenantId, tenants[0].id));
  await getDb().update(schema.devices).set({ revokedAt: sql`now()` }).where(eq(schema.devices.id, aDev.id));
  const cfg = { ...emptyAgentConfig(), printers: [{ id: "p1", name: "Fiş", role: "fis" as const, transport: "ag" as const, address: "10.0.0.5", width: 58 as const, codepage: "pc857" as const, brand: "genel" as const, drawer: true }] };
  await getDb().update(schema.agents).set({ config: cfg }).where(eq(schema.agents.id, agent.id));
  const hb = await recordHeartbeat({ ...agent, config: cfg }, { version: "0.4.0", lanIp: "192.168.1.20", port: 17654, httpsPort: null, certExpiresAt: null, printers: [{ id: "p1", ok: true, error: null }], failed: 0, scale: false });
  assert.deepEqual(hb.revoked, []);
  assert.equal(hb.config.printers[0].address, "10.0.0.5");
  await getDb().update(schema.devices).set({ revokedAt: sql`now()` }).where(eq(schema.devices.id, x.dv.id));
  assert.deepEqual((await recordHeartbeat(agent, { version: "0.4.0", lanIp: null, port: 17654, httpsPort: null, certExpiresAt: null, printers: [], failed: 0, scale: false })).revoked, [x.dv.id]);

  const k = (await kasaAgentFor({ id: x.dv.id, tenantId: B.id, storeId: x.st.id }))!;
  assert.equal(k.url, "http://127.0.0.1:17654");
  assert.equal(k.drawer, true);
  assert.deepEqual(k.printers, [{ id: "p1", role: "fis", width: 58, codepage: "pc857", brand: "genel" }]);
  const claims = await verifyTicket(r.hubKey, k.ticket);
  assert.equal(claims?.d, x.dv.id);
  assert.equal(claims?.t, B.id);
  // Sertifika bildirilince https LAN adı
  await getDb().update(schema.agents).set({ httpsPort: 17655, certExpiresAt: new Date(Date.now() + 86_400_000) }).where(eq(schema.agents.id, agent.id));
  assert.equal((await kasaAgentFor({ id: x.dv.id, tenantId: B.id, storeId: x.st.id }))!.url, `https://${agentHost(agent.id)}:17655`);
  // Başka kiracının cihazı bu ajanı görmez
  assert.equal(await kasaAgentFor({ id: x.dv.id, tenantId: tenants[0].id, storeId: x.st.id }), null);
});

test("dns: ad yalnız ajan kimliğinden; Cloudflare eski kaydı silip yenisini yazar", async () => {
  assert.equal(agentHost("0f8e2a6c-1b2d-4e5f-8a9b-0c1d2e3f4a5b"), "0f8e2a6c1b2d4e5f.lan.cabukpos.com");
  assert.equal(challengeHost("0f8e2a6c-1b2d-4e5f-8a9b-0c1d2e3f4a5b"), "_acme-challenge.0f8e2a6c1b2d4e5f.lan.cabukpos.com");
  const calls: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url.replace(/^.*dns_records/, "")}`);
    return new Response(JSON.stringify({ success: true, result: (init?.method ?? "GET") === "GET" ? [{ id: "old" }] : { id: "new" } }));
  }) as typeof fetch;
  await cloudflare("t", "z", fake).set("TXT", "_acme-challenge.x.lan.cabukpos.com", "abc");
  assert.deepEqual(calls, ["GET ?type=TXT&name=_acme-challenge.x.lan.cabukpos.com", "DELETE /old", "POST "]);
});
