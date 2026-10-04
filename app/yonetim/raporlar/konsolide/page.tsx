// Aylık konsolide rapor — yazdır/PDF (A4). E-postayla aynı saf içerik (digestContent "aylik").
import Link from "next/link";
import { notFound } from "next/navigation";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { appUrl } from "@/lib/mail";
import { konsolideData } from "@/lib/admin/report-mail";
import { digestContent } from "@/lib/core/digest";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Aylık konsolide rapor — ÇabukPOS" };

export default async function Konsolide({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const ay = /^\d{4}-\d{2}$/.test(sp.ay ?? "") ? sp.ay! : null;
  if (!ay) notFound();
  const bas = `${ay}-01`;
  const [y, m] = ay.split("-").map(Number);
  const bit = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // ayın son günü
  const out = await withTenant(a.tenantId, async (tx) => {
    const [t] = await tx.select({ name: schema.tenants.name }).from(schema.tenants);
    return { name: t?.name ?? "", data: await konsolideData(tx, a.tenantId, { bas, bit }) };
  });
  const c = digestContent("aylik", out.name, { ...out.data, range: { bas, bit } }, `${appUrl()}/yonetim/raporlar/konsolide?ay=${ay}`);
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-6 py-8 text-sm text-ink print:max-w-none print:px-0 print:py-0">
      <style>{`@media print { @page { size: A4; margin: 14mm } body { background: #fff } }`}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/yonetim/raporlar" className="text-sm text-muted hover:underline">← Raporlar</Link>
        <PrintButton label="Yazdır / PDF" />
      </div>
      <div dangerouslySetInnerHTML={{ __html: c.html }} />
    </main>
  );
}
