import Link from "next/link";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { moneyFormatter } from "@/lib/admin/currency";
import { Badge, Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { reportHref } from "./RangeBar";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const PAGE_SIZE = 50;

export async function ShiftsTab({ tenantId, storeId, page = 1 }: { tenantId: string; storeId: string | null; page?: number }) {
  const money = await moneyFormatter(tenantId);
  const sh = schema.shifts, s = schema.sales;
  const { rows, total } = await withTenant(tenantId, async (tx) => {
    const storeFilter = storeId ? eq(schema.devices.storeId, storeId) : sql`false`;
    const [{ total }] = await tx.select({ total: count() }).from(sh).innerJoin(schema.devices, eq(schema.devices.id, sh.deviceId)).where(storeFilter);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
    const shifts = await tx.select({
      id: sh.id, openedAt: sh.openedAt, closedAt: sh.closedAt, countedCash: sh.countedCash, expectedCash: sh.expectedCash,
      device: schema.devices.name, opener: schema.staff.name,
    }).from(sh)
      .innerJoin(schema.devices, eq(schema.devices.id, sh.deviceId))
      .innerJoin(schema.staff, eq(schema.staff.id, sh.openedBy))
      .where(storeFilter)
      .orderBy(desc(sh.openedAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    const sales = shifts.length ? await tx.select({
      shiftId: s.shiftId,
      gross: sql<number>`coalesce(sum(case when ${s.status} = 'iade' then -(${s.total} - ${s.discount}) else ${s.total} - ${s.discount} end), 0)::int`,
      count: sql<number>`count(*) filter (where ${s.status} = 'kapandi')::int`,
      refundCount: sql<number>`count(*) filter (where ${s.status} = 'iade')::int`,
    }).from(s).where(and(inArray(s.shiftId, shifts.map((r) => r.id)), inArray(s.status, ["kapandi", "iade"]))).groupBy(s.shiftId) : [];
    const totals = new Map(sales.map((r) => [r.shiftId, r]));
    return { total, rows: shifts.map((r) => ({ ...r, gross: totals.get(r.id)?.gross ?? 0, count: totals.get(r.id)?.count ?? 0, refundCount: totals.get(r.id)?.refundCount ?? 0 })) };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  return (
    <>
      {rows.length === 0 ? <Empty>Henüz vardiya yok. Kasada vardiya açılınca burada görünür.</Empty> : (
        <>
        <div className="grid gap-3 lg:hidden">
          {rows.map((r) => {
            const diff = r.countedCash !== null && r.expectedCash !== null ? r.countedCash - r.expectedCash : null;
            return (
              <Card key={r.id} className="min-w-0 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <Link href={`/yonetim/raporlar/${r.id}`} className="inline-flex min-h-11 items-center rounded px-1 font-semibold underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.device}</Link>
                  {r.closedAt ? <time className="text-sm text-muted">{dt(r.closedAt)}</time> : <Badge tone="brand">Açık</Badge>}
                </div>
                <p className="text-sm text-muted">Açan: {r.opener} · {dt(r.openedAt)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
                  <ShiftMetric label="Satış · iade" value={`${r.count} · ${r.refundCount}`} />
                  <ShiftMetric label="Ciro (net iade)" value={money(r.gross)} />
                  <div className="col-span-2"><ShiftMetric label="Kasa farkı" value={diff === null ? (r.closedAt ? "Hesaplanamadı" : "Kapanışta hesaplanır") : `${diff < 0 ? "−" : diff > 0 ? "+" : ""}${money(Math.abs(diff))}`} className={diff === null ? "text-muted" : diff < 0 ? "text-bad" : diff > 0 ? "text-ok" : ""} /></div>
                </dl>
              </Card>
            );
          })}
        </div>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Vardiya raporları, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Vardiya raporları" className="w-full min-w-[760px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr>{["Cihaz", "Açan", "Açılış", "Kapanış", "Satış · iade", "Ciro (net iade)", "Fark"].map((h, i) => <th scope="col" key={h} className={`px-4 py-2.5 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const diff = r.countedCash !== null && r.expectedCash !== null ? r.countedCash - r.expectedCash : null;
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5"><Link href={`/yonetim/raporlar/${r.id}`} className="rounded px-1 font-medium underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.device}</Link></td>
                    <td className="px-4 py-2.5">{r.opener}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.openedAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.closedAt ? dt(r.closedAt) : <Badge tone="brand">Açık</Badge>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count} · {r.refundCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.gross)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${diff === null ? "text-muted" : diff < 0 ? "text-bad" : diff > 0 ? "text-ok" : ""}`}>{diff === null ? (r.closedAt ? "Hesaplanamadı" : "Kapanışta hesaplanır") : `${diff < 0 ? "−" : diff > 0 ? "+" : ""}${money(Math.abs(diff))}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      {pageCount > 1 && <nav aria-label="Vardiya raporları sayfaları" className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} / {total} vardiya</span>
        <div className="flex gap-2">
          <PageLink href={safePage > 1 ? reportHref("vardiyalar", undefined, { page: String(safePage - 1) }) : undefined} label="Önceki" />
          <PageLink href={safePage < pageCount ? reportHref("vardiyalar", undefined, { page: String(safePage + 1) }) : undefined} label="Sonraki" />
        </div>
      </nav>}
    </>
  );
}

function PageLink({ href, label }: { href?: string; label: string }) {
  return href ? <Link href={href} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{label}</Link>
    : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm text-muted opacity-50">{label}</span>;
}

function ShiftMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className={`font-medium tabular-nums ${className}`}>{value}</dd></div>;
}
