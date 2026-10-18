import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { formatQty, isCriticalRow, stockUnitOf } from "@/lib/admin/stock-view";
import { moneyFormatter } from "@/lib/admin/currency";
import { StockForm } from "@/components/admin/StockForm";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Badge, buttonClass, Card, Empty, Input, PageHeader, Panel, SplitView, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const KIND_LABEL = { satis: "Satış", iade: "İade", alis: "Alış", sayim: "Sayım", fire: "Fire", recete: "Reçete", uretim: "Üretim" } as const;
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const MOVE_PAGE_SIZE = 50;

export default async function Stok({ searchParams }: { searchParams: Promise<{ urun?: string; q?: string; kritik?: string; mvPage?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const { urun, q: rawQuery = "", kritik, mvPage } = await searchParams;
  const q = rawQuery.slice(0, 80);
  const requestedMovePage = Number(mvPage);
  const movePageNo = Number.isSafeInteger(requestedMovePage) && requestedMovePage > 0 ? requestedMovePage : 1;
  const M = schema.stockMovements;
  const { rows, moves, moveTotal, storeId } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    if (!storeId) return { rows: [], moves: [], moveTotal: 0, storeId: null };
    const movementWhere = and(eq(M.storeId, storeId), urun ? eq(M.productId, urun) : undefined);
    const [{ moveTotal }] = await tx.select({ moveTotal: count() }).from(M).where(movementWhere);
    const safeMovePage = Math.min(movePageNo, Math.max(1, Math.ceil(moveTotal / MOVE_PAGE_SIZE)));
    const [rows, moves] = await Promise.all([
      stockLevels(tx, storeId),
      tx.select({ id: M.id, kind: M.kind, qtyMilli: M.qtyMilli, at: M.at, note: M.note, name: schema.products.name, pkind: schema.products.kind, unit: schema.products.unit, sellable: schema.products.sellable }).from(M).innerJoin(schema.products, eq(schema.products.id, M.productId)).where(movementWhere).orderBy(desc(M.at)).limit(MOVE_PAGE_SIZE).offset((safeMovePage - 1) * MOVE_PAGE_SIZE),
    ]);
    return { rows, moves, moveTotal, storeId };
  });
  const needle = q.trim().toLocaleLowerCase("tr");
  const shown = rows.filter((r) => (!needle || r.name.toLocaleLowerCase("tr").includes(needle)) && (!kritik || isCriticalRow(r)));
  const critical = rows.filter(isCriticalRow).length;
  const value = rows.reduce((s, r) => s + (r.cost != null && r.level > 0 ? Math.round((r.cost * r.level) / 1000) : 0), 0);
  const sel = rows.find((r) => r.id === urun);
  const movementSuffix = `${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}${kritik ? "&kritik=1" : ""}`;
  const closePanelParams = new URLSearchParams();
  if (q.trim()) closePanelParams.set("q", q.trim());
  if (kritik) closePanelParams.set("kritik", "1");
  const closePanelHref = `/yonetim/stok${closePanelParams.size ? `?${closePanelParams.toString()}` : ""}`;
  const movePageCount = Math.max(1, Math.ceil(moveTotal / MOVE_PAGE_SIZE));
  const currentMovePage = Math.min(movePageNo, movePageCount);
  const firstMove = moveTotal === 0 ? 0 : (currentMovePage - 1) * MOVE_PAGE_SIZE + 1;
  const lastMove = Math.min(currentMovePage * MOVE_PAGE_SIZE, moveTotal);
  const movePageHref = (page: number) => {
    const params = new URLSearchParams();
    if (sel) params.set("urun", sel.id);
    if (q.trim()) params.set("q", q.trim());
    if (kritik) params.set("kritik", "1");
    params.set("mvPage", String(page));
    return `/yonetim/stok?${params.toString()}`;
  };
  return (
    <>
      <PageHeader title="Stok" desc="Stok takipli ürünler ve hammaddeler. Satışta reçeteye göre düşer; alış fişiyle girer; sayım o anki değeri yazar." />
      <SplitView
        panel={sel ? (
          <Panel title={sel.name} tone="edit" desc={<>Şu an: <span className="tabular">{formatQty(sel.level, sel.unit)}</span></>} action={<Link href={closePanelHref} className="text-sm text-muted hover:text-ink hover:underline">kapat</Link>}>
            <StockForm key={sel.id} productId={sel.id} unit={sel.unit} />
          </Panel>
        ) : (
          <Panel title="Sayım ve fire">
            <p className="text-sm text-muted">{storeId ? <>Listeden bir ürünün <b className="text-ink-2">Hareket</b> bağlantısına basın. Mal girişi: <Link href="/yonetim/alislar" className="font-medium text-brand hover:underline">Alışlar</Link>. Stok takibini ürün formundan açın.</> : <>Stok takibi için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</>}</p>
            <div className="mt-4 rounded-[10px] bg-surface-2 p-3">
              <div className="text-xs text-muted">Stok değeri</div>
              <div className="text-xl font-semibold tabular" data-testid="stock-value">{money(value)}</div>
            </div>
          </Panel>
        )}
        list={<>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="flex min-w-48 flex-1 items-end gap-2 sm:max-w-sm" role="search">
          <div className="min-w-0 flex-1"><Input name="q" defaultValue={q} maxLength={80} placeholder="Ürün ara" aria-label="Stokta ürün ara" />{kritik && <input type="hidden" name="kritik" value="1" />}</div>
          <button type="submit" className={buttonClass("secondary")}>Ara</button>
        </form>
        <Link href={kritik ? "/yonetim/stok" : "/yonetim/stok?kritik=1"} aria-current={kritik ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-[10px] border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${kritik ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>Yalnız kritikler ({critical})</Link>
        <span className="text-xs text-muted">{shown.length} ürün gösteriliyor</span>
        {sel && <span className="ml-auto shrink-0 text-sm text-muted">Stok değeri <b className="tabular text-ink" data-testid="stock-value">{money(value)}</b></span>}
      </div>
      {shown.length === 0 ? <Empty action={storeId && needle ? <Link href={kritik ? "/yonetim/stok?kritik=1" : "/yonetim/stok"} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 font-medium text-brand outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Aramayı temizle</Link> : undefined}>{!storeId ? <>Stok listesini görüntülemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</> : needle ? (kritik ? "Bu aramayla eşleşen kritik stok yok." : "Aramayla eşleşen stoklu ürün yok.") : kritik ? "Kritik stok yok." : "Stok takipli ürün yok."}</Empty> : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Stok durumu" className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id} className={`space-y-3 p-4 ${r.id === urun ? "bg-brand-soft/45" : isCriticalRow(r) ? "bg-bad-soft/35" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-words font-medium">{r.name}</p>{!r.sellable && <span className="text-xs text-muted">Hammadde</span>}</div>
                  {isCriticalRow(r) && <Badge tone="bad">Kritik</Badge>}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Stok</dt><dd className={`tabular ${r.level < 0 ? "font-medium text-bad" : ""}`}>{formatQty(r.level, r.unit)}</dd></div>
                  <div><dt className="text-xs text-muted">Maliyet</dt><dd className="tabular">{r.cost == null ? "—" : `${money(r.cost)}/${r.unit}`}</dd></div>
                  <div><dt className="text-xs text-muted">Stok değeri</dt><dd className="tabular">{r.cost == null || r.level <= 0 ? "—" : money(Math.round((r.cost * r.level) / 1000))}</dd></div>
                </dl>
                <div className="border-t border-line pt-2"><Link href={`/yonetim/stok?urun=${r.id}${movementSuffix}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Hareket</Link></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Stok durumu tablosu, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Stok durumu" className="w-full min-w-[680px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Ürün</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Stok</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Maliyet</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Değer</th><th scope="col" className="sticky right-0 z-20 bg-surface-2 px-4 py-2.5 text-right font-medium shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.45)]">Aksiyonlar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} data-testid={`stok-${r.name}`} className={`transition-colors hover:bg-surface-2 ${r.id === urun ? "bg-brand-soft/45" : isCriticalRow(r) ? "bg-bad-soft/35" : ""}`}>
                  <td className="max-w-[20rem] px-4 py-2.5 font-medium"><span className="block truncate" title={r.name}>{r.name}</span>{!r.sellable && <span className="ml-2 text-xs text-muted">hammadde</span>}{isCriticalRow(r) && <span className="ml-2" data-testid="stok-kritik"><Badge tone="bad">Kritik</Badge></span>}</td>
                  <td className={`tabular px-4 py-2.5 text-right ${r.level < 0 ? "font-medium text-bad" : ""}`} data-testid="stok-level">{formatQty(r.level, r.unit)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-muted">{r.cost == null ? "—" : `${money(r.cost)}/${r.unit}`}</td>
                  <td className="tabular px-4 py-2.5 text-right">{r.cost == null || r.level <= 0 ? "—" : money(Math.round((r.cost * r.level) / 1000))}</td>
                  <td className={`sticky right-0 px-4 py-2.5 text-right shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.35)] ${r.id === urun ? "bg-brand-soft/90" : isCriticalRow(r) ? "bg-bad-soft/90" : "bg-surface"}`}><Link href={`/yonetim/stok?urun=${r.id}${movementSuffix}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Hareket</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      <h2 className="mb-1 mt-8 font-semibold">{sel ? `${sel.name} hareketleri` : "Son stok hareketleri"}</h2>
      {moves.length > 0 && <p className="mb-3 text-sm text-muted">{firstMove}–{lastMove} / {moveTotal} hareket</p>}
      {moves.length === 0 ? <Empty>{storeId ? "Hareket yok." : <>Hareket geçmişini görüntülemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</>}</Empty> : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Son stok hareketleri" className="divide-y divide-line">
            {moves.map((m) => (
              <li key={m.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium">{m.name}</p><span className="shrink-0 text-sm text-muted">{KIND_LABEL[m.kind]}</span></div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><time className="text-muted">{dt.format(m.at)}</time><span className="tabular">{m.kind === "sayim" ? "= " : m.qtyMilli > 0 ? "+" : ""}{formatQty(m.qtyMilli, stockUnitOf({ ...m, kind: m.pkind }))}</span></div>
                {m.note && <p className="break-words text-sm text-muted">{m.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Son stok hareketleri, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Son stok hareketleri" className="w-full min-w-[720px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 text-left font-medium">Tarih</th><th scope="col" className="px-4 py-2.5 text-left font-medium">Tür</th><th scope="col" className="px-4 py-2.5 text-left font-medium">Ürün</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Miktar</th><th scope="col" className="px-4 py-2.5 text-left font-medium">Not</th></tr></thead>
            <tbody className="divide-y divide-line">
              {moves.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-surface-2">
                  <td className="tabular px-4 py-2.5 text-muted">{dt.format(m.at)}</td>
                  <td className="px-4 py-2.5">{KIND_LABEL[m.kind]}</td>
                  <td className="max-w-[16rem] px-4 py-2.5 font-medium"><span className="block truncate" title={m.name}>{m.name}</span></td>
                  <td className="tabular px-4 py-2.5 text-right">{m.kind === "sayim" ? "= " : m.qtyMilli > 0 ? "+" : ""}{formatQty(m.qtyMilli, stockUnitOf({ ...m, kind: m.pkind }))}</td>
                  <td className="max-w-[18rem] px-4 py-2.5 text-muted"><span className="block truncate" title={m.note ?? ""}>{m.note ?? ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      {movePageCount > 1 && <nav aria-label="Stok hareketleri sayfaları" className="mt-4 flex items-center justify-between gap-3">
        {currentMovePage > 1 ? <Link href={movePageHref(currentMovePage - 1)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
        <span className="text-sm text-muted">Sayfa {currentMovePage} / {movePageCount}</span>
        {currentMovePage < movePageCount ? <Link href={movePageHref(currentMovePage + 1)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
      </nav>}
      </>} />
    </>
  );
}
