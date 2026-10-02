// lib/core/report.ts — M9a raporları, saf hesap (DB yok). Tutarlar kuruş, gün İstanbul (+03:00).
// Brüt = kapandi − iade (KDV dahil, indirimli); iptal satış hiç gelmez (sorgu süzer).
import { formatTL, type Kurus } from "./money";
import { PAY_METHODS, type PayMethod } from "./payment";
import type { RemovedLine } from "./cart";

const DAY = 86400_000;
const IST = 3 * 3600_000;
export const MAX_DAYS = 366;

export type Range = { bas: string; bit: string };
export type ReportTab = "ozet" | "yogunluk" | "urunler" | "personel" | "vardiyalar" | "karlilik" | "inceleme";
export const REPORT_TABS: readonly { key: ReportTab; label: string; csv: boolean; range: boolean }[] = [
  { key: "ozet", label: "Özet", csv: true, range: true },
  { key: "yogunluk", label: "Yoğunluk", csv: true, range: true },
  { key: "urunler", label: "Ürünler", csv: true, range: true },
  { key: "personel", label: "Personel", csv: true, range: true },
  { key: "vardiyalar", label: "Vardiyalar", csv: false, range: false },
  { key: "karlilik", label: "Kârlılık", csv: false, range: true },
  { key: "inceleme", label: "İncelenecek", csv: false, range: true },
];

export const istToday = (now = Date.now(), offsetDays = 0) => new Date(now + IST + offsetDays * DAY).toISOString().slice(0, 10);
const validDay = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const dayCount = (r: Range) => Math.round((Date.parse(`${r.bit}T00:00:00Z`) - Date.parse(`${r.bas}T00:00:00Z`)) / DAY) + 1;

/** Geçersiz → son 7 gün; ters sıra düzelir; 366 günden uzunsa başlangıç kısalır. */
export function parseRange(bas?: string, bit?: string, now = Date.now()): Range {
  if (!validDay(bas) || !validDay(bit)) return { bas: istToday(now, -6), bit: istToday(now) };
  const [b, e] = bas <= bit ? [bas, bit] : [bit, bas];
  return dayCount({ bas: b, bit: e }) > MAX_DAYS ? { bas: shiftDay(e, -(MAX_DAYS - 1)), bit: e } : { bas: b, bit: e };
}
export const prevRange = (r: Range): Range => ({ bas: shiftDay(r.bas, -dayCount(r)), bit: shiftDay(r.bas, -1) });
export const rangeBounds = (r: Range) => ({ from: new Date(`${r.bas}T00:00:00+03:00`), to: new Date(Date.parse(`${r.bit}T00:00:00+03:00`) + DAY) });
export const dateRanges = (now = Date.now()) => [
  { key: "bugun", label: "Bugün", bas: istToday(now), bit: istToday(now) },
  { key: "dun", label: "Dün", bas: istToday(now, -1), bit: istToday(now, -1) },
  { key: "7", label: "7 gün", bas: istToday(now, -6), bit: istToday(now) },
  { key: "30", label: "30 gün", bas: istToday(now, -29), bit: istToday(now) },
  { key: "ay", label: "Bu ay", bas: `${istToday(now).slice(0, 8)}01`, bit: istToday(now) },
];

export type SaleRow = { id: string; status: "kapandi" | "iade"; channel: "kasa" | "masa" | "paket" | "platform"; total: Kurus; net: Kurus; change: Kurus; at: Date; staffId: string };
export type PayRow = { saleId: string; method: PayMethod; amount: Kurus };
export type Summary = { gross: Kurus; net: Kurus; count: number; refunds: number; refundTotal: Kurus; avg: Kurus | null };

export function summarize(sales: SaleRow[]): Summary {
  const s = { gross: 0, net: 0, count: 0, refunds: 0, refundTotal: 0 };
  for (const x of sales) {
    if (x.status === "kapandi") { s.gross += x.total; s.net += x.net; s.count++; }
    else { s.gross -= x.total; s.net -= x.net; s.refunds++; s.refundTotal += x.total; }
  }
  return { ...s, avg: s.count ? Math.round(s.gross / s.count) : null };
}
export const pctChange = (now: number, before: number): number | null => (before === 0 ? null : ((now - before) / before) * 100);

const CHANNELS = [["kasa", "Kasa"], ["masa", "Masa"], ["paket", "Paket"], ["platform", "Platform"]] as const;
export function byChannel(sales: SaleRow[]) {
  return CHANNELS.map(([key, label]) => {
    const mine = sales.filter((s) => s.channel === key);
    return { key, label, gross: mine.reduce((t, s) => t + (s.status === "kapandi" ? s.total : -s.total), 0), count: mine.filter((s) => s.status === "kapandi").length };
  }).filter((c) => c.count || c.gross);
}

