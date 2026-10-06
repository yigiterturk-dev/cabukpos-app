// agent/src/server.ts — Kasanın konuştuğu yerel HTTP(S) API'si. Kimlik: bulutun imzaladığı bilet (Bearer).
// 127.0.0.1'de http (aynı PC'deki kasa; tarayıcılar localhost'u güvenli sayar); sertifika varsa LAN'da https.
import http from "node:http";
import https from "node:https";
import { verifyTicket } from "@/lib/agent/ticket";
import { DRAWER_PULSE, fromBase64 } from "@/lib/core/escpos";
import type { AgentConfig, PrinterConfig } from "@/lib/agent/config";
import { createQueue } from "./queue";
import { sendToPrinter } from "./printers";
import { readStable } from "./scale-io";
import type { ScaleReading } from "./scale";
import { createTabBuffer, MAX_BATCH, validEvent, type Entry } from "./tabs";

export const VERSION = "0.6.0";

export type Hub = {
  hubKey: string;
  tenantId: string;
  origin: string; // izinli kasa kökeni (bulut adresi)
  config: () => AgentConfig | null;
  revoked: () => string[];
  /** test için yazıcı/terazi değiştirilebilir */
  send?: (p: PrinterConfig, data: Uint8Array) => Promise<void>;
  scale?: (c: AgentConfig["scale"]) => Promise<ScaleReading>;
  /** LAN merkezi: adisyon olayı arabelleğinin dosyası (null → yalnız bellek) */
  tabsFile?: string | null;
  streamMs?: number;
};

type PrinterStatus = { ok: boolean | null; error: string | null };

