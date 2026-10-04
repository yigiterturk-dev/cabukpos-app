// Müşteri sipariş ekranı (herkese açık): tab kimliği bilinüyorsa durum gösterilir; kapanana dek kendini yeniler.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { kioskStatus, menuByStore } from "@/lib/kiosk";
import { formatTL } from "@/lib/core/money";
import { clientIp, hit } from "@/lib/ratelimit";
import type { TabEv } from "@/lib/core/tab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sipariş durumu", robots: { index: false, follow: false } };

type Ev = { type: string; at: string; payload: TabEv };

export default async function Siparis({ params }: { params: Promise<{ storeId: string; tabId: string }> }) {
  const { storeId, tabId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !/^[0-9a-f-]{36}$/i.test(tabId)) notFound();
  if ((await hit(`siparis:${await clientIp()}`, 1)) > 60) {
    return <main className="grid min-h-dvh place-items-center p-8 text-center text-sm text-ink-2">Çok fazla istek. Bir dakika sonra tekrar deneyin.</main>;
  }
  const menu = await menuByStore(storeId);
  if (!menu) notFound();
  const rows = (await getDb().execute(sql`select public_tab_events(${storeId}::uuid, ${tabId}::uuid) as e`)) as unknown as { e: Ev[] }[];
  const events = rows[0]?.e ?? [];
  if (!events.length) notFound();
  const st = kioskStatus(events);
  const order = events.find((e) => e.type === "order")?.payload as Extract<TabEv, { type: "order" }> | undefined;
  const adds = events.filter((e) => e.type === "add").map((e) => e.payload as Extract<TabEv, { type: "add" }>);
  const total = adds.reduce((s, l) => s + Math.round((l.unitPrice * l.qtyMilli) / 1000), 0);
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      {!st.closed && <meta httpEquiv="refresh" content="20" />}
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{menu.tenant}</p>
        <h1 className="font-display text-2xl font-bold text-ink">{menu.store}</h1>
      </header>
      <section aria-label="Durum" className="mb-6 rounded-[18px] border border-line bg-surface p-5 text-center shadow-card">
        <div className={`mx-auto mb-3 grid size-14 place-items-center rounded-full text-2xl ${st.step === "iptal" ? "bg-bad-soft" : st.step === "tamam" ? "bg-ok-soft" : "bg-brand-soft"}`}>
          {st.step === "iptal" ? "✕" : st.step === "tamam" ? "✓" : st.step === "yolda" ? "🛎️" : "⏳"}
        </div>
        <p className="text-lg font-semibold text-ink" data-testid="siparis-durum">{st.label}</p>
        {st.etaAt && !st.closed && <p className="mt-1 text-sm text-muted">Tahmini bitiş: ~{st.etaAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</p>}
        {order?.name && <p className="mt-1 text-sm text-muted">Sipariş: {order.name}</p>}
      </section>
      <section aria-label="Sipariş içeriği" className="rounded-[18px] border border-line bg-surface p-5 shadow-card">
        <ul className="divide-y divide-line text-sm">
          {adds.map((l) => (
            <li key={l.lineId} className="flex items-center gap-3 py-2">
              <span className="tabular w-10 text-muted">{l.qtyMilli / 1000}×</span>
              <span className="min-w-0 flex-1">{l.name}</span>
              <span className="tabular">{formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold">
          <span>Toplam</span>
          <span className="tabular" data-testid="siparis-toplam">{formatTL(total)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Ödeme kasada yapılır.</p>
      </section>
      <p className="mt-6 text-center text-xs text-muted">Bu sayfa sipariş bitene dek kendiliğinden yenilenir.</p>
    </main>
  );
}
