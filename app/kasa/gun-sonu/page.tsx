// Gün sonu: açık vardiyanın özeti + sayılan nakit ile kapama. Kapanınca kasiyer oturumu düşer; bu cihazın
// son 15 dakikada kapanan vardiyası (fark dahil) yazdırılabilsin diye PIN'siz gösterilir.
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getCashier, getDevice } from "@/lib/auth/kasa";
import { loadShiftSummary } from "@/lib/kasa/shift-report";
import { ShiftReport } from "@/components/ShiftReport";
import { CloseShiftForm } from "@/components/kasa/KasaForms";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function GunSonu() {
  const device = await getDevice();
  if (!device) redirect("/kasa/eslestir");
  const cashier = await getCashier(device);
  const sh = schema.shifts;
  const [open] = cashier ? await withTenant(device.tenantId, (tx) => tx.select({ id: sh.id }).from(sh).where(and(eq(sh.deviceId, device.id), isNull(sh.closedAt))).limit(1)) : [];
  const [recent] = open ? [] : await withTenant(device.tenantId, (tx) => tx.select({ id: sh.id }).from(sh).where(and(eq(sh.deviceId, device.id), gt(sh.closedAt, sql`now() - interval '15 minutes'`))).orderBy(desc(sh.closedAt)).limit(1));
  const id = open?.id ?? recent?.id;
  if (!id) redirect("/kasa");
  const data = await loadShiftSummary(device.tenantId, id);
  if (!data) redirect("/kasa");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href="/kasa" className="text-sm underline">← Kasa</Link>
        {!open && <PrintButton />}
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{open ? "Gün sonu" : "Vardiya kapandı"}</h1>
      <p className="mb-5 text-sm text-muted">{device.tenantName} · {device.name}</p>
      <ShiftReport data={data} showSales={!open} />
      {open && <div className="mt-6 print:hidden"><CloseShiftForm /></div>}
    </main>
  );
}
