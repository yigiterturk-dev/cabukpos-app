// lib/agent/registry.ts — Ajan kaydı (bulut): eşleme, jetonla kimlik, heartbeat, kasaya inen ajan bilgisi.
// agents RLS dışı → her sorguda tenantId/kimlik koşulu.
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { newDeviceToken, sha256 } from "@/lib/auth/tokens";
import { agentConfig, emptyAgentConfig, type AgentConfig, type Heartbeat, type KasaAgent } from "./config";
import { openHubKey, sealHubKey } from "./crypto";
import { agentHost } from "./dns";
import { signTicket, TICKET_TTL_S } from "./ticket";

const a = schema.agents;
export type AgentRow = typeof schema.agents.$inferSelect;

/** Tek kullanımlık, süreli kod → ajan jetonu + hubKey (yalnız bu yanıtta açık). */
export async function pairAgent(code: string): Promise<{ agentId: string; tenantId: string; token: string; hubKey: string } | null> {
  if (!/^[A-Z0-9]{8}$/.test(code)) return null;
  const token = newDeviceToken();
  const hubKey = newDeviceToken();
  const [row] = await getDb().update(a)
    .set({ tokenHash: await sha256(token), hubKeyEnc: await sealHubKey(hubKey), pairingCode: null, pairingExpiresAt: null, pairedAt: sql`now()`, revokedAt: null })
    .where(and(eq(a.pairingCode, code), gt(a.pairingExpiresAt, sql`now()`)))
    .returning({ id: a.id, tenantId: a.tenantId });
  return row ? { agentId: row.id, tenantId: row.tenantId, token, hubKey } : null;
}

export async function agentFromRequest(req: Request): Promise<AgentRow | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 100) return null;
  const [row] = await getDb().select().from(a).where(and(eq(a.tokenHash, await sha256(token)), isNull(a.revokedAt)));
  return row ?? null;
}

export async function recordHeartbeat(agent: AgentRow, hb: Heartbeat): Promise<{ config: AgentConfig; revoked: string[] }> {
  await getDb().update(a).set({
    lanIp: hb.lanIp, port: hb.port, httpsPort: hb.httpsPort, version: hb.version,
    certExpiresAt: hb.certExpiresAt ? new Date(hb.certExpiresAt) : null,
    status: { printers: hb.printers, failed: hb.failed, scale: hb.scale }, lastSeenAt: sql`now()`,
  }).where(eq(a.id, agent.id));
  const d = schema.devices;
  const revoked = await getDb().select({ id: d.id }).from(d).where(and(eq(d.tenantId, agent.tenantId), isNotNull(d.revokedAt)));
  const parsed = agentConfig.safeParse(agent.config);
  return { config: parsed.success ? parsed.data : emptyAgentConfig(), revoked: revoked.map((r) => r.id).sort() };
}

/** Cihazın şubesindeki eşli ajan → kasa bilgisi (URL + imzalı bilet). Ajan hiç görülmediyse de döner (kasa dener). */
export async function kasaAgentFor(device: { id: string; tenantId: string; storeId: string }): Promise<KasaAgent | null> {
  const [row] = await getDb().select().from(a)
    .where(and(eq(a.tenantId, device.tenantId), eq(a.storeId, device.storeId), isNotNull(a.pairedAt), isNull(a.revokedAt), isNotNull(a.hubKeyEnc)))
    .orderBy(desc(a.lastSeenAt)).limit(1);
  if (!row) return null;
  const c = agentConfig.safeParse(row.config);
  const cfg = c.success ? c.data : emptyAgentConfig();
  const tls = row.httpsPort && row.certExpiresAt && row.certExpiresAt.getTime() > Date.now();
  const url = tls ? `https://${agentHost(row.id)}:${row.httpsPort}` : `http://127.0.0.1:${row.port ?? 17654}`;
  const ticket = await signTicket(await openHubKey(row.hubKeyEnc!), { d: device.id, t: device.tenantId, exp: Math.floor(Date.now() / 1000) + TICKET_TTL_S });
  return {
    url, ticket, autoPrint: cfg.autoPrint,
    drawer: cfg.printers.some((p) => p.drawer),
    scale: cfg.scale.kind !== "yok",
    printers: cfg.printers.map((p) => ({ id: p.id, role: p.role, width: p.width, codepage: p.codepage })),
  };
}
