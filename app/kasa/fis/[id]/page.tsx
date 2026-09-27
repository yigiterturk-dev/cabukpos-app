// Bilgi fişi (80 mm). Yalnız fişi kesen cihazda, PIN ile girmiş kasiyer açar. ?yazdir=0 otomatik yazdırmayı kapatır.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getCashier, getDevice } from "@/lib/auth/kasa";
import { formatTL } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";
import { AutoPrint, PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const qty = (m: number) => (m % 1000 === 0 ? String(m / 1000) : (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 }));

export default async function Fis({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ yazdir?: string }> }) {
  const [{ id }, { yazdir }] = await Promise.all([params, searchParams]);
  const device = await getDevice();
  if (!device) redirect("/kasa/eslestir");
  if (!(await getCashier(device))) redirect("/kasa");
  if (!UUID.test(id)) notFound();

  const data = await withTenant(device.tenantId, async (tx) => {
    const [sale] = await tx.select().from(schema.sales).where(and(eq(schema.sales.id, id), eq(schema.sales.deviceId, device.id)));
    if (!sale) return null;
    const [lines, pays, [store], [staff]] = await Promise.all([
      tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, id)),
      tx.select().from(schema.payments).where(eq(schema.payments.saleId, id)),
      tx.select({ name: schema.stores.name, address: schema.stores.address }).from(schema.stores).where(eq(schema.stores.id, sale.storeId)),
      tx.select({ name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.id, sale.staffId)),
    ]);
    return { sale, lines, pays, store, staff };
  });
  if (!data) notFound();
  const { sale, lines, pays, store, staff } = data;
  const label = (m: string) => PAY_METHODS.find((p) => p.value === m)?.label ?? m;

  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 0 } @media print { body { background: #fff } }`}</style>
      {yazdir !== "0" && <AutoPrint />}
      <div className="flex justify-center gap-3 border-b border-line p-3 print:hidden">
        <PrintButton label="Yazdır" />
        <Link href="/kasa" className="inline-flex items-center px-3 text-sm underline">Kasaya dön</Link>
      </div>
      <article className="mx-auto my-4 w-[72mm] font-mono text-[12px] leading-snug print:my-0 print:p-[4mm]">
        <header className="text-center">
          <div className="text-[14px] font-bold">{device.tenantName}</div>
          {store && <div>{store.name}</div>}
          {store?.address && <div>{store.address}</div>}
        </header>
        <div className="mt-2 border-t border-dashed border-ink pt-1">
          <div className="flex justify-between"><span>{sale.createdAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span><span>{sale.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</span></div>
          <div className="flex justify-between"><span>Fiş no</span><span>{sale.receiptNo}</span></div>
          <div className="flex justify-between"><span>Kasiyer</span><span>{staff?.name ?? "—"}</span></div>
        </div>
        <div className="mt-1 border-t border-dashed border-ink pt-1">
          {lines.map((l) => (
            <div key={l.id} className="py-0.5">
              <div>{l.name}</div>
              <div className="flex justify-between pl-2"><span>{qty(l.qtyMilli)} × {formatTL(l.unitPrice)}</span><span>{formatTL(l.total)}</span></div>
            </div>
          ))}
        </div>
        <table className="mt-1 w-full border-t border-dashed border-ink">
          <thead><tr><th className="text-left font-normal">KDV</th><th className="text-right font-normal">Matrah</th><th className="text-right font-normal">KDV</th></tr></thead>
          <tbody>{sale.vat.map((v) => <tr key={v.rate}><td>%{v.rate}</td><td className="text-right">{formatTL(v.net)}</td><td className="text-right">{formatTL(v.vat)}</td></tr>)}</tbody>
        </table>
        <div className="mt-1 flex justify-between border-t border-dashed border-ink pt-1 text-[14px] font-bold"><span>TOPLAM</span><span>{formatTL(sale.total)}</span></div>
        <div className="mt-1">
          {pays.map((p) => <div key={p.id} className="flex justify-between"><span>{label(p.method)}</span><span>{formatTL(p.amount)}</span></div>)}
          {sale.change > 0 && <div className="flex justify-between"><span>Para üstü</span><span>{formatTL(sale.change)}</span></div>}
        </div>
        <p className="mt-3 border-t border-dashed border-ink pt-2 text-center">Bilgi fişidir, mali değeri yoktur.</p>
      </article>
    </>
  );
}
