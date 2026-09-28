// lib/core/kitchen.ts — Mutfak fişi (ESC/POS) ve yazdırılacak biletlerin seçimi. Saf.
import { EscPos, type Codepage, type PaperWidth } from "./escpos";
import { qtyText } from "./receipt";
import type { LineOption } from "./options";
import type { TabState, Ticket } from "./tab";

export type KitchenTicketData = {
  tableName: string; packed?: boolean; stationName: string | null; staffName: string | null; at: string;
  lines: { qtyMilli: number; name: string; options: LineOption[]; note: string | null }[];
};

const TZ = "Europe/Istanbul";

export function renderKitchenTicket(t: KitchenTicketData, o: { width: PaperWidth; codepage: Codepage }): Uint8Array {
  const p = new EscPos(o.codepage, o.width);
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
