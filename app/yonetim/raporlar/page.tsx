import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { signedTL } from "@/components/ShiftReport";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Raporlar() {
  const a = await requireAdmin();
  const sh = schema.shifts, s = schema.sales;
  const rows = await withTenant(a.tenantId, (tx) =>
    tx.select({
      id: sh.id, openedAt: sh.openedAt, closedAt: sh.closedAt, countedCash: sh.countedCash, expectedCash: sh.expectedCash,
      device: schema.devices.name, opener: schema.staff.name,
      gross: sql<number>`coalesce((select sum(${s.total}) from ${s} where ${s.shiftId} = ${sh.id} and ${s.status} = 'kapandi'), 0)::int`,
      count: sql<number>`(select count(*) from ${s} where ${s.shiftId} = ${sh.id} and ${s.status} = 'kapandi')::int`,
    })
      .from(sh)
      .innerJoin(schema.devices, eq(schema.devices.id, sh.deviceId))
      .innerJoin(schema.staff, eq(schema.staff.id, sh.openedBy))
      .orderBy(desc(sh.openedAt))
      .limit(200),
  );
  return (
    <>
      <PageHeader title="Raporlar" desc="Vardiya (gün sonu) raporları. Son 200 vardiya." />
      {rows.length === 0 ? <Empty>Henüz vardiya yok. Kasada vardiya açılınca burada görünür.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>{["Cihaz", "Açan", "Açılış", "Kapanış", "Satış", "Ciro", "Fark"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const diff = r.countedCash !== null && r.expectedCash !== null ? r.countedCash - r.expectedCash : null;
                return (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5"><Link href={`/yonetim/raporlar/${r.id}`} className="font-medium underline">{r.device}</Link></td>
                    <td className="px-4 py-2.5">{r.opener}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.openedAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.closedAt ? dt(r.closedAt) : <Badge tone="brand">Açık</Badge>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTL(r.gross)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${diff === null ? "text-muted" : diff < 0 ? "text-red-700" : diff > 0 ? "text-emerald-700" : ""}`}>{diff === null ? "—" : signedTL(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