export function createHub(h: Hub) {
  const tabs = createTabBuffer(h.tabsFile ?? null);
  const clients = new Set<http.ServerResponse>();
  setInterval(() => tabs.compact(), 3600_000).unref();
  const writeBatch = (res: http.ServerResponse, entries: Entry[]) => {
    if (entries.length) res.write(`id: ${entries.at(-1)!.lanSeq}\ndata: ${JSON.stringify(entries.map((e) => e.event))}\n\n`);
  };
  const status = new Map<string, PrinterStatus>();
  const send = h.send ?? sendToPrinter;
  const printerById = (id: string) => h.config()?.printers.find((p) => p.id === id);
  const queue = createQueue(async (id, data) => {
    const p = printerById(id);
    if (!p) throw new Error("Yazıcı tanımlı değil");
    try {
      await send(p, data);
      status.set(id, { ok: true, error: null });
    } catch (e) {
      status.set(id, { ok: false, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  });

  const pick = (sel?: string) => {
    const ps = h.config()?.printers ?? [];
    return ps.find((p) => p.id === sel) ?? ps.find((p) => p.role === (sel ?? "fis"));
  };

  function statusBody() {
    const c = h.config();
    return {
      version: VERSION,
      printers: (c?.printers ?? []).map((p) => ({ id: p.id, name: p.name, role: p.role, ...(status.get(p.id) ?? { ok: null, error: null }) })),
      failed: queue.failed(),
      scale: !!c && c.scale.kind !== "yok",
      tabs: { buffered: tabs.size(), clients: clients.size },
    };
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = req.headers.origin;
    const cors: Record<string, string> = { Vary: "Origin", "Cache-Control": "no-store" };
    if (origin === h.origin) {
      Object.assign(cors, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Private-Network": "true", "Access-Control-Max-Age": "600" });
    }
    const send = (code: number, body: unknown) => { res.writeHead(code, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "OPTIONS") { res.writeHead(origin === h.origin ? 204 : 403, cors); return res.end(); }
    if (origin && origin !== h.origin) return send(403, { error: "köken" });

    const url = new URL(req.url ?? "/", "http://x");
    const streamRoute = req.method === "GET" && url.pathname === "/tabs/stream";
    const ticket = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? (streamRoute ? url.searchParams.get("ticket") ?? undefined : undefined);
    const claims = ticket ? await verifyTicket(h.hubKey, ticket) : null;
    if (!claims || claims.t !== h.tenantId || h.revoked().includes(claims.d)) return send(401, { error: "bilet" });

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) { size += (c as Buffer).length; if (size > 256 * 1024) return send(413, { error: "büyük" }); chunks.push(c as Buffer); }
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch { return send(400, { error: "json" }); }
    }

    const route = `${req.method} ${url.pathname}`;
    if (route === "POST /tabs/events") {
      const evs = body.events;
      if (!Array.isArray(evs) || evs.length > MAX_BATCH || !evs.every(validEvent)) return send(400, { error: "olay" });
      const added = tabs.accept(evs);
      for (const c of clients) writeBatch(c, added);
      return send(200, { accepted: added.length });
    }
    if (route === "GET /tabs/stream") {
      const last = Number(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0) || 0;
      res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", Connection: "keep-alive" });
      res.write(": ok\n\n");
      const pending = tabs.after(last > tabs.lastSeq() ? 0 : last);
      for (let i = 0; i < pending.length; i += MAX_BATCH) writeBatch(res, pending.slice(i, i + MAX_BATCH));
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      const end = setTimeout(() => res.end(), h.streamMs ?? 240_000);
      res.on("close", () => { clients.delete(res); clearInterval(ping); clearTimeout(end); });
      return;
    }
    if (route === "GET /status") return send(200, statusBody());
    if (route === "POST /print") {
      const p = pick(typeof body.printer === "string" ? body.printer : undefined);
      if (!p) return send(404, { error: "Yazıcı tanımlı değil" });
      if (typeof body.data !== "string") return send(400, { error: "data" });
      let data: Uint8Array;
      try { data = fromBase64(body.data); } catch { return send(400, { error: "data" }); }
      if (body.drawer === true && p.drawer) data = Uint8Array.from([...DRAWER_PULSE, ...data]);
      const j = queue.enqueue(p.id, data);
      const ok = await j.done;
      return send(200, { jobId: j.id, ok, error: ok ? null : status.get(p.id)?.error ?? "Yazdırılamadı" });
    }
    if (route === "POST /print/retry") {
      const j = typeof body.jobId === "string" ? queue.retry(body.jobId) : null;
      if (!j) return send(404, { error: "iş yok" });
      const ok = await j.done;
      return send(200, { jobId: j.id, ok, error: ok ? null : "Yazdırılamadı" });
    }
    if (route === "POST /drawer") {
      const p = h.config()?.printers.find((x) => x.drawer);
      if (!p) return send(404, { error: "Çekmece tanımlı değil" });
      const j = queue.enqueue(p.id, Uint8Array.from(DRAWER_PULSE));
      const ok = await j.done;
      if (!ok) queue.dropFailed(j.id); // çekmece darbesi sonradan tekrarlanmaz
      return send(200, { ok });
    }
    if (route === "GET /scale") {
      const c = h.config()?.scale;
      if (!c || c.kind === "yok") return send(404, { error: "Terazi tanımlı değil" });
      try { return send(200, await (h.scale ?? readStable)(c)); } catch (e) { return send(502, { error: e instanceof Error ? e.message : "Terazi" }); }
    }
    return send(404, { error: "yok" });
  }

  const listener = (req: http.IncomingMessage, res: http.ServerResponse) => {
    handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  };

  return {
    statusBody,
    listenLocal: (port: number) => new Promise<http.Server>((resolve, reject) => { const s = http.createServer(listener); s.once("error", reject); s.listen(port, "127.0.0.1", () => resolve(s)); }),
    listenTls: (port: number, tls: { key: string; cert: string }) => new Promise<https.Server>((resolve, reject) => { const s = https.createServer(tls, listener); s.once("error", reject); s.listen(port, "0.0.0.0", () => resolve(s)); }),
  };
}
