// Zincir merkezi (HQ): şube başına bugün + son 7 gün. SuitableRMS karşısı — tek ekranda zincir.
import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { isBranchManager } from "@/lib/core/access";
import { hqData, type HqData } from "@/lib/admin/hq";
import { hqCriticalStock, hqOps, type CriticalStockRow, type StoreOps } from "@/lib/admin/hq-ops";
import { formatQty } from "@/lib/core/stock";
import { moneyFormatter } from "@/lib/admin/currency";
import { Badge, Card, Empty, PageHeader, Panel, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const today = () => { const n = new Date(); return { bas: iso(n), bit: iso(new Date(n.getTime() + 86_400_000)) }; };
const last7 = () => { const n = new Date(); return { bas: iso(new Date(n.getTime() - 6 * 86_400_000)), bit: iso(new Date(n.getTime() + 86_400_000)) }; };

function Table({ d, money }: { d: HqData; money: (k: number) => string }) {
  const pct = (v: number) => (d.total.sales ? `${Math.round((v / d.total.sales) * 100)}%` : "—");
  return (
    <>
    <Card className="overflow-hidden lg:hidden">
      <ul aria-label="Şube performansları" className="divide-y divide-line">
        {d.branches.map((b) => (
          <li key={b.storeId} className={`space-y-3 p-4 ${b.sales === 0 ? "text-muted" : ""}`}>
            <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold text-ink">{b.name}</h3><span className="shrink-0 text-xs tabular text-muted">{pct(b.sales)} ciro payı</span></div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div><dt className="text-xs text-muted">Ciro</dt><dd className="tabular font-medium">{money(b.sales)}</dd></div>
              <div><dt className="text-xs text-muted">Satış</dt><dd className="tabular">{b.count}</dd></div>
              <div><dt className="text-xs text-muted">Ortalama</dt><dd className="tabular">{money(b.avg)}</dd></div>
              <div><dt className="text-xs text-muted">Kâr*</dt><dd className="tabular">{money(b.profit)}</dd></div>
              <div><dt className="text-xs text-muted">İade</dt><dd className="tabular">{b.refunds ? money(b.refunds) : "—"}</dd></div>
            </dl>
            {b.noCost > 0 && <p className="text-xs text-muted">{b.noCost} satırın maliyeti yok; bu satırlar kâr hesabına dahil değil.</p>}
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-line bg-surface-2 p-4">
        <h3 className="font-semibold">Konsolide</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted">Ciro</dt><dd className="tabular font-medium">{money(d.total.sales)}</dd></div>
          <div><dt className="text-xs text-muted">Ciro payı</dt><dd className="tabular">100%</dd></div>
          <div><dt className="text-xs text-muted">Satış</dt><dd className="tabular">{d.total.count}</dd></div>
          <div><dt className="text-xs text-muted">Ortalama</dt><dd className="tabular">{money(d.total.avg)}</dd></div>
          <div><dt className="text-xs text-muted">Kâr*</dt><dd className="tabular">{money(d.total.profit)}</dd></div>
          <div><dt className="text-xs text-muted">İade</dt><dd className="tabular">{d.total.refunds ? money(d.total.refunds) : "—"}</dd></div>
        </dl>
      </div>
      <p className="px-4 pb-3 pt-2 text-xs text-muted">* Kâr = ciro − satır maliyeti (donmuş alış maliyeti). Maliyeti olmayan satırlar kâr hesabına dahil değil.</p>
    </Card>
    <Card className="hidden p-0 lg:block">
      <HorizontalScrollRegion label="Şube performansları, yatay kaydırılabilir" className="rounded-2xl">
      <table aria-label="Şube performansları" className="w-full min-w-[820px] text-sm">
        <thead className={TABLE_HEAD}>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">Şube</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">Ciro</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">Pay</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">Satış</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">Ortalama</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">Kâr*</th>
            <th scope="col" className="px-4 py-2.5 font-medium text-right">İade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {d.branches.map((b) => (
            <tr key={b.storeId} className={b.sales === 0 ? "text-muted" : ""}>
              <td className="px-4 py-2.5 font-medium text-ink">{b.name}</td>
              <td className="px-4 py-2.5 text-right tabular">{money(b.sales)}</td>
              <td className="px-4 py-2.5 text-right tabular text-muted">{pct(b.sales)}</td>
              <td className="px-4 py-2.5 text-right tabular">{b.count}</td>
              <td className="px-4 py-2.5 text-right tabular">{money(b.avg)}</td>
              <td className="px-4 py-2.5 text-right tabular">{money(b.profit)}{b.noCost > 0 && <span className="ml-1 text-xs text-muted" title="Maliyeti olmayan satır sayısı">({b.noCost} maliyetsiz)</span>}</td>
              <td className="px-4 py-2.5 text-right tabular">{b.refunds ? money(b.refunds) : "—"}</td>
            </tr>
          ))}
          <tr className="bg-surface font-semibold">
            <td className="px-4 py-2.5">Konsolide</td>
            <td className="px-4 py-2.5 text-right tabular">{money(d.total.sales)}</td>
            <td className="px-4 py-2.5 text-right tabular text-muted">100%</td>
            <td className="px-4 py-2.5 text-right tabular">{d.total.count}</td>
            <td className="px-4 py-2.5 text-right tabular">{money(d.total.avg)}</td>
            <td className="px-4 py-2.5 text-right tabular">{money(d.total.profit)}</td>
            <td className="px-4 py-2.5 text-right tabular">{d.total.refunds ? money(d.total.refunds) : "—"}</td>
          </tr>
        </tbody>
      </table>
      </HorizontalScrollRegion>
      <p className="px-4 pb-3 pt-2 text-xs text-muted">* Kâr = ciro − satır maliyeti (donmuş alış maliyeti). Maliyeti olmayan satırlar kâr hesabına dahil değil.</p>
    </Card>
    </>
  );
}


function OpsTable({ rows, money }: { rows: StoreOps[]; money: (k: number) => string }) {
  return (
    <>
      <Card className="overflow-hidden lg:hidden">
        <ul aria-label="Şube operasyon durumu" className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.storeId} className="space-y-2 p-4">
              <h3 className="break-words font-semibold text-ink">{r.name}</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted">Açık vardiya</dt><dd className="tabular">{r.openShifts || "—"}</dd></div>
                <div><dt className="text-xs text-muted">Bekleyen çağrı</dt><dd className="tabular">{r.openCalls ? <Badge tone="warn">{r.openCalls}</Badge> : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Açık adisyon</dt><dd className="tabular">{r.openTabs ? <><Badge tone="brand">{r.openTabs}</Badge> <span className="text-xs text-muted">{money(r.openTabRemaining)}</span></> : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Kritik stok</dt><dd className="tabular">{r.criticalStock ? <Badge tone="warn">{r.criticalStock}</Badge> : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Son satış</dt><dd className="tabular">{r.lastSaleAt ? dt.format(r.lastSaleAt) : "—"}</dd></div>
                <div><dt className="text-xs text-muted">Fire (30 gün)</dt><dd className="tabular">{r.waste30d ? money(r.waste30d) : "—"}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted">Cihaz / ajan</dt><dd className="tabular">{r.devices} cihaz{r.onlineAgents ? ` · ${r.onlineAgents} ajan çevrimiçi` : ""}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="hidden p-0 lg:block">
        <HorizontalScrollRegion label="Şube operasyon durumu, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Şube operasyon durumu" className="w-full min-w-[720px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">Şube</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Açık vardiya</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Bekleyen çağrı</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Açık adisyon</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Kritik stok</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Cihaz</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Ajan</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Son satış</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Fire (30 gün)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.storeId}>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.openShifts || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.openCalls ? <Badge tone="warn">{r.openCalls}</Badge> : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.openTabs ? <Badge tone="brand">{r.openTabs}</Badge> : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.criticalStock ? <Badge tone="warn">{r.criticalStock}</Badge> : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.devices}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.onlineAgents || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.lastSaleAt ? dt.format(r.lastSaleAt) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular">{r.waste30d ? money(r.waste30d) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollRegion>
      </Card>
    </>
  );
}


function CriticalTable({ rows }: { rows: CriticalStockRow[] }) {
  return (
    <>
      <Card className="overflow-hidden lg:hidden">
        <ul aria-label="Kritik stoklar" className="divide-y divide-line">
          {rows.map((r) => (
            <li key={`${r.storeId}-${r.productId}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="min-w-0 break-words font-medium text-ink">{r.name}</h3>
                <span className="shrink-0 text-xs text-muted">{r.storeName}</span>
              </div>
              <p className="text-sm text-bad">Stok {formatQty(r.level, r.unit)} · eşik {formatQty(r.minStock, r.unit)}</p>
              <Link href={`/yonetim/transferler?to=${r.storeId}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Bu şubeye transfer →</Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="hidden p-0 lg:block">
        <HorizontalScrollRegion label="Kritik stoklar, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Kritik stoklar" className="w-full min-w-[680px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">Ürün</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Şube</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Stok</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Eşik</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={`${r.storeId}-${r.productId}`}>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-muted">{r.storeName}</td>
                  <td className="px-4 py-2.5 text-right tabular text-bad">{formatQty(r.level, r.unit)}</td>
                  <td className="px-4 py-2.5 text-right tabular text-muted">{formatQty(r.minStock, r.unit)}</td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/yonetim/transferler?to=${r.storeId}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Bu şubeye transfer →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollRegion>
      </Card>
    </>
  );
}

export default async function Hq() {
  const a = await requireAdmin();
  if (isBranchManager(a)) redirect("/yonetim");
  const money = await moneyFormatter(a.tenantId);
  const [[bugun, yedi], ops, critical] = await withTenant(a.tenantId, async (tx) => Promise.all([
    Promise.all([hqData(tx, today()), hqData(tx, last7())]),
    hqOps(tx, a.tenantId),
    hqCriticalStock(tx),
  ]));
  return (
    <>
      <PageHeader
        title="Zincir yönetimi"
        desc="Tüm şubeler tek ekranda: bugün ve son 7 günün cirosu, ortalaması, kârı. Şube değiştirmek için üst şube seçicisini kullanın; aylık PDF için konsolide rapora gidin."
        actions={<Link href="/yonetim/depo" className="text-sm text-brand hover:underline">Merkez depo →</Link>}
      />
      {ops.length === 0 ? <Empty>Merkezi rapor için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline underline-offset-2">bir şube oluşturun</Link>.</Empty> : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Panel title="Bugün">
              <p className="text-2xl font-bold tabular text-ink">{money(bugun.total.sales)}</p>
              <p className="mt-1 text-sm text-muted">{bugun.total.count} satış · ortalama {money(bugun.total.avg)} · kâr {money(bugun.total.profit)}</p>
            </Panel>
            <Panel title="Son 7 gün">
              <p className="text-2xl font-bold tabular text-ink">{money(yedi.total.sales)}</p>
              <p className="mt-1 text-sm text-muted">{yedi.total.count} satış · ortalama {money(yedi.total.avg)} · kâr {money(yedi.total.profit)}</p>
            </Panel>
          </div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Canlı operasyon — şube durumu</h2>
          <div className="mb-6"><OpsTable rows={ops} money={money} /></div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Kritik stoklar — tüm şubeler</h2>
          <div className="mb-6">{critical.length === 0 ? <Card className="p-4 text-sm text-muted">Kritik seviyede stok yok.</Card> : <CriticalTable rows={critical} />}</div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Bugün — şube başına</h2>
          <div className="mb-6"><Table d={bugun} money={money} /></div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Son 7 gün — şube başına</h2>
          <div className="mb-6"><Table d={yedi} money={money} /></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/yonetim/transferler" className="text-sm text-brand hover:underline">Şubeler arası stok transferi →</Link>
            <Link href={`/yonetim/raporlar/konsolide?ay=${iso(new Date()).slice(0, 7)}`} className="text-sm text-brand hover:underline">Aylık konsolide rapor (PDF) →</Link>
          </div>
        </>
      )}
    </>
  );
}
