import Link from "next/link";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { heatData, productData, staffData, staffEvents, summaryData } from "@/lib/admin/report";
import { parseRange, REPORT_TABS, type ReportTab } from "@/lib/core/report";
import { Card, PageHeader } from "@/components/ui";
import { RangeBar, reportHref } from "@/components/reports/RangeBar";
import { ReportMailCard } from "@/components/admin/ReportMailCard";
import { SummaryTab } from "@/components/reports/SummaryTab";
import { HeatTab } from "@/components/reports/HeatTab";
import { ProductsTab } from "@/components/reports/ProductsTab";
import { StaffTab } from "@/components/reports/StaffTab";
import { ProfitTab } from "@/components/reports/ProfitTab";
import { ShiftsTab } from "@/components/reports/ShiftsTab";
import { ReviewTab } from "@/components/reports/ReviewTab";
import { MusterilerTab } from "@/components/reports/MusterilerTab";
import { rfmData } from "@/lib/admin/rfm";
import { prevMonth } from "@/lib/admin/report-mail";
import { moneyFormatter } from "@/lib/admin/currency";

export const dynamic = "force-dynamic";
const DESC: Record<ReportTab, string> = {
  ozet: "Ciro, fiş ve ortalama sepet; önceki eşit uzunluktaki döneme göre değişim. İadeler düşülür.",
  yogunluk: "Haftanın günü × saat bazında ciro (İstanbul saati).",
  urunler: "Ürün ve kategori bazında adet ve brüt ciro; hiç satılmayan aktif ürünler.",
  personel: "Kişi başına satış ve iade, iptal, ikram, indirim, sepetten silme. İsme tıklayınca olay listesi.",
  vardiyalar: "Vardiya (gün sonu) raporları. Son 200 vardiya.",
  karlilik: "Ürün kârlılığı: KDV hariç net ciro, satış anındaki maliyet, brüt kâr. İadeler düşülür.",
  inceleme: "Çevrimdışı kasadan gelip kabul edilen ama işaretlenen kayıtlar: fiyat farkı, silinmiş ürün, fiş no çakışması, fazla iade, platform hatası.",
  musteriler: "Kayıtlı müşteri, RFM segmentleri ve kohort retention. Paket sipariş telefonundan bağlanır; iadeler düşülür.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Raporlar({ searchParams }: { searchParams: Promise<{ sekme?: string; bas?: string; bit?: string; sirala?: string; kisi?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const sp = await searchParams;
  const tab = REPORT_TABS.find((t) => t.key === sp.sekme) ?? REPORT_TABS[0];
  const range = parseRange(sp.bas, sp.bit);
  const sort = sp.sirala === "adet" ? "adet" : "ciro";
  const kisi = sp.kisi && UUID.test(sp.kisi) ? sp.kisi : null;
  const critical = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    return storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [];
  });
  const mailSettings = tab.key === "ozet"
    ? (await withTenant(a.tenantId, (tx) => tx.select().from(schema.reportSettings)))[0] ?? null
    : null;

  let body: React.ReactNode;
  if (tab.key === "ozet") body = <SummaryTab d={await withTenant(a.tenantId, (tx) => summaryData(tx, range))} money={money} />;
  else if (tab.key === "yogunluk") body = <HeatTab h={await withTenant(a.tenantId, (tx) => heatData(tx, range))} money={money} />;
  else if (tab.key === "urunler") body = <ProductsTab d={await withTenant(a.tenantId, (tx) => productData(tx, range, sort))} range={range} sort={sort} money={money} />;
  else if (tab.key === "personel") {
    const [rows, events] = await withTenant(a.tenantId, async (tx) => [await staffData(tx, range), kisi ? await staffEvents(tx, range, kisi) : null] as const);
    body = <StaffTab rows={rows} range={range} kisi={kisi} events={events} money={money} />;
  }   else if (tab.key === "karlilik") body = <ProfitTab tenantId={a.tenantId} range={range} />;
  else if (tab.key === "inceleme") body = <ReviewTab tenantId={a.tenantId} range={range} />;
  else if (tab.key === "musteriler") body = <MusterilerTab data={await withTenant(a.tenantId, (tx) => rfmData(tx, a.tenantId))} money={money} />;
  else body = <ShiftsTab tenantId={a.tenantId} />;

  return (
    <>
      <PageHeader title="Raporlar" desc={DESC[tab.key]} />
      {critical.length > 0 && (
        <Card className="mb-6 border-bad/25 bg-bad-soft p-4" data-testid="critical-card">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold text-bad">Kritik stok ({critical.length})</h2><Link href="/yonetim/stok?kritik=1" className="rounded px-1 text-sm text-bad outline-none hover:underline focus-visible:ring-4 focus-visible:ring-bad/20">Stok</Link></div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{critical.map((c) => <li key={c.id} title={c.name} className="min-w-0 truncate rounded-lg border border-bad/20 bg-canvas/40 px-3 py-2"><b>{c.name}</b> <span className="tabular">{formatQty(c.level, c.unit)}</span> <span className="text-muted">(sınır {formatQty(c.minStock!, c.unit)})</span></li>)}</ul>
        </Card>
      )}
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-2 lg:z-30 lg:bg-canvas/95 lg:py-1 lg:backdrop-blur" role="tablist" aria-label="Rapor">
        {REPORT_TABS.map((t) => <Link key={t.key} href={reportHref(t.key, t.range ? range : undefined)} role="tab" aria-selected={t.key === tab.key} className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${t.key === tab.key ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-ink-2 hover:bg-surface-2"}`}>{t.label}</Link>)}
      </div>
      {tab.key === "musteriler" ? (
        <div className="mb-4"><Link className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" href="/yonetim/raporlar/csv?sekme=musteriler" download>CSV indir</Link></div>
      ) : tab.range ? <RangeBar sekme={tab.key} range={range} csv={tab.csv ? tab.key : null} print extra={tab.key === "urunler" ? { sirala: sp.sirala } : tab.key === "personel" ? { kisi: kisi ?? undefined } : {}} /> : null}
      {mailSettings && <ReportMailCard initial={{ daily: mailSettings.daily, weekly: mailSettings.weekly, monthly: mailSettings.monthly }} />}
      {tab.key === "ozet" && <Card className="mb-6 p-4 text-sm"><a className="rounded px-1 font-medium text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60" href={`/yonetim/raporlar/konsolide?ay=${prevMonth()}`}>Aylık konsolide raporu aç ({prevMonth()})</a><span className="ml-2 text-muted">— yazdır/PDF; e-posta ayarı yukarıda.</span></Card>}
      {body}
    </>
  );
}
