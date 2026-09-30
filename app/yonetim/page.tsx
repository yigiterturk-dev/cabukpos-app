import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChartColumn, Minus, Monitor, Package, TriangleAlert } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { firstStoreId, stockLevels } from "@/lib/admin/stock";
import { formatQty, isCriticalRow } from "@/lib/admin/stock-view";
import { summaryData } from "@/lib/admin/report";
import { istToday, pctChange } from "@/lib/core/report";
import { formatTL } from "@/lib/core/money";
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
      <div className="absolute inset-x-0 top-0 h-1 bg-brand/80" />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
        <span className="rounded-md bg-surface-3 px-2 py-1 text-[11px] text-muted">Bugün</span>
      </div>
      <div className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular" data-testid={testId}>{value}</div>
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
  const { sum, critical, recent, storeId } = await withTenant(a.tenantId, async (tx) => {
    const storeId = await firstStoreId(tx);
    const S = schema.sales;
    const recent = await tx.select({ id: S.id, receiptNo: S.receiptNo, channel: S.channel, status: S.status, total: S.total, at: S.createdAt, staff: schema.staff.name })
      .from(S).innerJoin(schema.staff, eq(schema.staff.id, S.staffId)).where(inArray(S.status, ["kapandi", "iade"])).orderBy(desc(S.createdAt)).limit(8);
    return {
      storeId,
      sum: await summaryData(tx, { bas: today, bit: today }),
      critical: storeId ? (await stockLevels(tx, storeId)).filter(isCriticalRow) : [],
      recent,
    };
  });
  const open = restoran && storeId ? [...foldTabs(await initialEvents({ tenantId: a.tenantId, storeId })).values()].filter((t) => !t.closed) : [];
  const openTotal = open.reduce((t, x) => t + x.remaining, 0);
  const dateLabel = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

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
