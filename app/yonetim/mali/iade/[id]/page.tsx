// A4 iade tutanağı (kasadaki termal tutanakla aynı içerik) ya da VKN'li alıcının iade faturası kaydı.
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { moneyFormatter } from "@/lib/admin/currency";
import { qtyText } from "@/lib/core/receipt";
import { buyerKindOf, refundNote } from "@/lib/core/refundNote";
import { PrintButton } from "@/components/PrintButton";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (d: Date) => d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

export default async function IadeBelgesi({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
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
        <Link href="/yonetim/mali?sekme=belgeler" className="rounded px-1 text-sm text-muted outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">← Mali belgeler</Link>
        <PageHeader title={rn ? "İade tutanağı" : "Alıcının iade faturası"} desc={`İade fişi ${data.refundNo} · ${day(data.refundAt)}`} actions={rn ? <PrintButton /> : undefined} />
      </div>
      <Card className="mx-auto max-w-3xl p-8 print:border-0 print:p-0 print:shadow-none">
        {rn?.kind === "tutanak" ? (
          <article data-testid="refund-a4">
            <h1 className="text-center text-xl font-bold tracking-wide">{rn.title}</h1>
            <dl className="mt-6 grid grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)] gap-y-1.5 text-sm">
              {rn.rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-medium">{v}</dd></div>)}
            </dl>
            <div className="mt-6">
            <ul aria-label="İade ürün kalemleri" className="divide-y divide-line lg:hidden print:hidden">
              {data.lines.map((l, i) => (
                <li key={i} className="space-y-2 py-3">
                  <p className="break-words font-medium">{l.name}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <div><dt className="text-xs text-muted">Miktar</dt><dd className="tabular-nums">{qtyText(l.qtyMilli)}</dd></div>
                    <div><dt className="text-xs text-muted">Birim fiyat</dt><dd className="tabular-nums">{money(l.unitPrice)}</dd></div>
                    <div><dt className="text-xs text-muted">KDV</dt><dd>%{l.vatRate}</dd></div>
                    <div><dt className="text-xs text-muted">Tutar</dt><dd className="tabular-nums font-medium">{money(l.total)}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block print:block">
            <table aria-label="İade ürün kalemleri" className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr><th scope="col" className="py-2 font-medium">Ürün</th><th scope="col" className="py-2 text-right font-medium">Miktar</th><th scope="col" className="py-2 text-right font-medium">Birim fiyat</th><th scope="col" className="py-2 text-right font-medium">KDV</th><th scope="col" className="py-2 text-right font-medium">Tutar</th></tr></thead>
              <tbody className="divide-y divide-line">{data.lines.map((l, i) => (
                <tr key={i}><td className="py-2">{l.name}</td><td className="py-2 text-right tabular-nums">{qtyText(l.qtyMilli)}</td><td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td><td className="py-2 text-right">%{l.vatRate}</td><td className="py-2 text-right tabular-nums">{money(l.total)}</td></tr>
              ))}</tbody>
            </table>
            </div>
            </div>
            <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-sm">
              {data.vat.map((v) => <div key={v.rate} className="flex justify-between text-muted"><span>KDV %{v.rate} · matrah {money(v.net)}</span><span className="tabular-nums">{money(v.vat)}</span></div>)}
              <div className="flex justify-between pt-1 text-base font-semibold"><span>İade toplamı</span><span className="tabular-nums">{money(data.total)}</span></div>
            </div>
            <p className="mt-6 text-sm">{rn.statement}</p>
            <div className="mt-10 grid gap-x-10 gap-y-10 text-sm sm:grid-cols-2">
              {rn.sign.map((s) => <div key={s} className="border-t border-ink pt-1.5 text-muted">{s}</div>)}
            </div>
          </article>
        ) : (
          <dl className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-muted">Alıcı</dt><dd>{data.buyer.name} · {data.buyer.taxId}</dd>
            <dt className="text-muted">Asıl fatura</dt><dd className="font-mono">{data.number}</dd>
            <dt className="text-muted">İade tutarı</dt><dd className="tabular-nums">{money(data.total)}</dd>
            <dt className="text-muted">Alıcının iade faturası</dt><dd>{data.r.buyerInvoiceNo ? `${data.r.buyerInvoiceNo} · ${data.r.buyerInvoiceDate}` : "Bekleniyor — Raporlar → İncelenecek"}</dd>
          </dl>
        )}
      </Card>
    </>
  );
}
