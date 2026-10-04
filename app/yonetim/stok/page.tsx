import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { formatQty, isCriticalRow, stockUnitOf } from "@/lib/admin/stock-view";
import { formatTL } from "@/lib/core/money";
import { StockForm } from "@/components/admin/StockForm";
import { Badge, Card, Empty, Input, PageHeader, Panel, SplitView, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const KIND_LABEL = { satis: "Satış", iade: "İade", alis: "Alış", sayim: "Sayım", fire: "Fire", recete: "Reçete", uretim: "Üretim" } as const;
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Stok({ searchParams }: { searchParams: Promise<{ urun?: string; q?: string; kritik?: string }> }) {
  const a = await requireAdmin();
  const { urun, q = "", kritik } = await searchParams;
  const M = schema.stockMovements;
  const { rows, moves } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    if (!storeId) return { rows: [], moves: [] };
    const [rows, moves] = await Promise.all([
      stockLevels(tx, storeId),
      tx.select({ id: M.id, kind: M.kind, qtyMilli: M.qtyMilli, at: M.at, note: M.note, name: schema.products.name, pkind: schema.products.kind, unit: schema.products.unit, sellable: schema.products.sellable }).from(M).innerJoin(schema.products, eq(schema.products.id, M.productId)).orderBy(desc(M.at)).limit(50),
    ]);
    return { rows, moves };
  });
  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = rows.filter((r) => (!needle || r.name.toLocaleLowerCase("tr").includes(needle)) && (!kritik || isCriticalRow(r)));
  const critical = rows.filter(isCriticalRow).length;
  const value = rows.reduce((s, r) => s + (r.cost != null && r.level > 0 ? Math.round((r.cost * r.level) / 1000) : 0), 0);
  const sel = rows.find((r) => r.id === urun);
  const movementSuffix = `${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}${kritik ? "&kritik=1" : ""}`;
  return (
    <>
      <PageHeader title="Stok" desc="Stok takipli ürünler ve hammaddeler. Satışta reçeteye göre düşer; alış fişiyle girer; sayım o anki değeri yazar." />
      <SplitView
        panel={sel ? (
          <Panel title={sel.name} tone="edit" desc={<>Şu an: <span className="tabular">{formatQty(sel.level, sel.unit)}</span></>} action={<Link href="/yonetim/stok" className="text-sm text-muted hover:text-ink hover:underline">kapat</Link>}>
            <StockForm key={sel.id} productId={sel.id} unit={sel.unit} />
          </Panel>
        ) : (
          <Panel title="Sayım ve fire">
            <p className="text-sm text-muted">Listeden bir ürünün <b className="text-ink-2">Hareket</b> bağlantısına basın. Mal girişi: <Link href="/yonetim/alislar" className="font-medium text-brand hover:underline">Alışlar</Link>. Stok takibini ürün formundan açın.</p>
            <div className="mt-4 rounded-[10px] bg-surface-2 p-3">
              <div className="text-xs text-muted">Stok değeri</div>
              <div className="text-xl font-semibold tabular" data-testid="stock-value">{formatTL(value)}</div>
            </div>
          </Panel>
        )}
        list={<>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="min-w-48 flex-1 sm:max-w-sm"><Input name="q" defaultValue={q} placeholder="Ürün ara" aria-label="Stokta ürün ara" />{kritik && <input type="hidden" name="kritik" value="1" />}</form>
        <Link href={kritik ? "/yonetim/stok" : "/yonetim/stok?kritik=1"} aria-pressed={Boolean(kritik)} className={`rounded-[10px] border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${kritik ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>Yalnız kritikler ({critical})</Link>
        <span className="text-xs text-muted">{shown.length} ürün gösteriliyor</span>
        {sel && <span className="ml-auto text-sm text-muted">Stok değeri <b className="tabular text-ink" data-testid="stock-value">{formatTL(value)}</b></span>}
      </div>
      {shown.length === 0 ? <Empty>{kritik ? "Kritik stok yok." : "Stok takipli ürün yok."}</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD}><tr><th className="px-4 py-2.5 font-medium">Ürün</th><th className="px-4 py-2.5 text-right font-medium">Stok</th><th className="px-4 py-2.5 text-right font-medium">Maliyet</th><th className="px-4 py-2.5 text-right font-medium">Değer</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} data-testid={`stok-${r.name}`} className={`transition-colors hover:bg-surface-2 ${isCriticalRow(r) ? "bg-bad-soft/35" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{r.name}{!r.sellable && <span className="ml-2 text-xs text-muted">hammadde</span>}{isCriticalRow(r) && <span className="ml-2" data-testid="stok-kritik"><Badge tone="bad">Kritik</Badge></span>}</td>
                  <td className={`tabular px-4 py-2.5 text-right ${r.level < 0 ? "font-medium text-bad" : ""}`} data-testid="stok-level">{formatQty(r.level, r.unit)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-muted">{r.cost == null ? "—" : `${formatTL(r.cost)}/${r.unit}`}</td>
                  <td className="tabular px-4 py-2.5 text-right">{r.cost == null || r.level <= 0 ? "—" : formatTL(Math.round((r.cost * r.level) / 1000))}</td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/yonetim/stok?urun=${r.id}${movementSuffix}`} className="font-medium text-brand hover:underline">Hareket</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <h2 className="mb-3 mt-8 font-semibold">Son hareketler</h2>
      {moves.length === 0 ? <Empty>Hareket yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {moves.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-surface-2">
                  <td className="tabular px-4 py-2.5 text-muted">{dt.format(m.at)}</td>
                  <td className="px-4 py-2.5">{KIND_LABEL[m.kind]}</td>
                  <td className="px-4 py-2.5 font-medium">{m.name}</td>
                  <td className="tabular px-4 py-2.5 text-right">{m.kind === "sayim" ? "= " : m.qtyMilli > 0 ? "+" : ""}{formatQty(m.qtyMilli, stockUnitOf({ ...m, kind: m.pkind }))}</td>
                  <td className="px-4 py-2.5 text-muted">{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </>} />
    </>
  );
}
