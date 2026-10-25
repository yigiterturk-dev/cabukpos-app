import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { loadShiftSummary } from "@/lib/kasa/shift-report";
import { ShiftReport } from "@/components/ShiftReport";
import { PrintButton } from "@/components/PrintButton";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VardiyaRaporu({ params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const a = await requireAdmin();
  if (!UUID.test(shiftId)) notFound();
  const data = await loadShiftSummary(a.tenantId, shiftId);
  if (!data) notFound();
  if (a.storeId && data.shift.storeId !== a.storeId) notFound();
  const [device] = await withTenant(a.tenantId, (tx) => tx.select({ name: schema.devices.name }).from(schema.devices).where(eq(schema.devices.id, data.shift.deviceId)));
  return (
    <div className="max-w-xl">
      <div className="mb-3 text-sm print:hidden"><Link href="/yonetim/raporlar" className="underline">← Raporlar</Link></div>
      <PageHeader title={data.shift.closedAt ? "Vardiya raporu" : "Vardiya raporu (açık)"} desc={a.tenantName} actions={<span className="print:hidden"><PrintButton /></span>} />
      <ShiftReport data={data} deviceName={device?.name} showSales />
    </div>
  );
}
