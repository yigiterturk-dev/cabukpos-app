// lib/admin/franchise.ts — franchise raporu: satış şubeleri için ciro payı + sabit bedel hakedişi.
// Ciro/iade/kâr HQ raporuyla aynı kaynaktan (hqData); depo ve tanımsız şubeler ayrı işaretlenir.
import { asc } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { franchiseCharge, isFranchiseStore } from "@/lib/core/franchise";
import { csvCell } from "@/lib/core/accounting";
import type { Range } from "@/lib/core/report";
import { hqData, type HqBranch } from "./hq";

export type FranchiseRow = HqBranch & {
  kind: "sube" | "depo";
  royaltyBps: number | null;
  monthlyFee: number | null;
  royalty: number;
  fixed: number;
  total: number;
};

export type FranchiseTotals = {
  sales: number; refunds: number; count: number; cost: number; noCost: number; profit: number;
  royalty: number; fixed: number; total: number;
};

export type FranchiseData = { range: Range; rows: FranchiseRow[]; totals: FranchiseTotals };

export async function franchiseData(tx: Tx, r: Range): Promise<FranchiseData> {
  const stores = await tx.select({ id: schema.stores.id, kind: schema.stores.kind, royaltyBps: schema.stores.royaltyBps, monthlyFee: schema.stores.monthlyFee })
    .from(schema.stores).orderBy(asc(schema.stores.name));
  const meta = new Map(stores.map((s) => [s.id, s]));
  const hq = await hqData(tx, r);
  const rows: FranchiseRow[] = hq.branches
    .filter((b) => isFranchiseStore(meta.get(b.storeId)?.kind))
    .map((b) => {
      const m = meta.get(b.storeId);
      const terms = { royaltyBps: m?.royaltyBps ?? null, monthlyFee: m?.monthlyFee ?? null };
      const charge = franchiseCharge(terms, b.sales, r.bas, r.bit);
      return { ...b, kind: m?.kind ?? "sube", ...terms, ...charge };
    });
  const totals = rows.reduce<FranchiseTotals>((a, b) => ({
    sales: a.sales + b.sales, refunds: a.refunds + b.refunds, count: a.count + b.count, cost: a.cost + b.cost,
    noCost: a.noCost + b.noCost, profit: a.profit + b.profit, royalty: a.royalty + b.royalty, fixed: a.fixed + b.fixed, total: a.total + b.total,
  }), { sales: 0, refunds: 0, count: 0, cost: 0, noCost: 0, profit: 0, royalty: 0, fixed: 0, total: 0 });
  return { range: r, rows, totals };
}

const tl = (k: number) => (k / 100).toFixed(2).replace(".", ",");
const pct = (bps: number | null) => (bps == null ? "" : (bps / 100).toFixed(2).replace(".", ","));

/** Türkçe Excel CSV'si: BOM + ';', formül enjeksiyonu korumalı. */
export function franchiseCsv(d: FranchiseData): string {
  const sep = ";";
  const header = ["Şube", "Net ciro", "İade", "Satış adedi", "Kâr", "Ciro payı (%)", "Ciro payı hakedişi", "Sabit bedel", "Toplam hakediş", "Durum"];
  const lines = [header.map((h) => csvCell(h, sep)).join(sep)];
  for (const r of d.rows) {
    const undefinedTerms = r.royaltyBps == null && r.monthlyFee == null;
    lines.push([r.name, tl(r.sales), tl(r.refunds), r.count, tl(r.profit), pct(r.royaltyBps), tl(r.royalty), tl(r.fixed), tl(r.total), undefinedTerms ? "Tanımsız" : ""].map((v) => csvCell(v, sep)).join(sep));
  }
  const t = d.totals;
  lines.push(["Toplam", tl(t.sales), tl(t.refunds), t.count, tl(t.profit), "", tl(t.royalty), tl(t.fixed), tl(t.total), ""].map((v) => csvCell(v, sep)).join(sep));
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
