import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { firstStoreId, stockLevels } from "@/lib/admin/stock";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { heatData, productData, staffData, staffEvents, summaryData } from "@/lib/admin/report";
import { parseRange, REPORT_TABS, type ReportTab } from "@/lib/core/report";
import { Card, PageHeader } from "@/components/ui";
import { RangeBar, reportHref } from "@/components/reports/RangeBar";
import { SummaryTab } from "@/components/reports/SummaryTab";
import { HeatTab } from "@/components/reports/HeatTab";
import { ProductsTab } from "@/components/reports/ProductsTab";
import { StaffTab } from "@/components/reports/StaffTab";
import { ProfitTab } from "@/components/reports/ProfitTab";
import { ShiftsTab } from "@/components/reports/ShiftsTab";

export const dynamic = "force-dynamic";
const DESC: Record<ReportTab, string> = {
  ozet: "Ciro, fiş ve ortalama sepet; önceki eşit uzunluktaki döneme göre değişim. İadeler düşülür.",
  yogunluk: "Haftanın günü × saat bazında ciro (İstanbul saati).",
  urunler: "Ürün ve kategori bazında adet ve brüt ciro; hiç satılmayan aktif ürünler.",
  personel: "Kişi başına satış ve iade, iptal, ikram, indirim, sepetten silme. İsme tıklayınca olay listesi.",
  vardiyalar: "Vardiya (gün sonu) raporları. Son 200 vardiya.",
  karlilik: "Ürün kârlılığı: KDV hariç net ciro, satış anındaki maliyet, brüt kâr. İadeler düşülür.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Raporlar({ searchParams }: { searchParams: Promise<{ sekme?: string; bas?: string; bit?: string; sirala?: string; kisi?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const tab = REPORT_TABS.find((t) => t.key === sp.sekme) ?? REPORT_TABS[0];
  const range = parseRange(sp.bas, sp.bit);
  const sort = sp.sirala === "adet" ? "adet" : "ciro";
  const kisi = sp.kisi && UUID.test(sp.kisi) ? sp.kisi : null;
  const critical = await withTenant(a.tenantId, async (tx) => {
    const storeId = await firstStoreId(tx);
    return storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [];
  });

  let body: React.ReactNode;
  if (tab.key === "ozet") body = <SummaryTab d={await withTenant(a.tenantId, (tx) => summaryData(tx, range))} />;
  else if (tab.key === "yogunluk") body = <HeatTab h={await withTenant(a.tenantId, (tx) => heatData(tx, range))} />;
  else if (tab.key === "urunler") body = <ProductsTab d={await withTenant(a.tenantId, (tx) => productData(tx, range, sort))} range={range} sort={sort} />;
  else if (tab.key === "personel") {
    const [rows, events] = await withTenant(a.tenantId, async (tx) => [await staffData(tx, range), kisi ? await staffEvents(tx, range, kisi) : null] as const);
    body = <StaffTab rows={rows} range={range} kisi={kisi} events={events} />;
  } else if (tab.key === "karlilik") body = <ProfitTab tenantId={a.tenantId} range={range} />;
  else body = <ShiftsTab tenantId={a.tenantId} />;

  return (
    <>
      <PageHeader title="Raporlar" desc={DESC[tab.key]} />
      {critical.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4" data-testid="critical-card">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold text-red-800">Kritik stok ({critical.length})</h2><Link href="/yonetim/stok?kritik=1" className="text-sm text-red-800 underline">Stok</Link></div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{critical.map((c) => <li key={c.id}><b>{c.name}</b> <span className="tabular">{formatQty(c.level, c.unit)}</span> <span className="text-muted">(sınır {formatQty(c.minStock!, c.unit)})</span></li>)}</ul>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Rapor">
        {REPORT_TABS.map((t) => <Link key={t.key} href={reportHref(t.key, t.range ? range : undefined)} role="tab" aria-selected={t.key === tab.key} className={`rounded-lg border px-3 py-1.5 text-sm ${t.key === tab.key ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{t.label}</Link>)}
      </div>
      {tab.range && <RangeBar sekme={tab.key} range={range} csv={tab.csv ? tab.key : null} extra={tab.key === "urunler" ? { sirala: sp.sirala } : tab.key === "personel" ? { kisi: kisi ?? undefined } : {}} />}
      {body}
    </>
  );
}
