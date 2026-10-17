// Zincir merkezi (HQ): şube başına bugün + son 7 gün. SuitableRMS karşısı — tek ekranda zincir.
import Link from "next/link";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { hqData, type HqData } from "@/lib/admin/hq";
import { moneyFormatter } from "@/lib/admin/currency";
import { Card, Empty, PageHeader, Panel, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
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
      <table aria-label="Şube performansları" className="w-full min-w-[720px] text-sm">
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

export default async function Hq() {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const [bugun, yedi] = await withTenant(a.tenantId, async (tx) => Promise.all([
    hqData(tx, today()),
    hqData(tx, last7()),
  ]));
  const stores = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores));
  return (
    <>
      <PageHeader
        title="Zincir merkezi (HQ)"
        desc="Tüm şubeler tek ekranda: bugün ve son 7 günün cirosu, ortalaması, kârı. Şube değiştirmek için üst şube seçicisini kullanın; aylık PDF için konsolide rapora gidin."
      />
      {stores.length === 0 ? <Empty>Henüz şube yok.</Empty> : (
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Bugün — şube başına</h2>
          <div className="mb-6"><Table d={bugun} money={money} /></div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Son 7 gün — şube başına</h2>
          <div className="mb-6"><Table d={yedi} money={money} /></div>
          <Link href={`/yonetim/raporlar/konsolide?ay=${iso(new Date()).slice(0, 7)}`} className="text-sm text-brand hover:underline">Aylık konsolide rapor (PDF) →</Link>
        </>
      )}
    </>
  );
}
