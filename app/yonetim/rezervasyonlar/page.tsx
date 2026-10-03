import Link from "next/link";
import { and, eq, gte, lt } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { istToday } from "@/lib/core/report";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ReservationForm, ResStatusButtons } from "@/components/admin/ReservationForms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Rezervasyonlar — ÇabukPOS" };

const DAY = 86_400_000;

export default async function Rezervasyonlar({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const gun = /^\d{4}-\d{2}-\d{2}$/.test(sp.gun ?? "") ? sp.gun! : istToday();
  const rows = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    const from = new Date(`${gun}T00:00:00+03:00`);
    return {
      list: await tx.select().from(schema.reservations)
        .where(and(eq(schema.reservations.tenantId, a.tenantId), gte(schema.reservations.at, from), lt(schema.reservations.at, new Date(from.getTime() + DAY))))
        .orderBy(schema.reservations.at),
      stores: await tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
      storeId,
    };
  });
  const tables = rows.storeId ? (await withTenant(a.tenantId, (tx) => tx.select({ id: schema.tables.id, name: schema.tables.name, storeId: schema.areas.storeId }).from(schema.tables).innerJoin(schema.areas, eq(schema.tables.areaId, schema.areas.id)))).filter((t) => t.storeId === rows.storeId) : [];
  const fmt = (at: Date) => at.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  return (
    <>
      <PageHeader title="Rezervasyonlar" desc="Günün rezervasyonları; onayla, geldi/gelmedi işaretle. Kasa salonunda masa durumuyla birlikte ilerler." />
      <div className="mb-4 flex flex-wrap gap-1" aria-label="Gün">
        {[-1, 0, 1, 2].map((o) => {
          const d = istToday(undefined, o);
          return <Link key={d} href={`/yonetim/rezervasyonlar?gun=${d}`} aria-current={d === gun ? "true" : undefined} className={`rounded-lg border px-3 py-1.5 text-sm ${d === gun ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{o === 0 ? "Bugün" : o === -1 ? "Dün" : o === 1 ? "Yarın" : d}</Link>;
        })}
      </div>
      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold">Yeni rezervasyon</h2>
        <ReservationForm stores={rows.stores} day={gun} tables={tables} />
      </Card>
      {rows.list.length === 0 ? <Empty>Bu gün için rezervasyon yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 pr-4 font-medium">Saat</th><th className="py-2 pr-4 font-medium">İsim</th><th className="py-2 pr-4 font-medium">Kişi</th><th className="py-2 pr-4 font-medium">Telefon</th><th className="py-2 pr-4 font-medium">Not</th><th className="py-2 font-medium">Durum</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.list.map((r) => (
                <tr key={r.id} data-testid="res-row">
                  <td className="py-2 pr-4 tabular">{fmt(r.at)}</td>
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 tabular">{r.guests}</td>
                  <td className="py-2 pr-4 tabular">{r.phone}</td>
                  <td className="py-2 pr-4 text-muted">{r.note ?? ""}</td>
                  <td className="py-2"><ResStatusButtons id={r.id} status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
