"use server";
// Yerel ajanlar: ekle (eşleme kodu), yeni kod (eski jeton düşer), iptal, yapılandırma. agents RLS dışı → tenantId koşulu.
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { newPairingCode } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { agentConfig, emptyAgentConfig } from "@/lib/agent/config";

export type AgentState = { error?: string; field?: string; code?: string; expiresAt?: string; agentName?: string; savedAt?: number };
const UUID = /^[0-9a-f-]{36}$/i;
const PAIR_MINUTES = 15;
const a = schema.agents;

async function assignCode(tenantId: string, agentId: string) {
  const expiresAt = new Date(Date.now() + PAIR_MINUTES * 60_000);
  for (let i = 0; i < 5; i++) {
    const code = newPairingCode();
    try {
      await getDb().update(a).set({ pairingCode: code, pairingExpiresAt: expiresAt, tokenHash: null, hubKeyEnc: null, pairedAt: null, revokedAt: null }).where(and(eq(a.id, agentId), eq(a.tenantId, tenantId)));
      return { code, expiresAt };
    } catch (e) {
      if (!String((e as Error & { cause?: Error }).cause?.message ?? e).includes("unique")) throw e;
    }
  }
  throw new Error("Eşleme kodu üretilemedi.");
}

export async function createAgent(_: AgentState, form: FormData): Promise<AgentState> {
  const u = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Ad 2-40 karakter.", field: "name" };
  const [store] = await withTenant(u.tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1));
  const [row] = await getDb().insert(a).values({ tenantId: u.tenantId, storeId: store.id, name, config: emptyAgentConfig() }).returning({ id: a.id });
  const c = await assignCode(u.tenantId, row.id);
  await withTenant(u.tenantId, (tx) => audit(tx, u.tenantId, `user:${u.id}`, "agent.create", { id: row.id, name }));
  revalidatePath("/yonetim/donanim");
  return { code: c.code, expiresAt: c.expiresAt.toISOString(), agentName: name };
}

export async function newAgentPairing(agentId: string): Promise<AgentState> {
  const u = await requireAdmin();
  if (!UUID.test(agentId)) return { error: "Ajan bulunamadı." };
  const [row] = await getDb().select({ name: a.name }).from(a).where(and(eq(a.id, agentId), eq(a.tenantId, u.tenantId)));
  if (!row) return { error: "Ajan bulunamadı." };
  const c = await assignCode(u.tenantId, agentId);
  await withTenant(u.tenantId, (tx) => audit(tx, u.tenantId, `user:${u.id}`, "agent.pair_code", { id: agentId }));
  revalidatePath("/yonetim/donanim");
  return { code: c.code, expiresAt: c.expiresAt.toISOString(), agentName: row.name };
}

export async function revokeAgent(agentId: string) {
  const u = await requireAdmin();
  if (!UUID.test(agentId)) return;
  await getDb().update(a).set({ revokedAt: sql`now()`, tokenHash: null, hubKeyEnc: null, pairingCode: null }).where(and(eq(a.id, agentId), eq(a.tenantId, u.tenantId)));
  await withTenant(u.tenantId, (tx) => audit(tx, u.tenantId, `user:${u.id}`, "agent.revoke", { id: agentId }));
  revalidatePath("/yonetim/donanim");
}

/** Yapılandırma formu JSON gönderir (dinamik yazıcı listesi). */
export async function saveAgentConfig(agentId: string, _: AgentState, form: FormData): Promise<AgentState> {
  const u = await requireAdmin();
  if (!UUID.test(agentId)) return { error: "Ajan bulunamadı." };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("config") ?? "")); } catch { return { error: "Yapılandırma okunamadı." }; }
  const c = agentConfig.safeParse(raw);
  if (!c.success) {
    const i = c.error.issues[0];
    return { error: `Geçersiz alan: ${i.path.join(".")} (${i.message})` };
  }
  const ids = c.data.printers.map((p) => p.id);
  if (new Set(ids).size !== ids.length) return { error: "Yazıcı kimlikleri tekil olmalı." };
  if (c.data.printers.filter((p) => p.drawer).length > 1) return { error: "Çekmece yalnız bir yazıcıya bağlanabilir." };
  const r = await getDb().update(a).set({ config: c.data }).where(and(eq(a.id, agentId), eq(a.tenantId, u.tenantId))).returning({ id: a.id });
  if (!r.length) return { error: "Ajan bulunamadı." };
  await withTenant(u.tenantId, (tx) => audit(tx, u.tenantId, `user:${u.id}`, "agent.config", { id: agentId, printers: ids.length, scale: c.data.scale.kind }));
  revalidatePath("/yonetim/donanim");
  return { savedAt: Date.now() };
}
