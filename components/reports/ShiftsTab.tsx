import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { formatTL } from "@/lib/core/money";
import { signedTL } from "@/components/ShiftReport";
import { Badge, Card, Empty } from "@/components/ui";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export async function ShiftsTab({ tenantId }: { tenantId: string }) {
  const sh = schema.shifts, s = schema.sales;
  const rows = await withTenant(tenantId, async (tx) => {
    const shifts = await tx.select({
      id: sh.id, openedAt: sh.openedAt, closedAt: sh.closedAt, countedCash: sh.countedCash, expectedCash: sh.expectedCash,
      device: schema.devices.name, opener: schema.staff.name,
    }).from(sh)
      .innerJoin(schema.devices, eq(schema.devices.id, sh.deviceId))
      .innerJoin(schema.staff, eq(schema.staff.id, sh.openedBy))
      .orderBy(desc(sh.openedAt)).limit(200);
    const sales = await tx.select({
      shiftId: s.shiftId,
      gross: sql<number>`coalesce(sum(${s.total}), 0)::int`,
      count: sql<number>`count(*)::int`,
    }).from(s).where(eq(s.status, "kapandi")).groupBy(s.shiftId);
    const totals = new Map(sales.map((r) => [r.shiftId, r]));
    return shifts.map((r) => ({ ...r, gross: totals.get(r.id)?.gross ?? 0, count: totals.get(r.id)?.count ?? 0 }));
  });
  return (
    <>
      {rows.length === 0 ? <Empty>Henüz vardiya yok. Kasada vardiya açılınca burada görünür.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
              <tr>{["Cihaz", "Açan", "Açılış", "Kapanış", "Satış", "Ciro", "Fark"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i >= 4 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const diff = r.countedCash !== null && r.expectedCash !== null ? r.countedCash - r.expectedCash : null;
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5"><Link href={`/yonetim/raporlar/${r.id}`} className="font-medium underline">{r.device}</Link></td>
                    <td className="px-4 py-2.5">{r.opener}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{dt(r.openedAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.closedAt ? dt(r.closedAt) : <Badge tone="brand">Açık</Badge>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTL(r.gross)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${diff === null ? "text-muted" : diff < 0 ? "text-bad" : diff > 0 ? "text-ok" : ""}`}>{diff === null ? "—" : signedTL(diff)}</td>
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
