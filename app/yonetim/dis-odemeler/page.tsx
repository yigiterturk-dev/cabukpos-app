import { and, desc, gte, lt } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { paymentMonth } from "@/lib/integrations/payments";
import { formatMoney, isCurrency } from "@/lib/core/money";
import { Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { nakit: "Nakit", kart: "Kart", havale: "Havale", other: "Diğer" };
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });

export default async function ExternalPayments({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const a = await requireAdmin();
  const { ay } = await searchParams;
  const { label, from, to } = paymentMonth(ay);
  const [rows, stores] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(schema.externalPayments)
      .where(and(gte(schema.externalPayments.paidAt, from), lt(schema.externalPayments.paidAt, to)))
      .orderBy(desc(schema.externalPayments.paidAt)).limit(1000),
    tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
  ]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <>
      <PageHeader title="Dış ödemeler" desc="YanındaPOS gibi dış sistemlerden gelen tamamlanmış ödeme özetleri. Satış veya mali belge değildir; yalnız mutabakat referansıdır." />
      <Card className="mb-5 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="block text-xs text-muted">Ay</span>
            <input type="month" name="ay" required defaultValue={label} className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 lg:text-sm" />
          </label>
          <button className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Göster</button>
          <a href={`/yonetim/dis-odemeler/csv?ay=${label}`} download className="inline-flex min-h-11 items-center rounded-[10px] bg-brand px-4 font-medium text-white outline-none hover:opacity-90 focus-visible:ring-4 focus-visible:ring-brand-ring/60">CSV indir</a>
          <span className="text-sm text-muted">Toplam: <strong>{formatMoney(total)}</strong></span>
        </form>
      </Card>
      {rows.length === 0 ? <Empty>Bu ay için dış ödeme kaydı yok. YanındaPOS bağlantısı ödeme özeti gönderdiğinde burada görünür.</Empty> : (
        <Card className="p-0">
          <div className="p-4"><h2 className="font-semibold">{label} · {rows.length} kayıt</h2></div>
          <HorizontalScrollRegion label="Dış ödemeler, yatay kaydırılabilir">
            <table aria-label="Dış ödemeler" className="w-full min-w-[760px] text-sm">
              <thead className={TABLE_HEAD}><tr>{["Ödeme zamanı", "Kaynak", "Dış kimlik", "Yöntem", "Tutar", "Şube", "Referans"].map((h) => <th scope="col" key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">{dt(r.paidAt)}</td>
                    <td className="px-4 py-2.5">{r.source}</td>
                    <td className="max-w-[16rem] truncate px-4 py-2.5 font-mono text-xs" title={r.externalId}>{r.externalId}</td>
                    <td className="px-4 py-2.5">{METHOD[r.method] ?? r.method}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.amount, isCurrency(r.currency) ? r.currency : "TRY")}</td>
                    <td className="px-4 py-2.5">{r.storeId ? storeNames.get(r.storeId) ?? "—" : "—"}</td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5" title={r.reference ?? ""}>{r.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScrollRegion>
        </Card>
      )}
    </>
  );
}
