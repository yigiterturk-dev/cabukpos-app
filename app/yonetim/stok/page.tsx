import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { firstStoreId, stockLevels } from "@/lib/admin/stock";
import { formatQty, isCriticalRow, stockUnitOf } from "@/lib/admin/stock-view";
import { formatTL } from "@/lib/core/money";
import { StockForm } from "@/components/admin/StockForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const KIND_LABEL = { satis: "Satış", iade: "İade", alis: "Alış", sayim: "Sayım", fire: "Fire", recete: "Reçete", uretim: "Üretim" } as const;
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Stok({ searchParams }: { searchParams: Promise<{ urun?: string; q?: string; kritik?: string }> }) {
  const a = await requireAdmin();
  const { urun, q = "", kritik } = await searchParams;
  const M = schema.stockMovements;
  const { rows, moves } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await firstStoreId(tx);
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
  return (
    <>
      <PageHeader title="Stok" desc="Stok takipli ürünler ve hammaddeler. Satışta reçeteye göre düşer; alış fişiyle girer; sayım o anki değeri yazar." />
      <Card className="mb-6 p-5">
        {sel ? (
          <>
            <h2 className="mb-1 font-semibold">{sel.name}</h2>
            <p className="mb-4 text-sm text-muted">Şu an: <span className="tabular">{formatQty(sel.level, sel.unit)}</span> · <Link href="/yonetim/stok" className="underline">kapat</Link></p>
            <StockForm key={sel.id} productId={sel.id} unit={sel.unit} />
          </>
        ) : <p className="text-sm text-muted">Sayım ya da fire için listeden bir ürünün <b>Hareket</b> bağlantısına basın. Mal girişi: <Link href="/yonetim/alislar" className="text-brand underline">Alışlar</Link>. Stok takibini ürün formundan açın.</p>}
      </Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form><input name="q" defaultValue={q} placeholder="Ürün ara" aria-label="Stokta ürün ara" className="w-full max-w-sm rounded-lg border border-line px-3 py-2 text-sm" />{kritik && <input type="hidden" name="kritik" value="1" />}</form>
        <Link href={kritik ? "/yonetim/stok" : "/yonetim/stok?kritik=1"} aria-pressed={Boolean(kritik)} className={`rounded-lg border px-3 py-2 text-sm ${kritik ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>Yalnız kritikler ({critical})</Link>
        <span className="ml-auto text-sm text-muted">Stok değeri <b className="tabular text-stone-900" data-testid="stock-value">{formatTL(value)}</b></span>
      </div>
      {shown.length === 0 ? <Empty>{kritik ? "Kritik stok yok." : "Stok takipli ürün yok."}</Empty> : (
        <Card className="mb-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted"><tr><th className="p-3 font-medium">Ürün</th><th className="p-3 text-right font-medium">Stok</th><th className="p-3 text-right font-medium">Maliyet</th><th className="p-3 text-right font-medium">Değer</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} data-testid={`stok-${r.name}`}>
                  <td className="p-3 font-medium">{r.name}{!r.sellable && <span className="ml-2 text-xs text-muted">hammadde</span>}{isCriticalRow(r) && <span className="ml-2" data-testid="stok-kritik"><Badge tone="bad">Kritik</Badge></span>}</td>
                  <td className={`tabular p-3 text-right ${r.level < 0 ? "font-medium text-red-700" : ""}`} data-testid="stok-level">{formatQty(r.level, r.unit)}</td>
                  <td className="tabular p-3 text-right text-muted">{r.cost == null ? "—" : `${formatTL(r.cost)}/${r.unit}`}</td>
                  <td className="tabular p-3 text-right">{r.cost == null || r.level <= 0 ? "—" : formatTL(Math.round((r.cost * r.level) / 1000))}</td>
                  <td className="p-3 text-right"><Link href={`/yonetim/stok?urun=${r.id}`} className="text-brand underline">Hareket</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <h2 className="mb-3 font-semibold">Son hareketler</h2>
      {moves.length === 0 ? <Empty>Hareket yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="tabular p-3 text-muted">{dt.format(m.at)}</td>
                  <td className="p-3">{KIND_LABEL[m.kind]}</td>
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="tabular p-3 text-right">{m.kind === "sayim" ? "= " : m.qtyMilli > 0 ? "+" : ""}{formatQty(m.qtyMilli, stockUnitOf({ ...m, kind: m.pkind }))}</td>
                  <td className="p-3 text-muted">{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
