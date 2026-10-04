// lib/core/rfm.ts — #40: müşteri RFM puanlaması + kohort gridi. Saf hesap; DB yok, zaman hormonsuz (nowMs dışarıdan).
import type { Kurus } from "./money";

export type RfmScores = { r: 1 | 2 | 3 | 4 | 5; f: 1 | 2 | 3 | 4 | 5; m: 1 | 2 | 3 | 4 | 5 };

/** Recency: son siparişten bugüne gün. F: sipariş adedi. M: toplam harcama (kuruş). Eşikler sabit — segmentler koşular arasında kararlı. */
export function rfmScore(nowMs: number, lastOrderAt: string, orders: number, spend: Kurus): RfmScores {
  const days = Math.max(0, Math.floor((nowMs - new Date(lastOrderAt).getTime()) / 86_400_000));
  const r = days <= 7 ? 5 : days <= 30 ? 4 : days <= 60 ? 3 : days <= 90 ? 2 : 1;
  const f = orders >= 20 ? 5 : orders >= 10 ? 4 : orders >= 5 ? 3 : orders >= 2 ? 2 : 1;
  const m = spend >= 2_000_000 ? 5 : spend >= 1_000_000 ? 4 : spend >= 500_000 ? 3 : spend >= 100_000 ? 2 : 1;
  return { r, f, m } as RfmScores;
}

export const RFM_SEGMENT: Record<string, string> = {
  sampiyon: "Şampiyon",
  sadik: "Sadık",
  yeni: "Yeni",
  buyuyen: "Büyüyen",
  risk: "Risk altında",
  uyuyan: "Uyuyan",
  kayip: "Kayıp",
};

/** Klasik RFM segmentasyonu (TR etiket). */
export function rfmSegment({ r, f }: RfmScores): keyof typeof RFM_SEGMENT {
  if (r >= 4 && f >= 4) return "sampiyon";
  if (r >= 4 && f <= 2) return "yeni";
  if (r >= 3 && f >= 3) return "sadik";
  if (r === 3 && f <= 2) return "buyuyen";
  if (r <= 2 && f >= 4) return "risk";
  if (r <= 2 && f <= 2) return "kayip";
  return "uyuyan";
}

/** İstanbul ay anahtarı: "YYYY-MM". */
export const rfmMonth = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 7);

export type CohortCell = { offset: number; customers: number; ordered: number };
export type CohortRow = { month: string; size: number; cells: CohortCell[] };

/**
 * Kohort gridi: ilk sipariş ayına göre gruplanmış müşterilerin, sonraki aylardaki sipariş edip etmemesi.
 * orders: { customerId, at } (tamamlanmış satışlar). months: artan "YYYY-MM" listesi (kapsayıcı pencere).
 */
export function cohortGrid(orders: { customerId: string; at: string }[], months: string[]): CohortRow[] {
  const first = new Map<string, string>();
  for (const o of orders) {
    const mk = rfmMonth(o.at);
    const cur = first.get(o.customerId);
    if (!cur || mk < cur) first.set(o.customerId, mk);
  }
  const idx = new Map(months.map((m, i) => [m, i]));
  const grid = new Map<string, { size: number; cells: Map<number, Set<string>> }>();
  for (const o of orders) {
    const fm = first.get(o.customerId)!;
    const fi = idx.get(fm);
    if (fi === undefined) continue; // pencere dışında ilk siparişi olanlar kohorta dahil değil
    const oi = idx.get(rfmMonth(o.at))!;
    let g = grid.get(fm);
    if (!g) { g = { size: 0, cells: new Map() }; grid.set(fm, g); }
    g.cells.set(oi, g.cells.get(oi) ?? new Set());
    g.cells.get(oi)!.add(o.customerId); // o ay sipariş verenler
  }
  for (const fm of first.values()) {
    if (idx.has(fm)) grid.get(fm)!.size++;
  }
  return months.flatMap((month, fi) => {
    const g = grid.get(month);
    if (!g) return [];
    const cells: CohortCell[] = [];
    for (let off = 0; off < months.length - fi; off++) {
      const ordered = g.cells.get(fi + off)?.size ?? 0;
      cells.push({ offset: off, customers: off === 0 ? g.size : g.size, ordered });
    }
    return [{ month, size: g.size, cells }];
  });
}

/** RFM satırlarından Türkçe Excel CSV'si (BOM + ;). */
export function rfmCsv(rows: { name: string; phone: string; orders: number; spend: number; lastOrderAt: string; recencyDays: number; segment: string }[]): string {
  const esc = (v: string | number) => {
    const s = String(v).replace(/"/g, '""');
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  };
  const head = "Müşteri;Telefon;Sipariş;Harcama (TL);Son sipariş;Gün önce;Segment";
  const body = rows.map((r) => [esc(r.name), esc(r.phone), r.orders, (r.spend / 100).toFixed(2).replace(".", ","), r.lastOrderAt.slice(0, 10), r.recencyDays, esc(r.segment)].join(";"));
  return "\uFEFF" + [head, ...body].join("\r\n");
}

/** Son 12 ay "YYYY-MM" listesi (İstanbul; en eski ay başından bu ay'a). */
export function rfmMonths(nowMs: number): string[] {
  const base = new Date(nowMs + 3 * 3_600_000);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}
