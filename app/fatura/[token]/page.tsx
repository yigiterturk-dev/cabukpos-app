// Herkese açık abonelik e-Arşiv görünümü (SaaS kendi faturası, /f/<token>'ın abonelik kardeşi).
// Kiracı bağlamı yok; token rastgele 24 karakter. loading.tsx YOK: notFound() gerçek 404 dönsün.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { saasSeller } from "@/lib/billing/invoice";
import { formatTL, splitVat } from "@/lib/core/money";
import { clientIp, hit } from "@/lib/ratelimit";
import { PrintButton } from "@/components/PrintButton";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { RateLimitNotice } from "@/components/RateLimitNotice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Abonelik faturası — ÇabukPOS", robots: { index: false, follow: false } };

type Inv = {
  status: "pending" | "issued" | "error"; number: string | null; ettn: string | null; provider: string;
  buyer: { taxId: string; name: string; email?: string; address?: string }; issuedAt: string | null; createdAt: string;
  payment: { period: string; amount: number; paidAt: string | null; createdAt: string };
};
const dt = (s: string) => new Date(s).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function AbonelikFatura({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) notFound();
  if ((await hit(`fatura:${await clientIp()}`, 1)) > 30) {
    return <RateLimitNotice resource="Fatura" />;
  }
  const I = schema.billingInvoices, P = schema.billingPayments;
  const [row] = await getDb().select({ i: I, p: P }).from(I).innerJoin(P, eq(I.paymentId, P.id)).where(eq(I.token, token));
  if (!row) notFound();
  const seller = saasSeller();
  const d: Inv = { ...row.i, payment: row.p } as unknown as Inv;
  const test = (d.provider ?? "fake-earsiv") === "fake-earsiv";
  const ready = d.status === "issued" && !!seller;
  const kunye = seller ?? { name: "—", taxId: "—", address: null, taxOffice: null };
  const period = d.payment.period === "yillik" ? "Yıllık" : "Aylık";
  return (
    <main className="print-paper mx-auto w-full max-w-3xl bg-white px-4 py-8 text-sm text-ink print:max-w-none print:py-0">
      <style>{`@media print { @page { size: A4; margin: 14mm } body { background: #fff } }`}</style>
      {test && <div className="mb-4 rounded-lg border border-warn/40 bg-warn-soft p-3 text-center font-semibold text-warn" data-testid="test-band">TEST — mali değeri yoktur</div>}
      {!ready || !seller ? (
        <section className="rounded-xl border border-line p-8 text-center">
          <h1 className="text-lg font-semibold">Faturanız hazırlanıyor</h1>
          <p className="mt-2 text-muted">ÇabukPOS aboneliği ({period}) · {formatTL(d.payment.amount)}</p>
          <p className="mt-1 text-muted">Birkaç dakika sonra bu sayfayı yenileyin.</p>
        </section>
      ) : (
        <article className="space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="text-lg font-bold">{kunye.name}</div>
              <div className="whitespace-pre-line">{kunye.address}</div>
              <div className="text-muted">{seller.taxOffice ? `${kunye.taxOffice} V.D. · ` : ""}{seller.taxId.length === 11 ? "TCKN" : "VKN"} {kunye.taxId}</div>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold tracking-wide">e-ARŞİV FATURA</h1>
              <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
                <dt className="text-muted">Fatura no</dt><dd className="font-mono" data-testid="fiscal-number">{d.number}</dd>
                <dt className="text-muted">Tarih</dt><dd>{dt(d.issuedAt ?? d.payment.paidAt ?? d.payment.createdAt)}</dd>
              </dl>
            </div>
          </header>
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Alıcı</h2>
            <div className="font-medium">{d.buyer.name}</div>
            {d.buyer.address && <div className="whitespace-pre-line">{d.buyer.address}</div>}
            <div className="text-muted">{d.buyer.taxId.length === 10 ? "VKN" : "TCKN"} {d.buyer.taxId}</div>
          </section>
          <dl aria-label="Mal ve hizmet kalemi" className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line py-3 text-sm lg:hidden print:hidden">
            <div className="col-span-2"><dt className="text-xs text-muted">Mal / hizmet</dt><dd className="font-medium">ÇabukPOS aboneliği ({period})</dd></div>
            <div><dt className="text-xs text-muted">Miktar</dt><dd>1</dd></div>
            <div><dt className="text-xs text-muted">Birim fiyat</dt><dd className="tabular-nums">{formatTL(d.payment.amount)}</dd></div>
            <div><dt className="text-xs text-muted">KDV</dt><dd>%20</dd></div>
            <div><dt className="text-xs text-muted">Tutar</dt><dd className="font-medium tabular-nums">{formatTL(d.payment.amount)}</dd></div>
          </dl>
          <HorizontalScrollRegion label="Fatura kalemleri, yatay kaydırılabilir" className="hidden lg:block print:block">
          <table aria-label="Fatura kalemleri" className="w-full border-y border-line">
            <thead className="text-left text-xs text-muted"><tr><th scope="col" className="py-2 font-medium">Mal / hizmet</th><th scope="col" className="text-right font-medium">Miktar</th><th scope="col" className="text-right font-medium">Birim fiyat</th><th scope="col" className="text-right font-medium">KDV</th><th scope="col" className="text-right font-medium">Tutar</th></tr></thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-line"><td className="py-1.5">ÇabukPOS aboneliği ({period})</td><td className="text-right">1</td><td className="text-right">{formatTL(d.payment.amount)}</td><td className="text-right">%20</td><td className="text-right">{formatTL(d.payment.amount)}</td></tr>
            </tbody>
          </table>
          </HorizontalScrollRegion>
          <div className="ml-auto w-full max-w-xs space-y-1 tabular-nums">
            <div className="flex justify-between"><span className="text-muted">KDV %20 (matrah {formatTL(netOf(d.payment.amount))})</span><span>{formatTL(d.payment.amount - netOf(d.payment.amount))}</span></div>
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><span>Genel toplam</span><span>{formatTL(d.payment.amount)}</span></div>
          </div>
          <footer className="border-t border-line pt-3 text-xs text-muted">
            <div>ETTN: <span className="font-mono" data-testid="fiscal-ettn">{d.ettn}</span></div>
            <div className="mt-1">Bu belge e-Arşiv fatura görüntüsüdür.</div>
          </footer>
        </article>
      )}
      <div className="mt-6 flex justify-center print:hidden"><PrintButton label="Yazdır" /></div>
    </main>
  );
}

const netOf = (gross: number) => splitVat(gross, 20).net;
