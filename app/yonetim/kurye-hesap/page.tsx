import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { courierAccount } from "@/lib/admin/courier-account";
import { moneyFormatter } from "@/lib/admin/currency";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
import { Badge, buttonClass, Card, Empty, Input, PageHeader, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function CourierAccountPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const a = await requireAdmin(), params = await searchParams;
  const today = istToday(), min = istToday(Date.parse(`${today}T12:00:00+03:00`), -366);
  const day = params.day && isValidCalendarDay(params.day) && params.day >= min && params.day <= today ? params.day : today;
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) return <Empty>Önce bir şube oluşturun.</Empty>;
  const money = await moneyFormatter(a.tenantId);
  let report;
  try { report = await courierAccount({ tenantId: a.tenantId, storeId }, day); }
  catch { return <><PageHeader title="Kurye ödemeleri" desc="Tahsilat ve vardiya kapanışları" /><p role="alert">Kurye hesabı yüklenemedi. Sayfayı yenileyin veya daha sonra tekrar deneyin.</p></>; }
  return <>
    <PageHeader title="Kurye ödemeleri" desc="Kurye cihazlarının gerçek ödeme kayıtları ve nakit sayımları." actions={<PrintButton />} />
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 print:hidden"><label className="grid gap-1 text-sm">Rapor günü<Input type="date" name="day" defaultValue={day} min={min} max={today} /></label><button className={buttonClass("secondary")} type="submit">Göster</button><Link className={buttonClass("secondary")} href={`/yonetim/kurye-hesap/csv?day=${day}`}>CSV indir</Link><Link className={buttonClass("ghost")} href="/kasa">Kasaya dön</Link></form>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard label="Net nakit tahsilatı" value={money(report.daily.byMethod.nakit)} /><StatCard label="Net kart tahsilatı" value={money(report.daily.byMethod.kart)} /><StatCard label="Online ödeme" value={money(report.daily.byMethod.online)} /><StatCard label="Günlük iade" value={money(report.daily.refundTotal)} /></div>
    <p className="mb-5 text-sm text-muted">Günlük tutarlar ödeme tarihine göredir; para üstü ve iadeler düşülmüştür. Kapanış hesabı vardiyanın tamamını kapsar: açılış nakdi + net nakit − kasaya bırakılan tutar. Online ve kart ödemeleri nakit hesabına eklenmez.</p>
    {report.reviewCount > 0 && <p role="alert" className="mb-5 rounded-xl bg-warn-soft p-4 text-warn">Bu günün {report.reviewCount} işlemi inceleme bekliyor. Tutarları rapora dahildir; kapanıştan önce kontrol edin.</p>}
    {!report.rows.length ? <Empty>Bu gün için kurye vardiyası yok. Kurye telefonunda vardiya açıp tahsilat yaptığınızda burada görünür.</Empty> : <div className="space-y-4">{report.rows.map(r => <Card key={r.id} className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{r.courier}</h2><p className="text-sm text-muted">{r.device} · {dt(r.openedAt)} → {r.closedAt ? dt(r.closedAt) : "Devam ediyor"}</p></div><Badge tone={r.closedAt ? r.variance === 0 && !r.changedAfterClose ? "ok" : "bad" : "neutral"}>{r.closedAt ? r.variance === null ? "Sayım eksik" : r.changedAfterClose ? "Yeniden kontrol edin" : r.variance === 0 ? "Hesap tutuyor" : "Nakit farkı var" : "Açık vardiya"}</Badge></div>
      <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[["Bugün nakit", r.daily.byMethod.nakit], ["Bugün kart", r.daily.byMethod.kart], ["Vardiya beklenen nakit", r.summary.expectedCash], ["Sayılan nakit", r.countedCash], ["Nakit farkı", r.variance], ["Açılış nakdi", r.openingCash], ["Kasaya bırakılan", r.summary.dropped], ["Yemek kartı / hediye kartı", r.daily.byMethod.yemek_karti + r.daily.byMethod.hediye_karti]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted">{label}</dt><dd className="tabular text-lg font-semibold">{value === null ? "Henüz sayılmadı" : money(value as number)}</dd></div>)}</dl>
      {r.changedAfterClose && <p role="alert" className="mt-4 text-sm text-warn">Kapanışta beklenen {r.savedExpected === null ? "—" : money(r.savedExpected)} idi. Eşitlenen kayıtlarla hesap değişti; yeniden kontrol edin.</p>}
      {r.reviewCount > 0 && <p className="mt-3 text-sm text-warn">Vardiyada {r.reviewCount} incelenecek işlem var.</p>}
      <Link href={`/yonetim/raporlar/${r.id}`} className="mt-4 inline-flex min-h-11 items-center font-medium text-brand underline">Fişleri ve vardiya raporunu incele →</Link>
    </Card>)}</div>}
    <Card className="mt-5 p-5"><h2 className="font-semibold">Hesap nasıl kapanır?</h2><p className="mt-2 text-sm text-muted">Kurye telefonunda “Hesap kapat” adımında sayılan nakit girilir. Sayım burada kalıcı olarak görünür. Bu ekran ayrıca satış veya kasa girişi oluşturmaz; tahsilat iki kez yazılmaz. Henüz buluta eşitlenmemiş telefon kayıtları geldikçe tutarlar güncellenir.</p></Card>
  </>;
}
