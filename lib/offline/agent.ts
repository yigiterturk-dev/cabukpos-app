// lib/offline/agent.ts — Kasa → yerel ajan (tarayıcı). Ajan yoksa/ulaşılamazsa çağrılar null ya da hata döner;
// satış hiçbir zaman bunu beklemez (yazıcı hatası satışı durdurmaz).
import type { KasaAgent } from "@/lib/agent/config";
import { renderKitchenTicket, type KitchenTicketData } from "@/lib/core/kitchen";
import { toBase64 } from "@/lib/core/escpos";
import { renderReceipt, renderShiftReport, type ReceiptSale, type ShiftPrint } from "@/lib/core/receipt";
import type { Meta } from "./state";

export type AgentStatus = {
  reachable: boolean;
  printers: { id: string; name: string; role: string; ok: boolean | null; error: string | null }[];
  failed: { id: string; printer: string; error?: string }[];
  scale: boolean;
};
export type PrintResult = { ok: boolean; error: string | null; jobId: string | null };

async function call<T>(a: KasaAgent, path: string, body?: unknown, ms = 20_000): Promise<T> {
  const r = await fetch(a.url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${a.ticket}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Ajan ${r.status}`);
  return j as T;
}

export async function agentStatus(a: KasaAgent): Promise<AgentStatus> {
  try {
    return { reachable: true, ...(await call<Omit<AgentStatus, "reachable">>(a, "/status", undefined, 3000)) };
  } catch {
    return { reachable: false, printers: [], failed: [], scale: false };
  }
}

const receiptPrinter = (a: KasaAgent) => a.printers.find((p) => p.role === "fis");

async function send(a: KasaAgent, printer: string, data: Uint8Array, drawer: boolean): Promise<PrintResult> {
  try {
    const r = await call<{ ok: boolean; error: string | null; jobId: string }>(a, "/print", { printer, data: toBase64(data), drawer });
    return { ok: r.ok, error: r.error, jobId: r.jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name !== "TimeoutError" ? e.message : "Ajana ulaşılamadı", jobId: null };
  }
}

/** Fişi ajanın fiş yazıcısına basar. Fiş yazıcısı yoksa null (tarayıcı yazdırma). */
export function printSale(meta: Meta, sale: ReceiptSale, drawer = false): Promise<PrintResult> | null {
  const a = meta.agent, d = meta.device;
  const p = a && receiptPrinter(a);
  if (!a || !p || !d) return null;
  const weighed = (id: string) => meta.catalog.products.find((x) => x.id === id)?.kind === "tartili";
  return send(a, p.id, renderReceipt(sale, d, { width: p.width, codepage: p.codepage }, weighed), drawer && a.drawer);
}

/** Mutfak fişi: istasyonun ajan yazıcısına. Yazıcı ajanda tanımlı değilse null. */
export function printKitchen(a: KasaAgent, printerId: string, data: KitchenTicketData): Promise<PrintResult> | null {
  const p = a.printers.find((x) => x.id === printerId);
  if (!p) return null;
  return send(a, p.id, renderKitchenTicket(data, { width: p.width, codepage: p.codepage }), false);
}

export function printShift(meta: Meta, s: ShiftPrint): Promise<PrintResult> | null {
  const a = meta.agent, d = meta.device;
  const p = a && receiptPrinter(a);
  if (!a || !p || !d) return null;
  return send(a, p.id, renderShiftReport(s, d, { width: p.width, codepage: p.codepage }), false);
}

export async function retryPrint(a: KasaAgent, jobId: string): Promise<PrintResult> {
  try {
    const r = await call<{ ok: boolean; error: string | null; jobId: string }>(a, "/print/retry", { jobId });
    return { ok: r.ok, error: r.error, jobId: r.jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ajana ulaşılamadı", jobId };
  }
}

export async function openDrawer(a: KasaAgent): Promise<boolean> {
  try { return (await call<{ ok: boolean }>(a, "/drawer", {})).ok; } catch { return false; }
}

export async function readScale(a: KasaAgent): Promise<{ grams: number; stable: boolean }> {
  return call(a, "/scale", undefined, 5000);
}
