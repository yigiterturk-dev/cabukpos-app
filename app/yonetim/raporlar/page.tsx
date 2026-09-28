import Link from "next/link";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { profitRows } from "@/lib/core/profit";
import { firstStoreId, stockLevels } from "@/lib/admin/stock";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { signedTL } from "@/components/ShiftReport";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

const istDay = (offsetDays = 0) => new Date(Date.now() + 3 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const validDay = (d: string | undefined, fb: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : fb);
const tab = (href: string, label: string, on: boolean) => <Link href={href} role="tab" aria-selected={on} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{label}</Link>;

export default async function Raporlar({ searchParams }: { searchParams: Promise<{ sekme?: string; bas?: string; bit?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const karlilik = sp.sekme === "karlilik";
  const critical = await withTenant(a.tenantId, async (tx) => {
    const storeId = await firstStoreId(tx);
    return storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [];
  });
  const head = (
    <>
      <PageHeader title="Raporlar" desc={karlilik ? "Ürün kârlılığı: KDV hariç net ciro, satış anındaki maliyet, brüt kâr. İadeler düşülür." : "Vardiya (gün sonu) raporları. Son 200 vardiya."} />
      {critical.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4" data-testid="critical-card">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold text-red-800">Kritik stok ({critical.length})</h2><Link href="/yonetim/stok?kritik=1" className="text-sm text-red-800 underline">Stok</Link></div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{critical.map((c) => <li key={c.id}><b>{c.name}</b> <span className="tabular">{formatQty(c.level, c.unit)}</span> <span className="text-muted">(sınır {formatQty(c.minStock!, c.unit)})</span></li>)}</ul>
        </Card>
      )}
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Rapor">{tab("/yonetim/raporlar", "Vardiyalar", !karlilik)}{tab("/yonetim/raporlar?sekme=karlilik", "Kârlılık", karlilik)}</div>
    </>
  );
  if (karlilik) {
    const bas = validDay(sp.bas, istDay(-6)), bit = validDay(sp.bit, istDay());
    const L = schema.saleLines, S = schema.sales;
    const lines = await withTenant(a.tenantId, (tx) => tx.select({ productId: L.productId, name: L.name, qtyMilli: L.qtyMilli, total: L.total, vatRate: L.vatRate, cost: L.cost, status: S.status })
      .from(L).innerJoin(S, eq(S.id, L.saleId))
      .where(and(inArray(S.status, ["kapandi", "iade"]), gte(S.createdAt, new Date(`${bas}T00:00:00+03:00`)), lt(S.createdAt, new Date(new Date(`${bit}T00:00:00+03:00`).getTime() + 86400_000)))));
    const rows = profitRows(lines.map((l) => ({ key: l.productId ?? `ad:${l.name}`, name: l.name, qtyMilli: l.qtyMilli, total: l.total, vatRate: l.vatRate, cost: l.cost, refund: l.status === "iade" })));
    const sum = rows.reduce((t, r) => ({ net: t.net + r.net, cost: t.cost + r.cost, missing: t.missing + r.missing }), { net: 0, cost: 0, missing: 0 });
    return (
      <>
        {head}
        <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="sekme" value="karlilik" />
          <label className="flex flex-col gap-1">Başlangıç<input type="date" name="bas" defaultValue={bas} className="rounded-lg border border-line px-3 py-2" /></label>
          <label className="flex flex-col gap-1">Bitiş<input type="date" name="bit" defaultValue={bit} className="rounded-lg border border-line px-3 py-2" /></label>
          <button className="rounded-lg border border-line px-3 py-2 hover:bg-stone-50">Göster</button>
        </form>
        {rows.length === 0 ? <Empty>Bu aralıkta satış yok.</Empty> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>{["Ürün", "Adet", "Net ciro", "Maliyet", "Brüt kâr", "Marj", "Maliyeti eksik"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key} data-testid={`profit-${r.name}`}>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{(r.qtyMilli / 1000).toLocaleString("tr-TR")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTL(r.net)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" data-testid="profit-cost">{formatTL(r.cost)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.profit < 0 ? "text-red-700" : ""}`}>{formatTL(r.profit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" data-testid="profit-margin">{r.margin === null ? "—" : `%${r.margin.toFixed(1)}`}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.missing ? "text-amber-700" : "text-muted"}`}>{r.missing || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line font-medium">
                <tr><td className="px-4 py-2.5">Toplam</td><td /><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(sum.net)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(sum.cost)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatTL(sum.net - sum.cost)}</td><td /><td className="px-4 py-2.5 text-right tabular-nums">{sum.missing || "—"}</td></tr>
              </tfoot>
            </table>
          </Card>
        )}
        {sum.missing > 0 && <p className="mt-3 text-sm text-amber-700">Maliyeti eksik satırlar: ürüne ya da reçetedeki hammaddeye alış girilmemiş. Bu satırların maliyeti 0 sayıldı, marjı gösterilmez.</p>}
      </>
    );
  }
  const sh = schema.shifts, s = schema.sales;
  const rows = await withTenant(a.tenantId, (tx) =>
    tx.select({
      id: sh.id, openedAt: sh.openedAt, closedAt: sh.closedAt, countedCash: sh.countedCash, expectedCash: sh.expectedCash,
      device: schema.devices.name, opener: schema.staff.name,
      gross: sql<number>`coalesce((select sum(${s.total}) from ${s} where ${s.shiftId} = ${sh.id} and ${s.status} = 'kapandi'), 0)::int`,
      count: sql<number>`(select count(*) from ${s} where ${s.shiftId} = ${sh.id} and ${s.status} = 'kapandi')::int`,
    })
      .from(sh)
      .innerJoin(schema.devices, eq(schema.devices.id, sh.deviceId))
      .innerJoin(schema.staff, eq(schema.staff.id, sh.openedBy))
      .orderBy(desc(sh.openedAt))
      .limit(200),
  );
  return (
    <>
      {head}
      {rows.length === 0 ? <Empty>Henüz vardiya yok. Kasada vardiya açılınca burada görünür.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>{["Cihaz", "Açan", "Açılış", "Kapanış", "Satış", "Ciro", "Fark"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const diff = r.countedCash !== null && r.expectedCash !== null ? r.countedCash - r.expectedCash : null;
                return (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5"><Link href={`/yonetim/raporlar/${r.id}`} className="font-medium underline">{r.device}</Link></td>
                    <td className="px-4 py-2.5">{r.opener}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.openedAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.closedAt ? dt(r.closedAt) : <Badge tone="brand">Açık</Badge>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTL(r.gross)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${diff === null ? "text-muted" : diff < 0 ? "text-red-700" : diff > 0 ? "text-emerald-700" : ""}`}>{diff === null ? "—" : signedTL(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
