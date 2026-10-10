// Zincir merkezi (HQ): şube başına bugün + son 7 gün. SuitableRMS karşısı — tek ekranda zincir.
import Link from "next/link";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { hqData, type HqData } from "@/lib/admin/hq";
import { formatTL } from "@/lib/core/money";
import { Card, Empty, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => { const n = new Date(); return { bas: iso(n), bit: iso(new Date(n.getTime() + 86_400_000)) }; };
const last7 = () => { const n = new Date(); return { bas: iso(new Date(n.getTime() - 6 * 86_400_000)), bit: iso(new Date(n.getTime() + 86_400_000)) }; };

function Table({ d }: { d: HqData }) {
  const pct = (v: number) => (d.total.sales ? `${Math.round((v / d.total.sales) * 100)}%` : "—");
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 font-medium">Şube</th>
            <th className="px-4 py-2.5 font-medium text-right">Ciro</th>
            <th className="px-4 py-2.5 font-medium text-right">Pay</th>
            <th className="px-4 py-2.5 font-medium text-right">Satış</th>
            <th className="px-4 py-2.5 font-medium text-right">Ortalama</th>
            <th className="px-4 py-2.5 font-medium text-right">Kâr*</th>
            <th className="px-4 py-2.5 font-medium text-right">İade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {d.branches.map((b) => (
            <tr key={b.storeId} className={b.sales === 0 ? "text-muted" : ""}>
              <td className="px-4 py-2.5 font-medium text-ink">{b.name}</td>
              <td className="px-4 py-2.5 text-right tabular">{formatTL(b.sales)}</td>
              <td className="px-4 py-2.5 text-right tabular text-muted">{pct(b.sales)}</td>
              <td className="px-4 py-2.5 text-right tabular">{b.count}</td>
              <td className="px-4 py-2.5 text-right tabular">{formatTL(b.avg)}</td>
              <td className="px-4 py-2.5 text-right tabular">{formatTL(b.profit)}{b.noCost > 0 && <span className="ml-1 text-xs text-muted" title="Maliyeti olmayan satır sayısı">({b.noCost}?)</span>}</td>
              <td className="px-4 py-2.5 text-right tabular">{b.refunds ? formatTL(b.refunds) : "—"}</td>
            </tr>
          ))}
          <tr className="bg-surface font-semibold">
            <td className="px-4 py-2.5">Konsolide</td>
            <td className="px-4 py-2.5 text-right tabular">{formatTL(d.total.sales)}</td>
            <td className="px-4 py-2.5 text-right tabular text-muted">100%</td>
            <td className="px-4 py-2.5 text-right tabular">{d.total.count}</td>
            <td className="px-4 py-2.5 text-right tabular">{formatTL(d.total.avg)}</td>
            <td className="px-4 py-2.5 text-right tabular">{formatTL(d.total.profit)}</td>
            <td className="px-4 py-2.5 text-right tabular">{d.total.refunds ? formatTL(d.total.refunds) : "—"}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-4 pb-3 pt-2 text-xs text-muted">* Kâr = ciro − satır maliyeti (donmuş alış maliyeti). Maliyeti olmayan satırlar (n?) kârdan düşülmez.</p>
    </Card>
  );
}

export default async function Hq() {
  const a = await requireAdmin();
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
              <p className="text-2xl font-bold tabular text-ink">{formatTL(bugun.total.sales)}</p>
              <p className="mt-1 text-sm text-muted">{bugun.total.count} satış · ortalama {formatTL(bugun.total.avg)} · kâr {formatTL(bugun.total.profit)}</p>
            </Panel>
            <Panel title="Son 7 gün">
              <p className="text-2xl font-bold tabular text-ink">{formatTL(yedi.total.sales)}</p>
              <p className="mt-1 text-sm text-muted">{yedi.total.count} satış · ortalama {formatTL(yedi.total.avg)} · kâr {formatTL(yedi.total.profit)}</p>
            </Panel>
          </div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Bugün — şube başına</h2>
          <div className="mb-6"><Table d={bugun} /></div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Son 7 gün — şube başına</h2>
          <div className="mb-6"><Table d={yedi} /></div>
          <Link href={`/yonetim/raporlar/konsolide?ay=${iso(new Date()).slice(0, 7)}`} className="text-sm text-brand hover:underline">Aylık konsolide rapor (PDF) →</Link>
        </>
      )}
    </>
  );
}
