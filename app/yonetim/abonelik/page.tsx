import Link from "next/link";
import { Fragment } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { formatTL } from "@/lib/core/money";
import { PERIODS, STATE_LABEL, planBreakdown, refundWindowOk } from "@/lib/core/billing";
import { unitPrices, salesContact } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentsOf, salesSincePayment, tenantUnits } from "@/lib/billing/service";
import { removeStoredCard } from "@/lib/billing/renewal";
import { approveRefundAction, requestRefundAction, startCheckout, withdrawRefundAction } from "@/lib/billing/actions";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const day = (d: Date) => d.toLocaleDateString("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });
const STATUS: Record<string, string> = { bekliyor: "Bekliyor", odendi: "Ödendi", basarisiz: "Başarısız", iade_talep: "İade talebi", iade: "İade edildi" };
const REASON_LABEL: Record<string, string> = { hatali: "Hatalı/mükerrer çekim", satissiz: "7 gün içinde satışsız dönem", diger: "Diğer" };

export default async function Abonelik({ searchParams }: { searchParams: Promise<{ kilit?: string; sonuc?: string; iade?: string; id?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const b = a.billing, provider = getBillingProvider(), contact = salesContact();
  const pays = await paymentsOf(a.tenantId), units = await tenantUnits(a.tenantId);
  const [card] = await getDb().select({ cardMark: schema.tenants.cardMark }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId));
  const sel = pays.find(({ p }) => p.id === sp.id);
  const hint = sel?.p.paidAt ? refundWindowOk(sel.p.paidAt, new Date(), await salesSincePayment(a.tenantId, sel.p.paidAt)) : null;
  return (
    <>
      <PageHeader title="Abonelik" desc="ÇabukPOS aboneliği. Abonelik bitse de kasa satışa devam eder; yalnız yönetim salt okunur olur." />
      {card?.cardMark && (
        <Card className="mb-4 p-4 text-sm" data-testid="saved-card">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Kayıtlı kart:</span>
            <span className="tabular text-muted">{card.cardMark}</span>
            <span className="text-xs text-muted">Vade 3 gün kalınca bu kartla otomatik yenilenir.</span>
            <form action={removeStoredCard.bind(null, a.tenantId)} className="ml-auto"><button className="text-sm text-bad hover:underline">Kayıtlı kartı sil</button></form>
          </div>
        </Card>
      )}
      {sp.kilit && b.locked && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Abonelik sona erdiği için değişiklik yapılamıyor. Ödeme yapınca yönetim hemen açılır.</Card>}
      {sp.sonuc === "ok" && <Card className="mb-4 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">Ödeme alındı, teşekkürler.</Card>}
      {sp.sonuc === "isleniyor" && <Card className="mb-4 border-amber-200 bg-warn-soft p-4 text-sm text-warn" role="status">Ödeme işleniyor; banka onayı gelince abonelik birkaç saniye içinde uzar. Sayfayı yenileyebilirsin.</Card>}
      {sp.sonuc === "telefon" && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Kartla ödeme için geçerli bir cep telefonu gir.</Card>}
      {sp.sonuc === "hata" && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</Card>}
      {sp.iade === "talep" && <Card className="mb-4 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">İade talebin kaydedildi. Onaylanınca ödeme yapılan karta, ödeme kuruluşu aracılığıyla döner (2–10 iş günü).</Card>}
      {sp.iade === "ceklildi" && <Card className="mb-4 p-4 text-sm text-muted" role="status">İade talebi çekildi.</Card>}
      {sp.iade === "onaylandi" && <Card className="mb-4 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">İade işlendi olarak işaretlendi.</Card>}
      {sp.iade === "hata" && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">İade işlemi tamamlanamadı.</Card>}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <Badge tone={b.locked ? "bad" : b.warn ? "warn" : "ok"}><span data-testid="billing-state">{STATE_LABEL[b.state]}</span></Badge>
        <span className="text-sm" data-testid="billing-ends">
          {b.state === "deneme" || b.state === "aktif" ? `Bitiş: ${day(b.endsAt)} (${b.daysLeft} gün)` : `Bitti: ${day(b.endsAt)} · salt okunur: ${day(b.lockAt)}`}
        </span>
        {provider?.test && <Badge tone="warn">TEST ödeme</Badge>}
        <span className="text-sm text-muted" data-testid="billing-units">{units.stores} şube · {units.devices} terminal</span>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERIODS.map((p) => {
          const u = unitPrices(p.key), bd = u ? planBreakdown(u, units) : null;
          return (
            <Card key={p.key} className="p-4">
              <h2 className="font-semibold">{p.label}</h2>
              <div className="my-2 text-2xl font-semibold tabular-nums">{bd ? formatTL(bd.total) : "—"}</div>
              {bd && (bd.extraStores > 0 || bd.extraDevices > 0) && (
                <p className="mb-2 text-xs text-muted" data-testid={`breakdown-${p.key}`}>
                  Taban {formatTL(bd.base)}
                  {bd.extraStores > 0 && ` + ${units.stores - 1} ek şube (${formatTL(bd.extraStores)})`}
                  {bd.extraDevices > 0 && ` + ${units.devices - 1} ek terminal (${formatTL(bd.extraDevices)})`}
                </p>
              )}
              {provider && bd ? (
                <form action={startCheckout}>
                  <input type="hidden" name="period" value={p.key} />
                  {provider.name === "paytr" && <input name="phone" type="tel" required minLength={10} placeholder="Cep telefonu (05…)" autoComplete="tel" className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm" />}
                  <button className="w-full rounded-lg bg-brand py-2.5 font-medium text-white">{p.label} öde</button>
                  <p className="mt-2 text-xs text-muted">Ödeyerek <Link href="/yasal/mesafeli-satis" target="_blank" className="underline">Mesafeli satış sözleşmesi</Link>ni ve <Link href="/yasal/iade-iptal" target="_blank" className="underline">İptal ve iade</Link> koşullarını kabul edersiniz. Otomatik yenileme yoktur.</p>
                </form>
              ) : <p className="text-sm text-muted">Online ödeme yakında.{contact ? ` Ödeme için: ${contact}` : ""}</p>}
            </Card>
          );
        })}
      </div>
      {pays.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr>{["Tarih", "Dönem", "Tutar", "Birimler", "Durum", "Fatura", "Dönem sonu", "İşlem"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{pays.map(({ p, invoice }) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="px-4 py-2.5">{day(p.createdAt)}</td>
                  <td className="px-4 py-2.5">{p.period === "yillik" ? "Yıllık" : "Aylık"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatTL(p.amount)}</td>
                  <td className="px-4 py-2.5">{p.stores > 0 || p.devices > 0 ? `${p.stores} şube · ${p.devices} terminal` : "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.status === "iade" ? "warn" : p.status === "iade_talep" ? "warn" : p.status === "odendi" ? "ok" : p.status === "basarisiz" ? "bad" : "neutral"}>{STATUS[p.status] ?? p.status}</Badge>
                    {p.refundedAt && <div className="mt-0.5 text-xs text-muted">{day(p.refundedAt)}</div>}
                    {p.status === "iade_talep" && p.refundReason && <div className="mt-0.5 text-xs text-muted">{REASON_LABEL[p.refundReason] ?? p.refundReason}</div>}
                  </td>
                  <td className="px-4 py-2.5">{invoice?.token ? (invoice.status === "issued" ? <Link href={`/fatura/${invoice.token}`} className="underline" data-testid="invoice-link">Görüntüle</Link> : <span className="text-muted">Hazırlanıyor</span>) : "—"}</td>
                  <td className="px-4 py-2.5">{p.periodEnd ? day(p.periodEnd) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.status === "odendi" && <Link href={`/yonetim/abonelik?id=${p.id}`} className="underline">İade talebi</Link>}
                    {p.status === "iade_talep" && (
                      <div className="flex flex-wrap gap-3">
                        <form action={withdrawRefundAction}><input type="hidden" name="id" value={p.id} /><button className="underline">Talebi çek</button></form>
                        {a.role === "sahip" && <form action={approveRefundAction}><input type="hidden" name="id" value={p.id} /><button className="text-brand underline">İade edildi</button></form>}
                      </div>
                    )}
                  </td>
                </tr>
                {sp.id === p.id && p.status === "odendi" && (
                  <tr><td colSpan={8} className="bg-surface-2 px-4 py-4">
                    <form action={requestRefundAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Neden">
                        <select name="reason" className="h-11 rounded-lg border border-line bg-surface px-3 text-sm">
                          <option value="satissiz">7 gün içinde satışsız dönem</option>
                          <option value="hatali">Hatalı / mükerrer çekim</option>
                          <option value="diger">Diğer</option>
                        </select>
                      </Field>
                      <Field label="Not"><Input name="note" className="w-64" /></Field>
                      <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Talebi gönder</button>
                      <span className="text-xs text-muted">
                        {hint === true ? "Koşula uygun görünüyor: ödeme 7 gün içinde ve dönemde satış yok → tam iade istenebilir." : hint === false ? "Yayınlanan koşula göre başlamış dönemin bedeli iade edilmez; yalnız hatalı/mükerrer çekimde tam iade istenebilir." : ""}
                      </span>
                    </form>
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
        </Card>
      )}
      <Card className="mt-6 p-5 text-sm text-ink-2">
        <h2 className="mb-1 font-semibold text-ink">İptal</h2>
        <p>Abonelik otomatik yenilenmez: yeni dönem için ödeme yapmamanız aboneliği dönem sonunda eritir, ayrıca işlem gerekmez. Dönem bitince 7 günlük ek süre sonrasında yönetim paneli salt okunur olur; kasa satışa devam eder, verileriniz silinmez. Hesap ve verilerin tamamen silinmesini isterseniz {contact ? `${contact} adresine` : <Link href="/iletisim" className="underline">İletişim sayfasındaki adrese</Link>} yazmanız yeterli. Koşulların tamamı: <Link href="/yasal/iade-iptal" className="underline">İptal ve iade</Link>.</p>
      </Card>
    </>
  );
}