/** Ödeme yöntemi: iade eksi; para üstü (satış başına bir kez) nakitten düşer. */
export function byMethod(sales: SaleRow[], pays: PayRow[]) {
  const sale = new Map(sales.map((s) => [s.id, s]));
  const sum = new Map<PayMethod, number>();
  for (const p of pays) {
    const s = sale.get(p.saleId);
    if (s) sum.set(p.method, (sum.get(p.method) ?? 0) + (s.status === "iade" ? -p.amount : p.amount));
  }
  const change = sales.reduce((t, s) => t + (s.status === "kapandi" ? s.change : 0), 0);
  if (change) sum.set("nakit", (sum.get("nakit") ?? 0) - change);
  return PAY_METHODS.filter((m) => sum.get(m.value)).map((m) => ({ key: m.value, label: m.label, amount: sum.get(m.value)! }));
}

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export type Heat = { cells: { gross: Kurus; count: number }[][]; max: Kurus };
/** 7 (Pzt=0) × 24 saat, İstanbul saati. */
export function heatmap(sales: SaleRow[]): Heat {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ gross: 0, count: 0 })));
  for (const s of sales) {
    const d = new Date(s.at.getTime() + IST);
    const c = cells[(d.getUTCDay() + 6) % 7][d.getUTCHours()];
    if (s.status === "kapandi") { c.gross += s.total; c.count++; } else c.gross -= s.total;
  }
  return { cells, max: Math.max(0, ...cells.flat().map((c) => c.gross)) };
}

export type LineRow = { productId: string | null; name: string; categoryId: string | null; qtyMilli: number; total: Kurus; refund: boolean };
export type ProductRow = { key: string; productId: string | null; name: string; categoryId: string | null; qtyMilli: number; gross: Kurus; share: number };
export function productRows(lines: LineRow[], sort: "adet" | "ciro" = "ciro"): ProductRow[] {
  const by = new Map<string, ProductRow>();
  for (const l of lines) {
    const key = l.productId ?? `ad:${l.name}`;
    const r = by.get(key) ?? { key, productId: l.productId, name: l.name, categoryId: l.categoryId, qtyMilli: 0, gross: 0, share: 0 };
    const s = l.refund ? -1 : 1;
    r.qtyMilli += s * l.qtyMilli;
    r.gross += s * l.total;
    by.set(key, r);
  }
  const rows = [...by.values()];
  const total = rows.reduce((t, r) => t + r.gross, 0);
  for (const r of rows) r.share = total > 0 ? (r.gross / total) * 100 : 0;
  return rows.sort((a, b) => (sort === "adet" ? b.qtyMilli - a.qtyMilli : b.gross - a.gross) || a.name.localeCompare(b.name, "tr"));
}

export type CategoryRow = { key: string; name: string; qtyMilli: number; gross: Kurus; share: number };
export function categoryRows(rows: ProductRow[], names: Map<string, string>): CategoryRow[] {
  const by = new Map<string, CategoryRow>();
  for (const r of rows) {
    const key = r.categoryId ?? "-";
    const c = by.get(key) ?? { key, name: (r.categoryId && names.get(r.categoryId)) || "Kategorisiz", qtyMilli: 0, gross: 0, share: 0 };
    c.qtyMilli += r.qtyMilli; c.gross += r.gross; c.share += r.share;
    by.set(key, c);
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross);
}

export type EventKind = "iade" | "iptal" | "ikram" | "indirim" | "paket_iptal" | "silme" | "safe_drop";
export const EVENT_LABEL: Record<EventKind, string> = { iade: "İade", iptal: "Adisyon iptali", ikram: "İkram", indirim: "İndirim", paket_iptal: "Paket iptali", silme: "Sepetten silme", safe_drop: "Seifeye para" };
export type StaffEvent = { at: Date; staffId: string | null; kind: EventKind; text: string; amount: Kurus | null; approvedBy: string | null; reason: string | null };

