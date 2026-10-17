// Müşteri sipariş ekranı (herkese açık): tab kimliği bilinüyorsa durum gösterilir; kapanana dek kendini yeniler.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { kioskStatus, menuByStore } from "@/lib/kiosk";
import { foldTabs, lineGross, type TabEvent } from "@/lib/core/tab";
import { optionsText } from "@/lib/core/options";
import { formatReceipt, isCurrency } from "@/lib/core/money";
import { clientIp, hit } from "@/lib/ratelimit";
import type { TabEv } from "@/lib/core/tab";
import { OrderRefresh } from "./OrderRefresh";
import { SkipToContent } from "@/components/SkipToContent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sipariş durumu", robots: { index: false, follow: false } };

type Ev = { type: string; at: string; payload: TabEv };
const formatQty = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format;

export default async function Siparis({ params }: { params: Promise<{ storeId: string; tabId: string }> }) {
  const { storeId, tabId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !/^[0-9a-f-]{36}$/i.test(tabId)) notFound();
  if ((await hit(`siparis:${await clientIp()}`, 1)) > 60) {
    return <main className="grid min-h-dvh place-items-center p-8 text-center text-sm text-ink-2">Çok fazla istek. Bir dakika sonra tekrar deneyin.</main>;
  }
  const menu = await menuByStore(storeId);
  if (!menu) notFound();
  const [tenant] = await getDb().select({ currency: schema.tenants.currency }).from(schema.stores).innerJoin(schema.tenants, eq(schema.tenants.id, schema.stores.tenantId)).where(eq(schema.stores.id, storeId));
  const currency = isCurrency(tenant?.currency) ? tenant.currency : "TRY";
  const rows = (await getDb().execute(sql`select public_tab_events(${storeId}::uuid, ${tabId}::uuid) as e`)) as unknown as { e: Ev[] }[];
  const events = rows[0]?.e ?? [];
  if (!events.length) notFound();
  const tabEvents: TabEvent[] = events.map((event, index) => ({ id: `public-${index}`, tabId, tableId: null, at: event.at, staffId: null, approvedBy: null, seq: index, ev: event.payload }));
  const tab = foldTabs(tabEvents).get(tabId);
  if (!tab) notFound();
  const st = kioskStatus(events);
  const order = tab.order;
  const liveLines = tab.lines.filter((line) => !line.voided);
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <SkipToContent />
      <header className="mb-6">
        <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-brand" title={menu.tenant}>{menu.tenant}</p>
        <h1 id="main-content" tabIndex={-1} className="break-words rounded-sm font-display text-2xl font-bold text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" title={menu.store}>{menu.store}</h1>
      </header>
      <section aria-label="Durum" className="mb-6 rounded-[18px] border border-line bg-surface p-5 text-center shadow-card">
        <div className={`mx-auto mb-3 grid size-14 place-items-center rounded-full text-2xl ${st.step === "iptal" ? "bg-bad-soft" : st.step === "tamam" ? "bg-ok-soft" : "bg-brand-soft"}`}>
          {st.step === "iptal" ? "✕" : st.step === "tamam" ? "✓" : st.step === "yolda" ? "🛎️" : "⏳"}
        </div>
        <p className="break-words text-lg font-semibold text-ink" data-testid="siparis-durum" role="status" aria-live="polite" aria-atomic="true">{st.label}</p>
        {st.etaAt && !st.closed && <p className="mt-1 text-sm text-muted">Tahmini bitiş: ~{st.etaAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</p>}
        {order?.name && <p className="mt-1 break-words text-sm text-muted" title={order.name}>Sipariş: {order.name}</p>}
      </section>
      <section aria-label="Sipariş içeriği" className="rounded-[18px] border border-line bg-surface p-5 shadow-card">
        <ul className="divide-y divide-line text-sm">
          {liveLines.map((line) => (
            <li key={line.lineId} className="flex items-center gap-3 py-2">
              <span className="tabular w-10 text-muted">{formatQty(line.qtyMilli / 1000)}×</span>
              <span className="min-w-0 flex-1 break-words" title={line.name}>
                <span className="block">{line.name}{line.comped ? " · ikram" : ""}</span>
                {line.options.length > 0 && <span className="block text-xs text-muted">{optionsText(line.options)}</span>}
                {line.note && <span className="block text-xs text-warn">Not: {line.note}</span>}
              </span>
              <span className="shrink-0 tabular">{formatReceipt(line.comped ? 0 : lineGross(line), currency)}</span>
            </li>
          ))}
        </ul>
        {tab.discountAmount > 0 && <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm"><span>İndirim</span><span className="tabular">−{formatReceipt(tab.discountAmount, currency)}</span></div>}
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
          <span>Toplam</span>
          <span className="tabular" data-testid="siparis-toplam">{formatReceipt(tab.total, currency)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Ödeme kasada yapılır.</p>
      </section>
      <OrderRefresh closed={st.closed} />
    </main>
  );
}
