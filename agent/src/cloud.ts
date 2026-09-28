// agent/src/cloud.ts — Ajan ↔ bulut: eşleme, heartbeat, DNS kaydı (sertifika için).
import type { AgentConfig, Heartbeat } from "@/lib/agent/config";

async function call<T>(url: string, init: RequestInit & { token?: string }): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) }, signal: AbortSignal.timeout(15000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${r.status}`), { status: r.status });
  return body as T;
}

export const pair = (cloudUrl: string, code: string) =>
  call<{ agentId: string; tenantId: string; token: string; hubKey: string }>(`${cloudUrl}/api/agent/pair`, { method: "POST", body: JSON.stringify({ code }) });

export const heartbeat = (cloudUrl: string, token: string, hb: Heartbeat) =>
  call<{ config: AgentConfig; revoked: string[] }>(`${cloudUrl}/api/agent/heartbeat`, { method: "POST", token, body: JSON.stringify(hb) });

export const setDns = (cloudUrl: string, token: string, rec: { type: "A" | "TXT"; value: string | null }) =>
  call<{ name: string }>(`${cloudUrl}/api/agent/dns`, { method: "POST", token, body: JSON.stringify(rec) });
