// agent/src/state.ts — Ajanın yerel dosyası (eşleme bilgisi + son yapılandırma; internetsiz açılış için).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentConfig, AGENT_PORT, type AgentConfig } from "@/lib/agent/config";

export type AgentState = {
  cloudUrl: string;
  agentId: string;
  tenantId: string;
  token: string; // ajan → bulut
  hubKey: string; // kasa biletlerini doğrular
  port: number;
  config: AgentConfig | null;
  revoked: string[]; // iptal edilmiş cihazlar
};

export function defaultDir() {
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? os.homedir(), "cabukpos");
  return path.join(os.homedir(), ".config", "cabukpos");
}

export function loadState(dir: string): AgentState | null {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dir, "cabukpos-agent.json"), "utf8")) as AgentState;
    const c = s.config ? agentConfig.safeParse(s.config) : null;
    return { ...s, port: s.port ?? AGENT_PORT, config: c?.success ? c.data : null, revoked: s.revoked ?? [] };
  } catch {
    return null;
  }
}

export function saveState(dir: string, s: AgentState) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "cabukpos-agent.json");
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.renameSync(`${f}.tmp`, f);
}

/** Yerel ağ IPv4'ü (özel aralıklar önce). */
export function lanIp(): string | null {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);
  return all.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) ?? all[0] ?? null;
}
