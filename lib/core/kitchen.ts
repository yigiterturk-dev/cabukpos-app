// lib/core/kitchen.ts — Mutfak fişi (ESC/POS) ve yazdırılacak biletlerin seçimi. Saf.
import { EscPos, type Codepage, type PaperWidth, type PrinterBrand } from "./escpos";
import { qtyText } from "./receipt";
import type { LineOption } from "./options";
import type { TabState, Ticket } from "./tab";

export type KitchenTicketData = {
  tableName: string; packed?: boolean; /** Platform siparişi: yazıcı zili öter (başında kimse olmasa da duyulsun). */ buzz?: boolean; stationName: string | null; staffName: string | null; at: string;
  lines: { qtyMilli: number; name: string; options: LineOption[]; note: string | null }[];
};

const TZ = "Europe/Istanbul";

export function renderKitchenTicket(t: KitchenTicketData, o: { width: PaperWidth; codepage: Codepage; brand?: PrinterBrand }): Uint8Array {
  const p = new EscPos(o.codepage, o.width, o.brand ?? "genel");
  const d = new Date(t.at);
  p.align("center").bold(true).size(2, 2);
  if (t.packed) p.line("PAKET");
  p.line(t.tableName.slice(0, Math.floor(p.cols / 2))).size(1).bold(false);
  if (t.stationName) p.line(t.stationName);
  p.line(`${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}${t.staffName ? ` · ${t.staffName}` : ""}`);
  p.align("left").rule();
  for (const l of t.lines) {
    p.bold(true).size(2).lines(`${qtyText(l.qtyMilli)} x ${l.name}`).size(1).bold(false);
    for (const op of l.options) p.lines(`  + ${op.name}`);
    if (l.note) p.lines(`  ! ${l.note}`);
  }
  p.rule().feed(3).cut();
  if (t.buzz) p.buzz();
  return p.bytes();
}

export const PRINT_WINDOW_MS = 30 * 60_000;

/** Yazıcı sorumlusunun basacağı biletler: yazıcılı istasyon, basılmamış, 30 dk'dan yeni. Eskiden yeniye. */
export function pendingPrints(tabs: Iterable<TabState>, printerOf: (stationId: string | null) => string | null, now: number): { tab: TabState; ticket: Ticket; printer: string }[] {
  const out: { tab: TabState; ticket: Ticket; printer: string }[] = [];
  for (const tab of tabs) for (const ticket of tab.tickets) {
    const printer = printerOf(ticket.stationId);
    if (printer && !ticket.printed && now - Date.parse(ticket.at) < PRINT_WINDOW_MS) out.push({ tab, ticket, printer });
  }
  return out.sort((a, b) => a.ticket.at.localeCompare(b.ticket.at));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Ajansız kasa: aynı mutfak fişinin HTML hâli (Chrome --kiosk-printing ile varsayılan yazıcıya sessiz basılır). */
export function kitchenTicketHtml(t: KitchenTicketData, width: PaperWidth = 80): string {
  const d = new Date(t.at);
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const lines = t.lines.map((l) => `<div class="l"><b>${esc(qtyText(l.qtyMilli))} x ${esc(l.name)}</b>${l.options.map((o) => `<div class="s">+ ${esc(o.name)}</div>`).join("")}${l.note ? `<div class="s">! ${esc(l.note)}</div>` : ""}</div>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Mutfak fişi</title><style>
@page{size:${width}mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}
body{width:${width - 8}mm;padding:2mm 3mm 8mm;font:13px/1.3 Arial,Helvetica,sans-serif}
.c{text-align:center}.h{font-size:22px;font-weight:700}.r{border-top:1px dashed #000;margin:2mm 0}
.l{font-size:17px;margin:1.5mm 0}.s{font-size:14px;padding-left:4mm}
</style></head><body><div class="c">${t.packed ? '<div class="h">PAKET</div>' : ""}<div class="h">${esc(t.tableName)}</div>${t.stationName ? `<div>${esc(t.stationName)}</div>` : ""}<div>${esc(time)}${t.staffName ? ` · ${esc(t.staffName)}` : ""}</div></div><div class="r"></div>${lines}<div class="r"></div></body></html>`;
}
