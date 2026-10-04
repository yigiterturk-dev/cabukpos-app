import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChartColumn, CheckCircle2, Minus, Monitor, Package, Plus, TriangleAlert, UserPlus } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { summaryData } from "@/lib/admin/report";
import { istToday, pctChange } from "@/lib/core/report";
import { moneyFormatter } from "@/lib/admin/currency";
import { foldTabs } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";
import { Badge, buttonClass, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const CHANNEL: Record<string, string> = { kasa: "Kasa", masa: "Masa", paket: "Paket", platform: "Platform" };
const hm = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

function Stat({ label, value, now, before, testId }: { label: string; value: string; now: number; before: number; testId: string }) {
  const p = pctChange(now, before);
  const Trend = p === null ? Minus : p < 0 ? ArrowDownRight : p > 0 ? ArrowUpRight : Minus;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#ee6318] to-[#f6a45c]" />
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
  const { sum, critical, recent, storeId, setup, attention } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await scopedStoreId(tx, a.tenantId);
    const S = schema.sales;
    const recent = await tx.select({ id: S.id, receiptNo: S.receiptNo, channel: S.channel, status: S.status, total: S.total, at: S.createdAt, staff: schema.staff.name })
      .from(S).innerJoin(schema.staff, eq(schema.staff.id, S.staffId)).where(inArray(S.status, ["kapandi", "iade"])).orderBy(desc(S.createdAt)).limit(8);
    const [productSeed, deviceSeed, staffSeed, reviewSales, reviewEvents, rejectedDocs, fiscalErrors, buyerInvoices] = await Promise.all([
      tx.select({ id: schema.products.id }).from(schema.products).limit(1),
      tx.select({ id: schema.devices.id }).from(schema.devices).limit(1),
      tx.select({ id: schema.staff.id }).from(schema.staff).limit(1),
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
      sum: await summaryData(tx, { bas: today, bit: today }),
      critical: storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [],
      recent,
      setup: { product: productSeed.length > 0, device: deviceSeed.length > 0, staff: staffSeed.length > 0 },
      attention: { review, fiscal, buyer, total: review + fiscal + buyer },
    };
  });
  const open = restoran && storeId ? [...foldTabs(await initialEvents({ tenantId: a.tenantId, storeId })).values()].filter((t) => !t.closed) : [];
  const openTotal = open.reduce((t, x) => t + x.remaining, 0);
  const dateLabel = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
  const setupSteps = [
    { label: "İlk ürünü ekle", href: "/yonetim/urunler", done: setup.product, Icon: Plus },
    { label: "Kasa cihazını eşleştir", href: "/yonetim/cihazlar", done: setup.device, Icon: Monitor },
    { label: "Personel PIN'i oluştur", href: "/yonetim/personel", done: setup.staff, Icon: UserPlus },
  ];

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
      {!setupSteps.every((step) => step.done) && (
        <Card className="mb-6 overflow-hidden border-brand-ring bg-brand-soft/30" data-testid="setup-guide">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-ring/70 px-5 py-4">
            <div>
              <h2 className="font-semibold">İlk kurulumu tamamlayın</h2>
              <p className="mt-1 text-sm text-ink-2">ÇabukPOS’u satışa hazır hale getirmek için üç kısa adım.</p>
            </div>
            <Link href="/kasa" className={buttonClass("primary", "sm")}>Kasayı aç<ArrowRight aria-hidden className="size-4" /></Link>
          </div>
          <div className="grid gap-px bg-brand-ring/60 sm:grid-cols-3">
            {setupSteps.map(({ label, href, done, Icon }, index) => (
              <Link key={label} href={href} className="group flex items-center gap-3 bg-white/75 px-5 py-4 outline-none transition hover:bg-white focus-visible:ring-4 focus-visible:ring-brand-ring/60">
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
        <Card className="mb-6 border-warn/30 bg-warn-soft/30" data-testid="attention-card">
          <div className="flex items-start gap-3 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn"><TriangleAlert aria-hidden className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Dikkat gerekenler <span className="text-warn">({attention.total})</span></h2>
              <p className="mt-1 text-sm text-ink-2">Satış akışı devam eder; aşağıdaki kayıtları uygun olduğunuzda kontrol edin.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {attention.review > 0 && <Link href="/yonetim/raporlar?sekme=inceleme" className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-white px-3 font-medium text-warn hover:bg-warn-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-warn/20">İncelenecek ({attention.review})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
                {attention.fiscal > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=error" className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-white px-3 font-medium text-warn hover:bg-warn-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-warn/20">Mali belgeler ({attention.fiscal})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
                {attention.buyer > 0 && <Link href="/yonetim/raporlar?sekme=inceleme" className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-white px-3 font-medium text-warn hover:bg-warn-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-warn/20">Alıcı iadeleri ({attention.buyer})<ArrowRight aria-hidden className="ml-1.5 size-4" /></Link>}
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className={`mb-6 grid gap-4 sm:grid-cols-2 ${restoran ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Stat label="Ciro" value={formatTL(sum.now.gross)} now={sum.now.gross} before={sum.before.gross} testId="today-gross" />
        <Stat label="Fiş" value={String(sum.now.count)} now={sum.now.count} before={sum.before.count} testId="today-count" />
        <Stat label="Ortalama sepet" value={sum.now.avg === null ? "—" : formatTL(sum.now.avg)} now={sum.now.avg ?? 0} before={sum.before.avg ?? 0} testId="today-avg" />
        {restoran && (
          <Card className="relative overflow-hidden border-brand-ring bg-brand-soft/30 p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-brand" />
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">Açık adisyon</div>
            <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular" data-testid="today-open">{open.length}</div>
            <div className="mt-2 text-xs text-ink-2 tabular">{open.length ? `${formatTL(openTotal)} tahsil edilecek` : "şu an açık yok"}</div>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Son satışlar</h2>
            <Link href="/yonetim/raporlar?sekme=vardiyalar" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">Vardiyalar<ArrowRight aria-hidden className="size-3.5" /></Link>
          </div>
          {recent.length === 0 ? <div className="p-4"><Empty>Henüz satış yok. Kasadan ilk satışı yapınca burada görünür.</Empty></div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted"><tr><th className="px-4 py-2.5 font-medium">Saat</th><th className="px-4 py-2.5 font-medium">Fiş</th><th className="px-4 py-2.5 font-medium">Kanal</th><th className="px-4 py-2.5 font-medium">Personel</th><th className="px-4 py-2.5 text-right font-medium">Tutar</th></tr></thead>
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
            </table></div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className={critical.length ? "border-red-200" : ""}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold">{critical.length > 0 && <TriangleAlert aria-hidden className="size-4 text-bad" />}Kritik stok</h2>
              <Link href="/yonetim/stok?kritik=1" className="text-sm text-brand hover:underline">Stok</Link>
            </div>
            {critical.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Sınırın altında ürün yok.</p> : (
              <ul className="divide-y divide-line text-sm">
                {critical.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular text-bad">{formatQty(c.level, c.unit)} <span className="text-xs text-muted">/ {formatQty(c.minStock!, c.unit)}</span></span>
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
                  <li key={c.key} className="flex items-baseline justify-between px-4 py-2.5"><span>{c.label} <span className="text-xs text-muted tabular">· {c.count} fiş</span></span><span className="font-medium tabular">{formatTL(c.gross)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Link href="/yonetim/urunler" className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3 text-sm shadow-card hover:border-line-strong">
            <Package aria-hidden className="size-4 text-muted" /><span className="flex-1">Ürün ve fiyatlar</span><ArrowRight aria-hidden className="size-4 text-muted" />
          </Link>
        </div>
      </div>
    </>
  );
}
