// lib/core/tab.ts — Masa adisyonu: değişmez olayların katlanması. İstemci (salon, mutfak) ve bulut aynı kodu kullanır.
// Sıra: sunucu sırası (seq) olanlar önce, henüz gönderilmemiş yerel olaylar zamana göre sonra.
// Bilinmeyen satıra/bilete gelen olay yok sayılır (çevrimdışı çakışma kaydı bozmaz).
import type { Kurus, VatRate } from "./money";
import type { LineOption } from "./options";

export type KitchenStatus = "yeni" | "hazirlaniyor" | "hazir" | "teslim";
export type PaidLine = { lineId: string; qtyMilli: number; discount: Kurus };

export type TabEv =
  | { type: "open"; guests: number }
  | { type: "add"; lineId: string; productId: string; name: string; unitPrice: Kurus; vatRate: VatRate; qtyMilli: number; options: LineOption[]; note: string | null; stationId: string | null }
  | { type: "void"; lineId: string; reason: string }
  | { type: "send"; ticketId: string; lineIds: string[]; stationId: string | null }
  | { type: "move"; toTableId: string }
  | { type: "comp"; lineId: string; reason: string }
  | { type: "discount"; percent: number | null; amount: Kurus | null; reason: string }
  | { type: "bill" }
  | { type: "kitchen"; ticketId: string; status: Exclude<KitchenStatus, "yeni"> }
  | { type: "printed"; ticketId: string }
  | { type: "paid"; saleId: string; lines: PaidLine[]; amount: Kurus };

export type TabEvent = { id: string; tabId: string; tableId: string; at: string; staffId: string | null; approvedBy: string | null; seq: number | null; ev: TabEv };

export type TabLine = Extract<TabEv, { type: "add" }> & { addedAt: string; staffId: string | null; sent: boolean; voided: boolean; comped: boolean; paidMilli: number; paidDiscount: Kurus };
export type Ticket = { id: string; stationId: string | null; lineIds: string[]; at: string; staffId: string | null; status: KitchenStatus; readyAt: string | null; printed: boolean };
export type TabState = {
  id: string; tableId: string; openedAt: string; lastAt: string; guests: number; staffId: string | null;
  lines: TabLine[]; tickets: Ticket[]; discount: { percent: number | null; amount: Kurus | null } | null;
  billRequested: boolean; gross: Kurus; discountAmount: Kurus; total: Kurus; paid: Kurus; remaining: Kurus; closed: boolean; closedAt: string | null;
};

const ORDER = (a: TabEvent, b: TabEvent) =>
  a.seq !== null && b.seq !== null ? a.seq - b.seq : a.seq !== null ? -1 : b.seq !== null ? 1 : a.at.localeCompare(b.at);

export const lineGross = (l: { unitPrice: Kurus; qtyMilli: number }) => Math.round((l.unitPrice * l.qtyMilli) / 1000);

export function sortEvents(events: TabEvent[]): TabEvent[] {
  // Aynı kimlik iki kez (yerel + sunucu yankısı) → sunucudaki kalır.
  const byId = new Map<string, TabEvent>();
  for (const e of events) { const had = byId.get(e.id); if (!had || (had.seq === null && e.seq !== null)) byId.set(e.id, e); }
  return [...byId.values()].sort(ORDER);
}

