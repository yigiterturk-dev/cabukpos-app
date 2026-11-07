import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, ChartColumn, CheckCircle2, LayoutGrid, Minus, Monitor, Package, Plus, TriangleAlert, UserPlus } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { summaryData } from "@/lib/admin/report";
import { demandForecast } from "@/lib/admin/forecast";
import { istToday, pctChange } from "@/lib/core/report";
import { moneyFormatter } from "@/lib/admin/currency";
import { foldTabs } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { OrnekMenuButton } from "@/components/admin/OrnekMenuButton";

export const dynamic = "force-dynamic";
const CHANNEL: Record<string, string> = { kasa: "Kasa", masa: "Masa", paket: "Paket", platform: "Platform" };
const hm = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

function Stat({ label, value, now, before, testId }: { label: string; value: string; now: number; before: number; testId: string }) {
  const p = pctChange(now, before);
  const Trend = p === null ? Minus : p < 0 ? ArrowDownRight : p > 0 ? ArrowUpRight : Minus;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
        <span className="rounded-full bg-surface-3 px-2 py-1 text-[11px] font-medium text-muted">Bugün</span>
      </div>
      <div className="mt-2 font-display text-[32px] font-bold leading-none tracking-[-0.02em] tabular" data-testid={testId}>{value}</div>
      <div className={`mt-2 inline-flex items-center gap-1 text-xs tabular ${p === null ? "text-muted" : p < 0 ? "text-bad" : p > 0 ? "text-ok" : "text-muted"}`}>
        <Trend aria-hidden className="size-3.5" />
        {p === null ? "dün karşılaştırması yok" : `${p >= 0 ? "+" : ""}${p.toFixed(1)}% düne göre`}
      </div>
    </Card>
  );
}

