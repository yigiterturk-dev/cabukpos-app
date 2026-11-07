// lib/core/kitchen.ts — Mutfak fişi (ESC/POS) ve yazdırılacak biletlerin seçimi. Saf.
import { EscPos, type Codepage, type PaperWidth, type PrinterBrand } from "./escpos";
import { qtyText } from "./receipt";
import type { LineOption } from "./options";
import type { TabState, Ticket } from "./tab";

export type KitchenTicketData = {
  tableName: string; packed?: boolean; /** Platform siparişi: yazıcı zili öter (başında kimse olmasa da duyulsun). */ buzz?: boolean; stationName: string | null; staffName: string | null; at: string;
  lines: { qtyMilli: number; name: string; options: LineOption[]; note: string | null; unitPrice?: number }[];
  /** Paket/platform siparişi: müşteri, adres, ödeme, toplam (kuruş) fişe basılır. */
  order?: { no: string | null; name: string; phone: string; address: string; directions: string | null; note: string | null; pay: string; total: number } | null;
};

const PAY_LABEL: Record<string, string> = { nakit: "Kapıda nakit", kart: "Kapıda kart", yemek_karti: "Yemek kartı", online: "Online ödendi" };
const tl = (k: number) => `${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

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

/** Ajansız kasa: mutfak/paket fişinin HTML hâli (Chrome --kiosk-printing ile varsayılan yazıcıya sessiz basılır). */
export function kitchenTicketHtml(t: KitchenTicketData, width: PaperWidth = 80): string {
  const d = new Date(t.at);
  const time = d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const o = t.order;
  const priced = t.lines.every((l) => typeof l.unitPrice === "number");
  const lines = t.lines.map((l) => {
    const sum = priced ? `<span class="p">${esc(tl(Math.round((l.unitPrice! * l.qtyMilli) / 1000)))}</span>` : "";
    return `<div class="l"><div class="row"><b>${esc(qtyText(l.qtyMilli))} x ${esc(l.name)}</b>${sum}</div>${l.options.map((x) => `<div class="s">+ ${esc(x.name)}</div>`).join("")}${l.note ? `<div class="s n">! ${esc(l.note)}</div>` : ""}</div>`;
  }).join("");
  const info = o ? `<div class="r"></div>
<div class="k">${esc(o.name)}</div>${o.phone ? `<div class="k">Tel: ${esc(o.phone)}</div>` : ""}${o.address ? `<div class="a">${esc(o.address)}</div>` : ""}${o.directions ? `<div class="a">Tarif: ${esc(o.directions)}</div>` : ""}${o.note ? `<div class="box">NOT: ${esc(o.note)}</div>` : ""}` : "";
  const foot = o ? `<div class="r"></div><div class="row big"><b>TOPLAM</b><b>${esc(tl(o.total))}</b></div><div class="c pay">${esc(PAY_LABEL[o.pay] ?? o.pay)}</div>` : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Fiş</title><style>
@page{size:${width}mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}
body{width:${width - 6}mm;padding:3mm 3mm 18mm;font:16px/1.35 Arial,Helvetica,sans-serif}
.c{text-align:center}.h{font-size:30px;font-weight:800;line-height:1.15}.h2{font-size:22px;font-weight:700}
.r{border-top:2px dashed #000;margin:3mm 0}.row{display:flex;justify-content:space-between;gap:2mm}
.l{font-size:20px;margin:2.5mm 0}.p{white-space:nowrap;font-size:17px}.s{font-size:17px;padding-left:5mm}.n{font-weight:700}
.k{font-size:19px;font-weight:700}.a{font-size:17px}.box{border:2px solid #000;padding:2mm;margin-top:2mm;font-size:18px;font-weight:700}
.big{font-size:24px}.pay{font-size:20px;font-weight:700;margin-top:1mm}
</style></head><body><div class="c">${t.packed ? '<div class="h">PAKET</div>' : ""}<div class="h2">${esc(t.tableName)}</div>${o?.no ? `<div class="h2">#${esc(o.no)}</div>` : ""}${t.stationName ? `<div>${esc(t.stationName)}</div>` : ""}<div>${esc(time)}${t.staffName ? ` · ${esc(t.staffName)}` : ""}</div></div>${info}<div class="r"></div>${lines}${foot}</body></html>`;
}