export function foldTabs(events: TabEvent[]): Map<string, TabState> {
  const tabs = new Map<string, TabState>();
  for (const e of sortEvents(events)) {
    let t = tabs.get(e.tabId);
    if (!t) {
      t = { id: e.tabId, tableId: e.tableId, openedAt: e.at, lastAt: e.at, guests: 0, staffId: e.staffId, lines: [], tickets: [], discount: null, billRequested: false, gross: 0, discountAmount: 0, total: 0, paid: 0, remaining: 0, closed: false, closedAt: null };
      tabs.set(e.tabId, t);
    }
    if (e.at > t.lastAt) t.lastAt = e.at;
    const ev = e.ev;
    const line = "lineId" in ev ? t.lines.find((l) => l.lineId === ev.lineId) : undefined;
    const ticket = "ticketId" in ev ? t.tickets.find((k) => k.id === ev.ticketId) : undefined;
    switch (ev.type) {
      case "open": t.guests = ev.guests; if (e.at < t.openedAt) t.openedAt = e.at; break;
      case "add": if (!line) t.lines.push({ ...ev, addedAt: e.at, staffId: e.staffId, sent: false, voided: false, comped: false, paidMilli: 0, paidDiscount: 0 }); break;
      case "void": if (line && line.paidMilli === 0) line.voided = true; break;
      case "comp": if (line && !line.voided) line.comped = true; break;
      case "send": {
        if (ticket) break;
        const ids = ev.lineIds.filter((id) => t.lines.some((l) => l.lineId === id && !l.sent && !l.voided));
        for (const l of t.lines) if (ids.includes(l.lineId)) l.sent = true;
        if (ids.length) t.tickets.push({ id: ev.ticketId, stationId: ev.stationId, lineIds: ids, at: e.at, staffId: e.staffId, status: "yeni", readyAt: null, printed: false });
        break;
      }
      case "move": t.tableId = ev.toTableId; break;
      case "discount": t.discount = ev.percent === null && ev.amount === null ? null : { percent: ev.percent, amount: ev.amount }; break;
      case "bill": t.billRequested = true; break;
      case "kitchen": if (ticket) { ticket.status = ev.status; if (ev.status === "hazir") ticket.readyAt = e.at; } break;
      case "printed": if (ticket) ticket.printed = true; break;
      case "paid":
        t.paid += ev.amount;
        for (const p of ev.lines) {
          const l = t.lines.find((x) => x.lineId === p.lineId);
          if (l) { l.paidMilli += p.qtyMilli; l.paidDiscount += p.discount; }
        }
        break;
    }
    const live = t.lines.filter((l) => !l.voided);
    t.gross = live.filter((l) => !l.comped).reduce((a, l) => a + lineGross(l), 0);
    t.discountAmount = discountOf(t.gross, t.discount);
    t.total = t.gross - t.discountAmount;
    t.remaining = Math.max(0, t.total - t.paid);
    const wasClosed = t.closed;
    // Kapalı: her canlı satır ödendi ya da ikram (ikram satırı hesaba 0 TL girer ama beklenmez). Tümü iptal → kapalı.
    t.closed = t.lines.length > 0 && live.every((l) => l.comped || l.paidMilli >= l.qtyMilli);
    t.closedAt = t.closed ? (wasClosed ? t.closedAt : e.at) : null;
  }
  return tabs;
}

export function discountOf(gross: Kurus, d: TabState["discount"]): Kurus {
  if (!d) return 0;
  const v = d.percent !== null ? Math.round((gross * d.percent) / 100) : (d.amount ?? 0);
  return Math.min(gross, Math.max(0, v));
}

export type TableStatus = "bos" | "dolu" | "hazir" | "uzun";
export const LONG_OPEN_MS = 90 * 60_000;

export function tableStatus(open: TabState[], now: number): TableStatus {
  if (!open.length) return "bos";
  if (open.some((t) => t.tickets.some((k) => k.status === "hazir"))) return "hazir";
  if (open.some((t) => now - Date.parse(t.openedAt) > LONG_OPEN_MS)) return "uzun";
  return "dolu";
}

/** Masa kimliği → açık adisyonlar (çevrimdışı çakışmada bir masada birden çok olabilir). */
export function openTabsByTable(tabs: Map<string, TabState>): Map<string, TabState[]> {
  const m = new Map<string, TabState[]>();
  for (const t of tabs.values()) if (!t.closed) m.set(t.tableId, [...(m.get(t.tableId) ?? []), t]);
  return m;
}