export default async function Bugun() {
  const a = await requireAdmin();
  const today = istToday();
  const restoran = a.vertical === "restoran";
  const formatTL = await moneyFormatter(a.tenantId); // #16: işletme para birimiyle biçimler
  const { sum, critical, recent, storeId, setup, attention, forecast } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId, a.storeId);
    const S = schema.sales;
    const recent = await tx.select({ id: S.id, receiptNo: S.receiptNo, channel: S.channel, status: S.status, total: S.total, at: S.createdAt, staff: schema.staff.name })
      .from(S).innerJoin(schema.staff, eq(schema.staff.id, S.staffId)).where(and(inArray(S.status, ["kapandi", "iade"]), storeId ? eq(S.storeId, storeId) : sql`false`)).orderBy(desc(S.createdAt)).limit(8);
    const [productSeed, deviceSeed, staffSeed, saleSeed, tableSeed, reviewSales, reviewEvents, rejectedDocs, fiscalErrors, buyerInvoices] = await Promise.all([
      tx.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.active, true), eq(schema.products.sellable, true))).limit(1),
      tx.select({ id: schema.devices.id }).from(schema.devices).where(and(eq(schema.devices.role, "kasa"), isNotNull(schema.devices.pairedAt), isNull(schema.devices.revokedAt))).limit(1),
      tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.active, true)).limit(1),
      tx.select({ id: schema.sales.id }).from(schema.sales).limit(1),
      tx.select({ id: schema.tables.id }).from(schema.tables).where(eq(schema.tables.active, true)).limit(1),
      tx.select({ value: count() }).from(schema.sales).where(isNotNull(schema.sales.review)),
      tx.select({ value: count() }).from(schema.tabEvents).where(isNotNull(schema.tabEvents.review)),
      tx.select({ value: count() }).from(schema.auditLog).where(eq(schema.auditLog.action, "sync.red")),
      tx.select({ value: count() }).from(schema.fiscalDocuments).where(inArray(schema.fiscalDocuments.status, ["error", "cancel_rejected"])),
      tx.select({ value: count() }).from(schema.fiscalRefunds).where(and(eq(schema.fiscalRefunds.kind, "alici_faturasi"), isNull(schema.fiscalRefunds.resolvedAt))),
    ]);
    const review = Number(reviewSales[0]?.value ?? 0) + Number(reviewEvents[0]?.value ?? 0) + Number(rejectedDocs[0]?.value ?? 0);
    const fiscal = Number(fiscalErrors[0]?.value ?? 0);
    const buyer = Number(buyerInvoices[0]?.value ?? 0);
    return {
      storeId,
      sum: await summaryData(tx, { bas: today, bit: today }, storeId),
      forecast: await demandForecast(tx, storeId),
      critical: storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [],
      recent,
      setup: { product: productSeed.length > 0, device: deviceSeed.length > 0, staff: staffSeed.length > 0, sale: saleSeed.length > 0, tables: tableSeed.length > 0 },
      attention: { review, fiscal, buyer, total: review + fiscal + buyer },
    };
  });
  const open = restoran && storeId ? [...foldTabs(await initialEvents({ tenantId: a.tenantId, storeId })).values()].filter((t) => !t.closed) : [];
  const openTotal = open.reduce((t, x) => t + x.remaining, 0);
  const dateLabel = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
  const setupSteps = [
    { label: "Şube oluştur", href: "/yonetim/subeler", done: Boolean(storeId), Icon: Package },
    { label: "Personel ekle", href: "/yonetim/personel", done: setup.staff, Icon: UserPlus },
    { label: "Ürünleri ekle (tek tek veya CSV ile)", href: "/yonetim/urunler", done: setup.product, Icon: Plus },
    ...(restoran ? [{ label: "Salonu kur (bölüm + masa sayısı)", href: "/yonetim/salon", done: setup.tables, Icon: LayoutGrid }] : []),
    { label: "Kasa tabletini bağla", href: "/yonetim/cihazlar", done: setup.device, Icon: Monitor },
    { label: "Kasayı aç ve ilk satışı yap", href: "/kasa", done: setup.sale, Icon: CheckCircle2 },
  ];
  const setupDone = setupSteps.filter((step) => step.done).length;
  const nextSetupStep = setupSteps.find((step) => !step.done);
  // Türkiye saatiyle selam: panoya her gelişte küçük bir sıcaklık dokunuşu.
  const hour = Number(new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date()));
  const selam = hour >= 5 && hour < 12 ? "Günaydın" : hour >= 12 && hour < 18 ? "İyi günler" : hour >= 18 && hour < 23 ? "İyi akşamlar" : "İyi geceler";

  return (
    <>
      <PageHeader
        title="Bugün"
        desc={`${dateLabel} · iadeler düşülmüş brüt rakamlar`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/kasa" className={buttonClass("primary")}><Monitor aria-hidden className="size-4" />Kasa ekranı</Link>
            <Link href="/yonetim/raporlar" className={buttonClass("secondary")}><ChartColumn aria-hidden className="size-4" />Tüm raporlar</Link>
          </div>
        }
      />
      {setupSteps.every((step) => step.done) && recent.length <= 1 && (
        <Card className="relative mb-6 overflow-hidden border-ok/40 bg-ok-soft/30" data-testid="setup-done">
          {/* Tek seferlik kutlama: küçük konfeti serpintisi (najis-hareket tercihine saygılı). */}
          <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
            {[["6%", "bg-ok"], ["18%", "bg-brand"], ["32%", "bg-brand-action"], ["46%", "bg-ok"], ["60%", "bg-brand"], ["74%", "bg-brand-action"], ["88%", "bg-ok"]].map(([left, dot], i) => (
              <span key={i} style={{ left, animationDelay: `${i * 90}ms` }} className={`absolute top-1.5 size-1.5 rounded-full opacity-0 ${dot} [animation:setupConfetti_1.3s_ease-out_1_forwards]`} />
            ))}
          </div>
          <div className="relative flex items-center gap-3 px-5 py-4">
            <CheckCircle2 aria-hidden className="size-5 shrink-0 text-ok" />
            <p className="text-sm text-ink-2"><strong className="font-semibold">Kurulum tamam, kasa satışa hazır — Bravo {a.name.split(/\s+/)[0]}!</strong> Bu pano artık günlük işlerini izler; aklına takılan olursa yan menüdeki Yardım ve kurulum sayfasında adım adım anlatım var.</p>
          </div>
        </Card>
      )}
      {!setupSteps.every((step) => step.done) && (
        <Card className="mb-6 overflow-hidden border-brand-ring bg-brand-soft/30" data-testid="setup-guide">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-ring/70 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-semibold">{selam}, {a.name.split(/\s+/)[0]} <span className="ml-1 text-sm font-normal text-muted">({setupDone}/{setupSteps.length} adım tamam)</span></h2>
              <p className="mt-1 break-words text-sm text-ink-2">Kasayı satışa hazırlamak için {setupSteps.length - setupDone} kısa adım kaldı. {nextSetupStep ? `Sıradaki: ${nextSetupStep.label}.` : ""} Her adım bir sayfa — doldur, dön, devam et.</p>
              {!setup.product && <div className="mt-3"><OrnekMenuButton /></div>}
            </div>
            <Link href={nextSetupStep?.href ?? "/kasa"} aria-label={nextSetupStep ? `Kuruluma devam et: ${nextSetupStep.label}` : "Kasayı aç"} className={`${buttonClass("primary", "lg")} shrink-0`}>Kuruluma devam et<ArrowRight aria-hidden className="size-4" /></Link>
          </div>
          <div className="grid gap-px bg-brand-ring/60 sm:grid-cols-2 lg:grid-cols-5">
            {setupSteps.map(({ label, href, done, Icon }, index) => (
              <Link key={label} href={href} className="group flex items-center gap-3 bg-surface/75 px-5 py-4 outline-none transition hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-ring/60">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${done ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand"}`}>
                  {done ? <CheckCircle2 aria-hidden className="size-5" /> : <Icon aria-hidden className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">Adım {index + 1}</span>
                  <span className={`block text-sm font-medium ${done ? "text-muted line-through" : "text-ink"}`}>{label}</span>
                </span>
                {!done && <ArrowRight aria-hidden className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />}
              </Link>
            ))}
          </div>
        </Card>
      )}
      {attention.total > 0 && (
        <Card className={`mb-6 ${attention.fiscal > 0 ? "border-bad/30 bg-bad-soft/25" : "border-warn/30 bg-warn-soft/30"}`} data-testid="attention-card">
          <div className="flex items-start gap-3 px-5 py-4">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${attention.fiscal > 0 ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}><TriangleAlert aria-hidden className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Öncelik gerekenler <span className={attention.fiscal > 0 ? "text-bad" : "text-warn"}>({attention.total})</span></h2>
                <Link href="/yonetim/bildirimler" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/20"><Bell aria-hidden className="size-3.5" />Tüm bildirimler<ArrowRight aria-hidden className="size-3.5" /></Link>
              </div>
              <p className="mt-1 text-sm text-ink-2">İşletme genelindeki mali ve inceleme kayıtları. Satış akışı devam eder; aşağıdaki kayıtları uygun olduğunuzda kontrol edin.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {attention.review > 0 && <Link href="/yonetim/raporlar?sekme=inceleme" className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-surface px-3 font-medium text-warn hover:bg-warn-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-warn/20">İncelenecek ({attention.review})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
                {attention.fiscal > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=oncelik" className="inline-flex min-h-11 items-center rounded-lg border border-bad/30 bg-surface px-3 font-medium text-bad hover:bg-bad-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bad/20">Mali belgeler ({attention.fiscal})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
                {attention.buyer > 0 && <Link href="/yonetim/raporlar?sekme=inceleme" className="inline-flex min-h-11 items-center rounded-lg border border-brand/25 bg-surface px-3 font-medium text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/20">Alıcı iadeleri ({attention.buyer})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className={`mb-6 grid gap-4 sm:grid-cols-2 ${restoran ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <Stat label="Ciro" value={formatTL(sum.now.gross)} now={sum.now.gross} before={sum.before.gross} testId="today-gross" />
        <Stat label="Fiş" value={String(sum.now.count)} now={sum.now.count} before={sum.before.count} testId="today-count" />
        <Stat label="Ortalama sepet" value={sum.now.avg === null ? "—" : formatTL(sum.now.avg)} now={sum.now.avg ?? 0} before={sum.before.avg ?? 0} testId="today-avg" />
        {restoran && (
          <Card className="relative overflow-hidden border-brand-ring bg-brand-soft/30 p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-brand-action" />
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">Açık adisyon</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular" data-testid="today-open">{open.length}</div>
            <div className="mt-2 text-xs text-ink-2 tabular">{open.length ? `${formatTL(openTotal)} tahsil edilecek` : "şu an açık yok"}</div>
          </Card>
        )}
      </div>

      {forecast && (
        <Card className="mb-6 p-5" data-testid="forecast-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-semibold">Önümüzdeki 7 gün tahmini</h2>
              <p className="mt-1 break-words text-sm text-muted">Son {forecast.basisDays} günün günlük cirosundan kanıta dayalı tahmin. Aralık dışında kesinlik iddia edilmez.</p>
            </div>
            <span className="shrink-0"><Badge tone={forecast.trend === "artiyor" ? "ok" : forecast.trend === "azaliyor" ? "bad" : "neutral"}>
              {forecast.trend === "artiyor" ? "Eğilim artıyor" : forecast.trend === "azaliyor" ? "Eğilim azalıyor" : "Eğilim düz"}
            </Badge></span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-brand/25 bg-brand-soft/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand">Beklenen ciro</div>
              <div className="mt-1 font-display text-2xl font-bold tabular" data-testid="forecast-estimate">{formatTL(forecast.periodEstimate)}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Aralık (~%80)</div>
              <div className="mt-1 tabular text-sm font-medium text-ink-2">{formatTL(forecast.low)} – {formatTL(forecast.high)}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Günlük ortalama</div>
              <div className="mt-1 tabular text-sm font-medium text-ink-2">{formatTL(forecast.dailyMean)} <span className="text-xs text-muted">± {formatTL(forecast.dailyStd)}</span></div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Son satışlar</h2>
            <Link href="/yonetim/raporlar?sekme=vardiyalar" className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Vardiyalar<ArrowRight aria-hidden className="size-3.5" /></Link>
          </div>
          {recent.length === 0 ? <div className="p-4"><Empty>Henüz satış yok. Kasadan ilk satışı yapınca burada görünür.</Empty></div> : (
            <>
            <ul aria-label="Son satışlar" className="divide-y divide-line text-sm lg:hidden">
              {recent.map((r) => (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs">Fiş {r.receiptNo}</p><p className="mt-1 break-words text-ink-2">{r.staff}</p></div><p className={`shrink-0 tabular font-semibold ${r.status === "iade" ? "text-bad" : ""}`}>{r.status === "iade" ? "−" : ""}{formatTL(r.total)}</p></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{CHANNEL[r.channel] ?? r.channel}{r.status === "iade" && <span className="ml-2"><Badge tone="bad">İade</Badge></span>}</span><time dateTime={r.at.toISOString()}>{istToday(r.at.getTime()) === today ? hm(r.at) : r.at.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" })}</time></div>
                </li>
              ))}
            </ul>
            <HorizontalScrollRegion label="Son satışlar, yatay kaydırılabilir" className="hidden lg:block"><table aria-label="Son satışlar" className="w-full min-w-[640px] text-sm">
              <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Saat</th><th scope="col" className="px-4 py-2.5 font-medium">Fiş</th><th scope="col" className="px-4 py-2.5 font-medium">Kanal</th><th scope="col" className="px-4 py-2.5 font-medium">Personel</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Tutar</th></tr></thead>
              <tbody className="divide-y divide-line">
                {recent.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2.5 tabular text-muted">{istToday(r.at.getTime()) === today ? hm(r.at) : r.at.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" })}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.receiptNo}</td>
                    <td className="px-4 py-2.5">{CHANNEL[r.channel] ?? r.channel}{r.status === "iade" && <span className="ml-2"><Badge tone="bad">İade</Badge></span>}</td>
                    <td className="px-4 py-2.5 text-ink-2">{r.staff}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular ${r.status === "iade" ? "text-bad" : ""}`}>{r.status === "iade" ? "−" : ""}{formatTL(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table></HorizontalScrollRegion>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card className={critical.length ? "border-bad/25" : ""}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold">{critical.length > 0 && <TriangleAlert aria-hidden className="size-4 text-bad" />}Kritik stok</h2>
              <Link href="/yonetim/stok?kritik=1" className="inline-flex min-h-11 items-center rounded px-1 text-sm text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Stok</Link>
            </div>
            {critical.length === 0 ? <p className="px-4 py-3 text-sm text-muted">{storeId ? "Sınırın altında ürün yok." : <>Kritik stok takibi için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</>}</p> : (
              <ul className="divide-y divide-line text-sm">
                {critical.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 break-words font-medium">{c.name}</span>
                    <span className="shrink-0 tabular text-bad">{formatQty(c.level, c.unit)} <span className="text-xs text-muted">/ {formatQty(c.minStock!, c.unit)}</span></span>
                  </li>
                ))}
                {critical.length > 8 && <li className="px-4 py-2.5 text-xs text-muted">+{critical.length - 8} ürün daha</li>}
              </ul>
            )}
          </Card>
          <Card>
            <div className="border-b border-line px-4 py-3"><h2 className="font-semibold">Kanallar</h2></div>
            {sum.channels.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Bugün satış yok.</p> : (
              <ul className="divide-y divide-line text-sm">
                {sum.channels.map((c) => (
                  <li key={c.key} className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-2.5"><span className="min-w-0 break-words">{c.label} <span className="text-xs text-muted tabular">· {c.count} fiş</span></span><span className="shrink-0 font-medium tabular">{formatTL(c.gross)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Link href="/yonetim/urunler" className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 text-sm shadow-card outline-none hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60">
            <Package aria-hidden className="size-4 text-muted" /><span className="flex-1">Ürün ve fiyatlar</span><ArrowRight aria-hidden className="size-4 text-muted" />
          </Link>
        </div>
      </div>
    </>
  );
}
