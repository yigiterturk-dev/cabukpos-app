// lib/agent/dns.ts — Ajan sertifikası için DNS kayıtları. Ad yalnız ajan kimliğinden türetilir (başka ada yazılamaz).
import { LAN_DOMAIN } from "./config";

export const agentHost = (agentId: string) => `${agentId.replace(/-/g, "").slice(0, 16)}.${LAN_DOMAIN}`;
export const challengeHost = (agentId: string) => `_acme-challenge.${agentHost(agentId)}`;

export interface DnsProvider {
  /** value null → kaydı sil. */
  set(type: "A" | "TXT", name: string, value: string | null): Promise<void>;
}

/** Cloudflare: CF_API_TOKEN (Zone.DNS edit) + CF_ZONE_ID (cabukpos.com). */
export function cloudflare(token: string, zone: string, fetchFn: typeof fetch = fetch): DnsProvider {
  const api = (path: string, init?: RequestInit) =>
    fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone}/dns_records${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }).then(async (r) => {
      const j = (await r.json()) as { success: boolean; result: { id: string }[] | { id: string }; errors?: { message: string }[] };
      if (!j.success) throw new Error(`Cloudflare: ${j.errors?.map((e) => e.message).join(", ") ?? r.status}`);
      return j.result;
    });
  return {
    async set(type, name, value) {
      const existing = (await api(`?type=${type}&name=${encodeURIComponent(name)}`)) as { id: string }[];
      for (const r of existing) await api(`/${r.id}`, { method: "DELETE" });
      if (value !== null) await api("", { method: "POST", body: JSON.stringify({ type, name, content: value, ttl: 60, proxied: false }) });
    },
  };
}

export function dnsProvider(): DnsProvider | null {
  const t = process.env.CF_API_TOKEN, z = process.env.CF_ZONE_ID;
  return t && z ? cloudflare(t, z) : null;
}