export const qtyText = (milli: number) => (milli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const TAB_KIND: Record<string, EventKind> = { void: "iptal", comp: "ikram", discount: "indirim", cancel: "paket_iptal" };

/** tab_events (void/comp/discount/cancel) + satırın "add" olayı → olay. */
export function tabEventRow(x: { at: Date; staffId: string | null; approvedBy: string | null; type: string; payload: unknown; line: unknown }): StaffEvent {
  const p = x.payload as { reason?: string; percent?: number | null; amount?: number | null };
  const l = x.line as { name: string; unitPrice: number; qtyMilli: number } | null;
  const lineAmount = l ? Math.round((l.unitPrice * l.qtyMilli) / 1000) : null;
  const text = x.type === "discount"
    ? p.percent != null ? `Adisyon indirimi %${p.percent}` : p.amount != null ? `Adisyon indirimi ${formatTL(p.amount)}` : "İndirim kaldırıldı"
    : x.type === "cancel" ? "Paket sipariş iptali" : l ? `${l.name} × ${qtyText(l.qtyMilli)}` : "Satır";
  const amount = x.type === "discount" ? (p.amount ?? null) : x.type === "cancel" ? null : lineAmount;
  return { at: x.at, staffId: x.staffId, kind: TAB_KIND[x.type], text, amount, approvedBy: x.approvedBy, reason: p.reason || null };
}

export function registerEventRow(x: { at: Date; staffId: string; type: string; lines: RemovedLine[]; total: Kurus }): StaffEvent {
  if (x.type === "safe_drop") return { at: x.at, staffId: x.staffId, kind: "safe_drop", text: `Seifeye alınan ${formatTL(x.total)}`, amount: x.total, approvedBy: null, reason: null };
  const what = x.lines.map((l) => `${l.name} × ${qtyText(l.qtyMilli)}`).join(", ");
  return { at: x.at, staffId: x.staffId, kind: "silme", text: x.type === "cart_cleared" ? `Sepet boşaltıldı: ${what}` : what, amount: x.total, approvedBy: null, reason: null };
}

export type StaffRow = { staffId: string; name: string; gross: Kurus; count: number; refunds: number; refundTotal: Kurus; voids: number; voidTotal: Kurus; comps: number; compTotal: Kurus; discounts: number; discountTotal: Kurus; cancels: number; removed: number; removedTotal: Kurus };
/** Satış (kapandi) sales'ten; iade/iptal/ikram/indirim/paket iptali/silme olaylardan; "indirim + ikram payı" tutarı sale_lines.discount'tan. */
export function staffRows(sales: SaleRow[], discounts: { staffId: string; discount: Kurus }[], events: StaffEvent[], names: Map<string, string>): StaffRow[] {
  const by = new Map<string, StaffRow>();
  const row = (id: string) => {
    let r = by.get(id);
    if (!r) by.set(id, (r = { staffId: id, name: names.get(id) ?? "Bilinmeyen", gross: 0, count: 0, refunds: 0, refundTotal: 0, voids: 0, voidTotal: 0, comps: 0, compTotal: 0, discounts: 0, discountTotal: 0, cancels: 0, removed: 0, removedTotal: 0 }));
    return r;
  };
  for (const s of sales) if (s.status === "kapandi") { const r = row(s.staffId); r.gross += s.total; r.count++; }
  for (const d of discounts) row(d.staffId).discountTotal += d.discount;
  for (const e of events) {
    if (!e.staffId) continue;
    const r = row(e.staffId), a = e.amount ?? 0;
    if (e.kind === "iade") { r.refunds++; r.refundTotal += a; }
    else if (e.kind === "iptal") { r.voids++; r.voidTotal += a; }
    else if (e.kind === "ikram") { r.comps++; r.compTotal += a; }
    else if (e.kind === "indirim") r.discounts++;
    else if (e.kind === "paket_iptal") r.cancels++;
    else if (e.kind === "safe_drop") { /* kasa hareketi; personel performansına sayılmaz */ }
    else { r.removed++; r.removedTotal += a; }
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name, "tr"));
}

// — CSV: Türkçe Excel (UTF-8 BOM, ;, CRLF, ondalık virgül) —
export const csvTL = (k: Kurus) => (k / 100).toFixed(2).replace(".", ",");
export const csvQty = (milli: number) => String(milli / 1000).replace(".", ",");
const NUMERIC = /^-?\d+(,\d+)?$/;
function cell(v: string | number | null): string {
  if (v === null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`; // formül enjeksiyonu
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (head: string[], rows: (string | number | null)[][]) => `﻿${[head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;

// — M9c: ajans API'si günlük özeti. Platform satışı (ve iadesi) hariç: ajans onu platform bağlantısından alıyor. —
export const API_MAX_DAYS = 92;
/** Katı doğrulama (parseRange gibi düzeltmez): bozuk, ters ya da 92 günden uzun → null. */
export function apiRange(from: string | null, to: string | null): Range | null {
  if (!validDay(from ?? undefined) || !validDay(to ?? undefined) || from! > to!) return null;
  const r = { bas: from!, bit: to! };
  return dayCount(r) > API_MAX_DAYS ? null : r;
}

export type DailyRow = { status: "kapandi" | "iade"; channel: SaleRow["channel"]; total: Kurus; tabId: string | null; at: Date };
export type DailyStat = { day: string; orderCount: number; cancelledCount: number; grossRevenue: number; channels: { masa: number; paket: number; kasa: number } };
const istDay = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

/** Adisyon parçaları (hesap bölme) aynı gün tek sipariş; iade ciroyu düşer ve iptal sayılır. */
export function dailyStats(rows: DailyRow[]): DailyStat[] {
  const days = new Map<string, { gross: number; refunds: number; tabs: Set<string>; ch: DailyStat["channels"] }>();
  for (const x of rows) {
    if (x.channel === "platform") continue;
    const k = istDay(x.at);
    let d = days.get(k);
    if (!d) days.set(k, (d = { gross: 0, refunds: 0, tabs: new Set(), ch: { masa: 0, paket: 0, kasa: 0 } }));
    if (x.status === "iade") { d.gross -= x.total; d.refunds++; continue; }
    d.gross += x.total;
    if (x.tabId) { if (d.tabs.has(x.tabId)) continue; d.tabs.add(x.tabId); }
    d.ch[x.channel]++;
  }
  return [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, d]) => ({
    day, orderCount: d.ch.masa + d.ch.paket + d.ch.kasa, cancelledCount: d.refunds, grossRevenue: d.gross / 100, channels: d.ch,
  }));
}
