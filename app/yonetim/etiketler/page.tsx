import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { tenantCurrency } from "@/lib/admin/currency";
import { LabelSheet } from "@/components/admin/LabelSheet";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Etiketler({ searchParams }: { searchParams: Promise<{ tum?: string }> }) {
  const a = await requireAdmin();
  const all = (await searchParams).tum === "1";
  const P = schema.products;
  const prods = await withTenant(a.tenantId, (tx) =>
    tx.select({ id: P.id, name: P.name, price: P.price, kind: P.kind, plu: P.plu, barcodes: P.barcodes, priceChangedAt: P.priceChangedAt, labelPrintedAt: P.labelPrintedAt }).from(P).where(eq(P.active, true)).orderBy(asc(P.name)),
  );
  const due = prods.filter((p) => !p.labelPrintedAt || p.labelPrintedAt < p.priceChangedAt);
  const list = (all ? prods : due).map((p) => ({ id: p.id, name: p.name, price: p.price, kind: p.kind, plu: p.plu, barcode: p.barcodes[0] ?? null }));
  const tab = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm ${on ? "border-brand bg-brand-soft text-brand" : "border-line"}`;
  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Raf etiketi" desc="A4 etiket kâğıdına 3×8 (70×37 mm). Fiyatı değişen ürünler burada birikir; bastıktan sonra işaretleyin." />
        <div className="mb-4 flex gap-2">
          <Link href="/yonetim/etiketler" className={tab(!all)}>Fiyatı değişenler ({due.length})</Link>
          <Link href="/yonetim/etiketler?tum=1" className={tab(all)}>Tüm ürünler ({prods.length})</Link>
        </div>
      </div>
      {list.length === 0 ? <Empty>Basılacak etiket yok.</Empty> : <LabelSheet key={list.map((l) => l.id).join()} items={list} currency={await tenantCurrency(a.tenantId)} />}
    </>
  );
}
