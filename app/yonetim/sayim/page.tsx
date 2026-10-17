import { and, desc, eq, gt, sql } from "drizzle-orm";
import Link from "next/link";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { stockUnitOf, countVariance, wasteSummary, formatQty, type CountLineCore } from "@/lib/core/stock";
import { moneyFormatter } from "@/lib/admin/currency";
import { StartCountForm, CountLineForm, CloseCountForm, CancelCountForm } from "@/components/admin/CountForms";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Badge, Card, Empty, PageHeader, Panel, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Sayim() {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const C = schema.stockCounts, L = schema.stockCountLines, M = schema.stockMovements, P = schema.products;
  const data = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    if (!storeId) return null;
    const [open] = await tx.select().from(C).where(and(eq(C.storeId, storeId), eq(C.status, "acik"))).orderBy(desc(C.createdAt)).limit(1);
    const lines = open
      ? await tx.select({ id: L.id, productId: L.productId, expectedMilli: L.expectedMilli, countedMilli: L.countedMilli, name: P.name, kind: P.kind, unit: P.unit, sellable: P.sellable })
          .from(L).innerJoin(P, eq(P.id, L.productId)).where(eq(L.countId, open.id)).orderBy(P.name)
      : [];
    const [past, fires] = await Promise.all([
      tx.select({ id: C.id, status: C.status, openedAt: C.createdAt, closedAt: C.closedAt, note: C.note }).from(C).where(and(eq(C.storeId, storeId), eq(C.status, "kapandi"))).orderBy(desc(C.closedAt)).limit(8),
      tx.select({ productId: M.productId, qtyMilli: M.qtyMilli, name: P.name, kind: P.kind, unit: P.unit, sellable: P.sellable, cost: P.cost })
        .from(M).innerJoin(P, eq(P.id, M.productId)).where(and(eq(M.storeId, storeId), eq(M.kind, "fire"), gt(M.at, sql`now() - interval '30 days'`))).orderBy(desc(M.at)),
    ]);
    return { open, lines, past, fires };
  });
  if (!data) return <Empty>Sayım yapmak için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</Empty>;
  const waste = wasteSummary(data.fires.map((f) => ({ productId: f.productId, name: f.name, unit: stockUnitOf(f), qtyMilli: f.qtyMilli, cost: f.cost })));
  const wasteTotal = waste.reduce((s, r) => s + (r.cost ?? 0), 0);
  const core = (r: (typeof data.lines)[number]): CountLineCore => ({ productId: r.productId, expectedMilli: r.expectedMilli, countedMilli: r.countedMilli });
  const counted = data.lines.filter((r) => r.countedMilli !== null);
  const diff = counted.filter((r) => countVariance(core(r)) !== 0);
  return (
    <>
      <PageHeader title="Sayım & zayi" desc="Çok ürünlü sayım oturumu: açılışta beklenen stok donar, satır satır sayarsınız, kapanışta sapmayı onaylayınca stok sayılan değere oturur. Alttaki panel son 30 günün fire (zayi) özetidir." />
      {data.open ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">Açık sayım oturumu</span>
              <Badge>{dt.format(data.open.createdAt)}</Badge>
              <Badge>{counted.length}/{data.lines.length} satır sayıldı</Badge>
              {diff.length > 0 && <Badge>{diff.length} sapma</Badge>}
              <div className="ml-auto"><CancelCountForm countId={data.open.id} /></div>
            </div>
          </Card>
          <Card className="overflow-hidden lg:hidden">
            <ul aria-label="Stok sayım kalemleri" className="divide-y divide-line">
              {data.lines.map((r) => {
                const v = countVariance(core(r));
                return (
                  <li key={r.id} className={`space-y-3 p-4 ${v != null && v !== 0 ? "bg-brand-soft/40" : ""}`}>
                    <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium">{r.name}</p>{r.countedMilli === null ? <Badge>Sayılmadı</Badge> : <Badge tone={v === 0 ? "ok" : "warn"}>{v === 0 ? "Eşleşti" : "Sapma var"}</Badge>}</div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-muted">Beklenen</dt><dd className="tabular">{formatQty(r.expectedMilli, stockUnitOf(r))}</dd></div>
                      <div><dt className="text-xs text-muted">Sapma</dt><dd className={`tabular ${v == null ? "text-muted" : v === 0 ? "text-ok" : "text-bad"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${formatQty(v, stockUnitOf(r))}`}</dd></div>
                    </dl>
                    <CountLineForm countId={data.open.id} lineId={r.id} unit={stockUnitOf(r)} countedMilli={r.countedMilli} />
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="hidden p-0 lg:block">
            <HorizontalScrollRegion label="Stok sayım kalemleri, yatay kaydırılabilir" className="rounded-2xl">
            <table aria-label="Stok sayım kalemleri" className="w-full min-w-[680px] text-sm">
              <thead className={TABLE_HEAD}><tr><th scope="col" className="p-3 text-left">Ürün</th><th scope="col" className="p-3 text-right">Beklenen</th><th scope="col" className="p-3 text-right">Sapma</th><th scope="col" className="p-3 text-left">Sayım</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.lines.map((r) => {
                  const v = countVariance(core(r));
                  return (
                    <tr key={r.id} className={v != null && v !== 0 ? "bg-brand-soft/40" : ""}>
                      <td className="max-w-[20rem] p-3 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td>
                      <td className="p-3 text-right tabular">{formatQty(r.expectedMilli, stockUnitOf(r))}</td>
                      <td className={`p-3 text-right tabular ${v == null ? "text-muted" : v === 0 ? "text-ok" : "text-bad"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${formatQty(v, stockUnitOf(r))}`}</td>
                      <td className="p-3"><CountLineForm countId={data.open!.id} lineId={r.id} unit={stockUnitOf(r)} countedMilli={r.countedMilli} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </HorizontalScrollRegion>
          </Card>
          <Card className="p-4"><CloseCountForm countId={data.open.id} /></Card>
        </div>
      ) : (
        <div className="mb-6"><Panel title="Yeni sayım"><div className="flex flex-wrap items-center gap-3"><StartCountForm /><p className="text-sm text-muted">Stok takipli tüm ürünler satır olarak düşer; ara satışlar sayımın üstüne eklenir, sayım kapanınca mutlak değere oturur.</p></div></Panel></div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Son 8 kapanmış oturum">
          {data.past.length === 0 ? <Empty>Henüz kapanmış sayım yok.</Empty> : (
            <div className="divide-y divide-line text-sm">
              {data.past.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="tabular text-muted">{dt.format(p.closedAt ?? p.openedAt)}</span>
                  {p.note && <span className="text-muted">· {p.note}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Zayi (son 30 gün)">
          {waste.length === 0 ? <Empty>Bu dönemde fire kaydı yok.</Empty> : (
            <>
              <div className="divide-y divide-line text-sm">
                {waste.map((w) => (
                  <div key={w.productId} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-medium">{w.name}</span>
                    <span className="tabular text-bad">{formatQty(w.qtyMilli, w.unit)}</span>
                    <span className="ml-auto tabular text-muted">{w.cost != null ? money(w.cost) : "—"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-line pt-3 text-sm font-semibold">Toplam: <span className="tabular text-bad">{money(wasteTotal)}</span></div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
