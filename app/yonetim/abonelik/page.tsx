import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight, CreditCard } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { isBranchManager } from "@/lib/core/access";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { formatTL } from "@/lib/core/money";
import { PERIODS, STATE_LABEL, planBreakdown, refundWindowOk } from "@/lib/core/billing";
import { unitPrices, salesContact, manualPayment } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentsOf, salesSincePayment, tenantUnits } from "@/lib/billing/service";
import { removeStoredCard } from "@/lib/billing/renewal";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { ActionResult } from "@/components/admin/ActionResult";
import { CheckoutForm } from "@/components/admin/CheckoutPending";
import { RefundRequestForm, RefundStatusForm } from "@/components/admin/RefundRequestForm";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { approveRefundAction, requestRefundAction, startCheckout, withdrawRefundAction } from "@/lib/billing/actions";
import { Badge, buttonClass, Card, PageHeader, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const day = (d: Date) => d.toLocaleDateString("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });
const STATUS: Record<string, string> = { bekliyor: "Bekliyor", odendi: "Ödendi", basarisiz: "Başarısız", iade_talep: "İade talebi", iade: "İade edildi" };
const REASON_LABEL: Record<string, string> = { hatali: "Hatalı/mükerrer çekim", satissiz: "7 gün içinde satışsız dönem", diger: "Diğer" };

export default async function Abonelik({ searchParams }: { searchParams: Promise<{ kilit?: string; sonuc?: string; iade?: string; id?: string }> }) {
  const a = await requireAdmin();
  if (isBranchManager(a)) redirect("/yonetim");
  const sp = await searchParams;
  const b = a.billing, provider = getBillingProvider(), contact = salesContact(), manual = manualPayment();
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
            <span className="min-w-0 flex-1 break-words text-xs text-muted">Vade 3 gün kalınca bu kartla otomatik yenilenir.</span>
            <div className="ml-auto shrink-0"><ConfirmActionForm action={removeStoredCard.bind(null, a.tenantId)} label="Kayıtlı kartı sil" prompt="Kayıtlı kart silinirse otomatik abonelik yenilemesi durur. Devam etmek istiyor musunuz?" className={buttonClass("danger", "sm")} /></div>
          </div>
        </Card>
      )}
      {sp.kilit && b.locked && <ActionResult kind="error" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-bad/25 bg-bad-soft p-4 text-sm text-bad">Abonelik sona erdiği için değişiklik yapılamıyor. Ödeme yapınca yönetim hemen açılır.</ActionResult>}
      {sp.sonuc === "ok" && <ActionResult kind="success" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-ok/25 bg-ok-soft p-4 text-sm text-ok">Ödeme alındı, teşekkürler.</ActionResult>}
      {sp.sonuc === "isleniyor" && <ActionResult kind="success" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-warn/30 bg-warn-soft p-4 text-sm text-warn">Ödeme işleniyor; banka onayı gelince abonelik birkaç saniye içinde uzar. Sayfayı yenileyebilirsin.</ActionResult>}
      {sp.sonuc === "telefon" && <ActionResult kind="error" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-bad/25 bg-bad-soft p-4 text-sm text-bad">Kartla ödeme için geçerli bir cep telefonu gir.</ActionResult>}
      {sp.sonuc === "hata" && <ActionResult kind="error" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-bad/25 bg-bad-soft p-4 text-sm text-bad">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</ActionResult>}
      {sp.iade === "talep" && <ActionResult kind="success" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-ok/25 bg-ok-soft p-4 text-sm text-ok">İade talebin kaydedildi. Onaylanınca ödeme yapılan karta, ödeme kuruluşu aracılığıyla döner (2–10 iş günü).</ActionResult>}
      {sp.iade === "ceklildi" && <ActionResult kind="success" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 p-4 text-sm text-muted">İade talebi çekildi.</ActionResult>}
      {sp.iade === "onaylandi" && <ActionResult kind="success" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-ok/25 bg-ok-soft p-4 text-sm text-ok">İade işlendi olarak işaretlendi.</ActionResult>}
      {sp.iade === "hata" && <ActionResult kind="error" className="min-w-0 rounded-2xl border border-line bg-surface shadow-rest transition-shadow mb-4 border-bad/25 bg-bad-soft p-4 text-sm text-bad">İade işlemi tamamlanamadı.</ActionResult>}
      <Card className={`mb-6 overflow-hidden ${b.locked ? "border-bad/30" : b.warn ? "border-warn/35" : "border-ok/25"}`}>
        <div className="flex flex-wrap items-start gap-3 p-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${b.locked ? "bg-bad-soft text-bad" : b.warn ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
            <CreditCard aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={b.locked ? "bad" : b.warn ? "warn" : "ok"}><span data-testid="billing-state">{STATE_LABEL[b.state]}</span></Badge>
              {provider?.test && <Badge tone="warn">TEST ödeme</Badge>}
            </div>
            <p className="mt-2 text-sm font-medium" data-testid="billing-ends">
              {b.state === "deneme" || b.state === "aktif" ? `Bitiş: ${day(b.endsAt)} · ${b.daysLeft} gün kaldı` : `Bitti: ${day(b.endsAt)} · salt okunur: ${day(b.lockAt)}`}
            </p>
            <p className="mt-0.5 text-xs text-muted" data-testid="billing-units">{units.stores} şube · {units.devices} terminal</p>
          </div>
          <Link href="#odeme" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            {b.warn ? "Süreyi uzat" : "Ödeme seçenekleri"}<ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </Card>
      {manual && (
        <Card className="mb-6 p-4" data-testid="manual-payment">
          <h2 className="font-semibold">Havale / EFT ile ödeme</h2>
          <p className="mt-1 text-sm text-muted">Aşağıdaki hesaba dönem bedelini gönderin; açıklamaya <b>işletme adı ve kayıt e-postanızı</b> yazın. Ödeme kontrol edilince abonelik manuel olarak açılır.</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {manual.bank && <div><dt className="text-xs text-muted">Banka</dt><dd>{manual.bank}</dd></div>}
            <div><dt className="text-xs text-muted">Hesap sahibi</dt><dd>{manual.account}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted">IBAN</dt><dd className="tabular break-all font-medium">{manual.iban}</dd></div>
          </dl>
          {contact && <p className="mt-3 text-xs text-muted">Ödeme bildirimi: <a className="underline" href={`mailto:${contact}`}>{contact}</a></p>}
        </Card>
      )}
      <section id="odeme" tabIndex={-1} aria-labelledby="payment-options-heading" className="scroll-mt-6 rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/40">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="payment-options-heading" className="font-semibold">Ödeme seçenekleri</h2>
            <p className="mt-0.5 text-sm text-muted">Şube ve terminal sayınıza göre hesaplanan dönem ücretleri.</p>
          </div>
        </div>
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
                <CheckoutForm action={startCheckout} label={`${p.label} öde`} period={p.key} phoneRequired={provider.name === "paytr"}>
                  <p className="mt-2 break-words text-xs text-muted">Ödeyerek <Link href="/yasal/mesafeli-satis" target="_blank" className="underline">Mesafeli satış sözleşmesi<span className="sr-only"> (yeni sekmede açılır)</span></Link>ni ve <Link href="/yasal/iade-iptal" target="_blank" className="underline">İptal ve iade<span className="sr-only"> (yeni sekmede açılır)</span></Link> koşullarını kabul edersiniz. Otomatik yenileme yoktur.</p>
                </CheckoutForm>
              ) : <p className="text-sm text-muted">Online ödeme yakında.{contact ? ` Ödeme için: ${contact}` : ""}</p>}
            </Card>
          );
        })}
        </div>
      </section>
      {pays.length > 0 && (
        <>
        <Card className="mt-6 overflow-hidden lg:hidden">
          <ul aria-label="Abonelik ödeme geçmişi" className="divide-y divide-line">
            {pays.map(({ p, invoice }) => (
              <li key={p.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-medium">{p.period === "yillik" ? "Yıllık abonelik" : "Aylık abonelik"}</p><p className="mt-1 text-sm text-muted">{day(p.createdAt)}</p></div>
                  <p className="shrink-0 tabular-nums font-semibold">{formatTL(p.amount)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.status === "iade" || p.status === "iade_talep" ? "warn" : p.status === "odendi" ? "ok" : p.status === "basarisiz" ? "bad" : "neutral"}>{STATUS[p.status] ?? p.status}</Badge>
                  {p.refundedAt && <span className="text-xs text-muted">İade: {day(p.refundedAt)}</span>}
                  {p.status === "iade_talep" && p.refundReason && <span className="text-xs text-muted">{REASON_LABEL[p.refundReason] ?? p.refundReason}</span>}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Birimler</dt><dd>{p.stores > 0 || p.devices > 0 ? `${p.stores} şube · ${p.devices} terminal` : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Dönem sonu</dt><dd>{p.periodEnd ? day(p.periodEnd) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Fatura</dt><dd>{invoice?.token ? invoice.status === "issued" ? <Link href={`/fatura/${invoice.token}`} aria-label={`Faturayı görüntüle: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline">Görüntüle</Link> : <span className="text-muted">Hazırlanıyor</span> : "—"}</dd></div>
                </dl>
                {p.status === "odendi" && <Link href={`/yonetim/abonelik?id=${p.id}`} aria-label={`İade talebi: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-brand underline-offset-2 outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">İade talebi</Link>}
                {p.status === "iade_talep" && <div className="flex flex-wrap gap-2">
                  <RefundStatusForm action={withdrawRefundAction} paymentId={p.id} label="Talebi çek" ariaLabel={`İade talebini çek: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
                  {a.role === "sahip" && <RefundStatusForm action={approveRefundAction} paymentId={p.id} label="İade edildi" ariaLabel={`Ödemeyi iade edildi işaretle: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60" />}
                </div>}
                {sp.id === p.id && p.status === "odendi" && <RefundRequestForm action={requestRefundAction} paymentId={p.id} hint={hint} compact />}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="mt-6 hidden p-0 lg:block">
          <HorizontalScrollRegion label="Abonelik ödeme geçmişi, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Abonelik ödeme geçmişi" className="w-full min-w-[920px] text-sm">
            <thead className={TABLE_HEAD}><tr>{["Tarih", "Dönem", "Tutar", "Birimler", "Durum", "Fatura", "Dönem sonu", "İşlem"].map((h) => <th scope="col" key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
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
                  <td className="px-4 py-2.5">{invoice?.token ? (invoice.status === "issued" ? <Link href={`/fatura/${invoice.token}`} aria-label={`Faturayı görüntüle: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="underline" data-testid="invoice-link">Görüntüle</Link> : <span className="text-muted">Hazırlanıyor</span>) : "—"}</td>
                  <td className="px-4 py-2.5">{p.periodEnd ? day(p.periodEnd) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.status === "odendi" && <Link href={`/yonetim/abonelik?id=${p.id}`} aria-label={`İade talebi: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="underline">İade talebi</Link>}
                    {p.status === "iade_talep" && (
                      <div className="flex flex-wrap gap-3">
                        <RefundStatusForm action={withdrawRefundAction} paymentId={p.id} label="Talebi çek" ariaLabel={`İade talebini çek: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
                        {a.role === "sahip" && <RefundStatusForm action={approveRefundAction} paymentId={p.id} label="İade edildi" ariaLabel={`Ödemeyi iade edildi işaretle: ${day(p.createdAt)}, ${formatTL(p.amount)}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60" />}
                      </div>
                    )}
                  </td>
                </tr>
                {sp.id === p.id && p.status === "odendi" && (
                  <tr><td colSpan={8} className="bg-surface-2 px-4 py-4">
                    <RefundRequestForm action={requestRefundAction} paymentId={p.id} hint={hint} />
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      <Card className="mt-6 p-5 text-sm text-ink-2">
        <h2 className="mb-1 font-semibold text-ink">İptal</h2>
        <p className="break-words">Abonelik otomatik yenilenmez: yeni dönem için ödeme yapmamanız aboneliği dönem sonunda eritir, ayrıca işlem gerekmez. Dönem bitince 7 günlük ek süre sonrasında yönetim paneli salt okunur olur; kasa satışa devam eder, verileriniz silinmez. Hesap ve verilerin tamamen silinmesini isterseniz {contact ? `${contact} adresine` : <Link href="/iletisim" className="underline">İletişim sayfasındaki adrese</Link>} yazmanız yeterli. Koşulların tamamı: <Link href="/yasal/iade-iptal" className="underline">İptal ve iade</Link>.</p>
      </Card>
    </>
  );
}
