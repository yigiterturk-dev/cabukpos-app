// A4 iade tutanağı (kasadaki termal tutanakla aynı içerik) ya da VKN'li alıcının iade faturası kaydı.
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { qtyText } from "@/lib/core/receipt";
import { buyerKindOf, refundNote } from "@/lib/core/refundNote";
import { PrintButton } from "@/components/PrintButton";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (d: Date) => d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

export default async function IadeBelgesi({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const R = schema.fiscalRefunds, D = schema.fiscalDocuments, RS = alias(schema.sales, "refund_sale");
  const data = await withTenant(a.tenantId, async (tx) => {
    const [r] = await tx.select({ r: R, number: D.number, ettn: D.ettn, issuedAt: D.issuedAt, buyer: D.buyer, refundNo: RS.receiptNo, refundAt: RS.createdAt, total: RS.total, vat: RS.vat })
      .from(R).innerJoin(D, eq(D.id, R.fiscalDocId)).innerJoin(RS, eq(RS.id, R.refundSaleId)).where(eq(R.id, id));
    if (!r) return null;
    const lines = await tx.select({ name: schema.saleLines.name, qtyMilli: schema.saleLines.qtyMilli, unitPrice: schema.saleLines.unitPrice, vatRate: schema.saleLines.vatRate, total: schema.saleLines.total })
      .from(schema.saleLines).where(eq(schema.saleLines.saleId, r.r.refundSaleId));
    return { ...r, lines };
  });
  if (!data || !data.number || !data.ettn || !data.issuedAt) notFound();
  const [t] = await getDb().select({ name: schema.tenants.name, taxId: schema.tenants.taxId }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId));
  const f = { number: data.number, ettn: data.ettn, invoiceAt: data.issuedAt.toISOString(), buyerKind: buyerKindOf(data.buyer.taxId), partial: true, sellerTaxId: t?.taxId ?? null };
  const rn = data.r.kind === "tutanak" ? refundNote({ ...f, buyerKind: "tckn" }, t?.name ?? a.tenantName, data.refundNo) : null;
  return (
    <>
      <style>{`@page { size: A4; margin: 16mm } @media print { body { background: #fff } }`}</style>
      <div className="print:hidden">
        <Link href="/yonetim/mali?sekme=belgeler" className="text-sm text-muted hover:underline">← Mali belgeler</Link>
        <PageHeader title={rn ? "İade tutanağı" : "Alıcının iade faturası"} desc={`İade fişi ${data.refundNo} · ${day(data.refundAt)}`} actions={rn ? <PrintButton /> : undefined} />
      </div>
      <Card className="mx-auto max-w-3xl p-8 print:border-0 print:p-0 print:shadow-none">
        {rn?.kind === "tutanak" ? (
          <article data-testid="refund-a4">
            <h1 className="text-center text-xl font-bold tracking-wide">{rn.title}</h1>
            <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
              {rn.rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-medium">{v}</dd></div>)}
            </dl>
            <table className="mt-6 w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="py-2 font-medium">Ürün</th><th className="py-2 text-right font-medium">Miktar</th><th className="py-2 text-right font-medium">Birim fiyat</th><th className="py-2 text-right font-medium">KDV</th><th className="py-2 text-right font-medium">Tutar</th></tr></thead>
              <tbody className="divide-y divide-line">{data.lines.map((l, i) => (
                <tr key={i}><td className="py-2">{l.name}</td><td className="py-2 text-right tabular-nums">{qtyText(l.qtyMilli)}</td><td className="py-2 text-right tabular-nums">{formatTL(l.unitPrice)}</td><td className="py-2 text-right">%{l.vatRate}</td><td className="py-2 text-right tabular-nums">{formatTL(l.total)}</td></tr>
              ))}</tbody>
            </table>
            <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-sm">
              {data.vat.map((v) => <div key={v.rate} className="flex justify-between text-muted"><span>KDV %{v.rate} · matrah {formatTL(v.net)}</span><span className="tabular-nums">{formatTL(v.vat)}</span></div>)}
              <div className="flex justify-between pt-1 text-base font-semibold"><span>İade toplamı</span><span className="tabular-nums">{formatTL(data.total)}</span></div>
            </div>
            <p className="mt-6 text-sm">{rn.statement}</p>
            <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-10 text-sm">
              {rn.sign.map((s) => <div key={s} className="border-t border-ink pt-1.5 text-muted">{s}</div>)}
            </div>
          </article>
        ) : (
          <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Alıcı</dt><dd>{data.buyer.name} · {data.buyer.taxId}</dd>
            <dt className="text-muted">Asıl fatura</dt><dd className="font-mono">{data.number}</dd>
            <dt className="text-muted">İade tutarı</dt><dd className="tabular-nums">{formatTL(data.total)}</dd>
            <dt className="text-muted">Alıcının iade faturası</dt><dd>{data.r.buyerInvoiceNo ? `${data.r.buyerInvoiceNo} · ${data.r.buyerInvoiceDate}` : "Bekleniyor — Raporlar → İncelenecek"}</dd>
          </dl>
        )}
      </Card>
    </>
  );
}
