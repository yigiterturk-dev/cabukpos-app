import Link from "next/link";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
import { formatPhone, normalizePhone } from "@/lib/core/delivery";
import { RES_LABEL } from "@/lib/core/reservation";
import { buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { ReservationForm, ResStatusButtons } from "@/components/admin/ReservationForms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Rezervasyonlar — ÇabukPOS" };

const DAY = 86_400_000;

export default async function Rezervasyonlar({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const gun = isValidCalendarDay(sp.gun) ? sp.gun : istToday();
  const rows = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId, a.storeId);
    const from = new Date(`${gun}T00:00:00+03:00`);
    return {
      list: await tx.select().from(schema.reservations)
        .where(and(eq(schema.reservations.tenantId, a.tenantId), storeId ? eq(schema.reservations.storeId, storeId) : sql`false`, gte(schema.reservations.at, from), lt(schema.reservations.at, new Date(from.getTime() + DAY))))
        .orderBy(schema.reservations.at),
      storeId,
    };
  });
  const tables = rows.storeId ? await withTenant(a.tenantId, (tx) => tx.select({ id: schema.tables.id, name: schema.tables.name, areaName: schema.areas.name })
    .from(schema.tables).innerJoin(schema.areas, eq(schema.tables.areaId, schema.areas.id)).where(eq(schema.areas.storeId, rows.storeId!))
    .orderBy(asc(schema.areas.name), asc(schema.tables.name))) : [];
  const tableNames = new Map(tables.map((table) => [table.id, `${table.areaName} · ${table.name}`]));
  const fmt = (at: Date) => at.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  return (
    <>
      <PageHeader title="Rezervasyonlar" desc="Günün rezervasyonları; onayla, geldi/gelmedi işaretle. Kasa salonunda masa durumuyla birlikte ilerler." />
      <Link href="/yonetim/rezervasyonlar/ayarlar" className="mb-4 inline-flex min-h-11 items-center font-semibold text-brand underline">Masa kapasitesi ve çevrimiçi rezervasyon ayarları →</Link>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form action="/yonetim/rezervasyonlar" method="get" className="flex flex-wrap items-end gap-2">
          <label htmlFor="reservation-day" className="text-sm font-medium text-ink-2">Tarih
            <input id="reservation-day" name="gun" type="date" value={gun} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
          </label>
          <button type="submit" className={buttonClass("secondary")}>Günü aç</button>
        </form>
        <nav aria-label="Hızlı gün seçimi" className="flex flex-wrap gap-1">
          {[-1, 0, 1, 2].map((o) => {
            const d = istToday(undefined, o);
            return <Link key={d} href={`/yonetim/rezervasyonlar?gun=${d}`} aria-current={d === gun ? "date" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${d === gun ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{o === 0 ? "Bugün" : o === -1 ? "Dün" : o === 1 ? "Yarın" : d}</Link>;
          })}
        </nav>
      </div>
      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold">Yeni rezervasyon</h2>
        <ReservationForm storeId={rows.storeId} day={gun} tables={tables} />
      </Card>
      {rows.list.length === 0 ? <Empty>{rows.storeId ? "Bu gün için rezervasyon yok." : <>Rezervasyonları görüntülemek için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</>}</Empty> : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Günlük rezervasyonlar" className="divide-y divide-line">
            {rows.list.map((r) => {
              const phone = normalizePhone(r.phone);
              return <li key={r.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{r.name}</p>
                    <p className="mt-1 text-sm text-muted"><time dateTime={r.at.toISOString()}>{fmt(r.at)}</time> · {r.guests} kişi · Masa: {r.tableId ? tableNames.get(r.tableId) ?? "Masa bulunamadı" : "Atanmadı"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">{RES_LABEL[r.status]}</span>
                </div>
                {phone ? <a href={`tel:+${phone}`} aria-label={`Ara ${r.name}, ${formatPhone(phone)}`} className="inline-flex min-h-11 items-center tabular text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{formatPhone(phone)}</a> : <span className="inline-flex min-h-11 items-center tabular text-sm text-muted">{r.phone}</span>}
                {r.note && <p className="break-words text-sm text-muted">{r.note}</p>}
                <div className="border-t border-line pt-2"><ResStatusButtons id={r.id} name={r.name} status={r.status} /></div>
              </li>;
            })}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Günlük rezervasyonlar, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Günlük rezervasyonlar" className="w-full min-w-[800px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="py-2 pr-4 font-medium">Saat</th><th scope="col" className="py-2 pr-4 font-medium">İsim</th><th scope="col" className="py-2 pr-4 font-medium">Kişi</th><th scope="col" className="py-2 pr-4 font-medium">Masa</th><th scope="col" className="py-2 pr-4 font-medium">Telefon</th><th scope="col" className="py-2 pr-4 font-medium">Not</th><th scope="col" className="py-2 font-medium">Durum</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.list.map((r) => {
                const phone = normalizePhone(r.phone);
                return (
                <tr key={r.id} data-testid="res-row">
                  <td className="py-2 pr-4 tabular">{fmt(r.at)}</td>
                  <td className="max-w-[14rem] py-2 pr-4 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td>
                  <td className="py-2 pr-4 tabular">{r.guests}</td>
                  <td className="py-2 pr-4">{r.tableId ? tableNames.get(r.tableId) ?? "Masa bulunamadı" : "Atanmadı"}</td>
                  <td className="py-2 pr-4 tabular">{phone ? <a href={`tel:+${phone}`} aria-label={`Ara ${r.name}, ${formatPhone(phone)}`} className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{formatPhone(phone)}</a> : r.phone}</td>
                  <td className="max-w-[20rem] py-2 pr-4 text-muted"><span className="block truncate" title={r.note ?? ""}>{r.note ?? ""}</span></td>
                  <td className="py-2"><ResStatusButtons id={r.id} name={r.name} status={r.status} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
    </>
  );
}
