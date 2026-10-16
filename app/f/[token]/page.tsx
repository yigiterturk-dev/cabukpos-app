// Herkese açık e-Arşiv görünümü (alıcı QR/e-posta bağlantısıyla gelir). Kiracı bağlamı yok → SECURITY DEFINER fonksiyon.
// 404 doğrulaması layout'ta (kök loading.tsx streaming'i 404'ü 200'e çevirmesin diye); belge sorgusu doc.ts'te (cache'li tek sorgu).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatTL } from "@/lib/core/money";
import { discountedVat } from "@/lib/core/cart";
import { qtyText } from "@/lib/core/receipt";
import { clientIp, hit } from "@/lib/ratelimit";
import { PrintButton } from "@/components/PrintButton";
import { docByToken } from "./doc";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "e-Arşiv fatura — ÇabukPOS", robots: { index: false, follow: false } };

const dt = (s: string) => new Date(s).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Fatura({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await docByToken(token);
  if (!d) notFound();
  // Sınır yalnız gerçek belge görünümünü tutar; bilinmeyen token ucuz dizinli aramayla 404 döner (e2e m8 de buna dayanır).
  if ((await hit(`fatura:${await clientIp()}`, 1)) > 30) {
    return <main className="mx-auto max-w-md p-8 text-center text-sm">Çok fazla istek. Bir dakika sonra tekrar deneyin.</main>;
  }
  const test = (d.provider ?? "fake-earsiv") === "fake-earsiv";
  const ready = d.status === "issued" || d.status === "cancelled" || d.status === "cancel_rejected";
  const cancelled = d.status === "cancelled" && !!d.number;
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-4 py-8 text-sm text-ink print:max-w-none print:py-0">
      <style>{`@media print { @page { size: A4; margin: 14mm } body { background: #fff } }`}</style>
      {test && <div className="mb-4 rounded-lg border border-warn/40 bg-warn-soft p-3 text-center font-semibold text-warn" data-testid="test-band">TEST — mali değeri yoktur</div>}
      {cancelled && <div className="mb-4 rounded-lg border border-bad/40 bg-bad-soft p-3 text-center text-lg font-bold tracking-wide text-bad">İPTAL EDİLDİ</div>}
      {!ready ? (
        <section className="rounded-xl border border-line p-8 text-center">
          <h1 className="text-lg font-semibold">Faturanız hazırlanıyor</h1>
          <p className="mt-2 text-muted">{d.seller.name} · {d.sale.receiptNo} · {formatTL(d.sale.total)}</p>
          <p className="mt-1 text-muted">Birkaç dakika sonra bu sayfayı yenileyin{d.buyer.email ? "; hazır olunca e-postanıza da gönderilecek" : ""}.</p>
        </section>
      ) : (
        <article className="space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="text-lg font-bold">{d.seller.name}</div>
              {d.seller.address && <div className="whitespace-pre-line">{d.seller.address}</div>}
              <div className="text-muted">{d.seller.taxOffice ? `${d.seller.taxOffice} V.D. · ` : ""}{d.seller.taxId?.length === 11 ? "TCKN" : "VKN"} {d.seller.taxId}</div>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold tracking-wide">e-ARŞİV FATURA</h1>
              <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
                <dt className="text-muted">Fatura no</dt><dd className="font-mono" data-testid="fiscal-number">{d.number}</dd>
                <dt className="text-muted">Tarih</dt><dd>{dt(d.issuedAt ?? d.sale.createdAt)}</dd>
                <dt className="text-muted">Fiş no</dt><dd className="font-mono">{d.sale.receiptNo}</dd>
              </dl>
            </div>
          </header>
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Alıcı</h2>
            <div className="font-medium">{d.buyer.name}</div>
            {d.buyer.address && <div className="whitespace-pre-line">{d.buyer.address}</div>}
            <div className="text-muted">{d.buyer.taxId.length === 10 ? "VKN" : "TCKN"} {d.buyer.taxId}</div>
          </section>
          <table className="w-full border-y border-line">
            <thead className="text-left text-xs text-muted"><tr><th className="py-2 font-medium">Mal / hizmet</th><th className="text-right font-medium">Miktar</th><th className="text-right font-medium">Birim fiyat</th><th className="text-right font-medium">KDV</th><th className="text-right font-medium">Tutar</th></tr></thead>
            <tbody className="tabular-nums">
              {d.lines.map((l, i) => <tr key={i} className="border-t border-line"><td className="py-1.5">{l.name}</td><td className="text-right">{qtyText(l.qtyMilli)}</td><td className="text-right">{formatTL(l.unitPrice)}</td><td className="text-right">%{l.vatRate}</td><td className="text-right">{formatTL(l.total)}</td></tr>)}
            </tbody>
          </table>
          <div className="ml-auto w-full max-w-xs space-y-1 tabular-nums">
            {discountedVat(d.sale.vat, d.sale.discount).map((v) => (
              <div key={v.rate} className="flex justify-between"><span className="text-muted">KDV %{v.rate} (matrah {formatTL(v.net)})</span><span>{formatTL(v.vat)}</span></div>
            ))}
            {!!d.sale.discount && <div className="flex justify-between"><span className="text-muted">İndirim (kupon/puan)</span><span>-{formatTL(d.sale.discount)}</span></div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><span>Genel toplam</span><span>{formatTL(d.sale.total - d.sale.discount)}</span></div>
          </div>
          <footer className="border-t border-line pt-3 text-xs text-muted">
            <div>ETTN: <span className="font-mono" data-testid="fiscal-ettn">{d.ettn}</span></div>
            <div className="mt-1">Bu belge e-Arşiv fatura görüntüsüdür.{d.status === "cancel_rejected" ? " İade yapıldı; iade faturası işletmece düzenlenecek." : ""}</div>
          </footer>
        </article>
      )}
      <div className="mt-6 flex justify-center print:hidden"><PrintButton label="Yazdır" /></div>
    </main>
  );
}
