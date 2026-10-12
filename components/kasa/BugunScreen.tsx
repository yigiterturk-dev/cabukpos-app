"use client";
// "Bugün" özet ekranı: vardiyanın canlı özeti (ciro, satış, açık adisyon, hazır bekleyen) + hızlı geçiş karoları.
// Gating değildir: kasada varsayılan ekran hâlâ satış/salon; burası isteğe bağlı bir segment.
import { useEffect, useState } from "react";
import { kasaFmt } from "./kasa-format";
import { summarizeShift } from "@/lib/core/shift";
import { shiftSales } from "@/lib/offline/db";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { ActionTile, StatCard } from "@/components/ui";
import { Bike, ChefHat, LayoutGrid, Receipt, ShoppingBasket, Users, Wallet, Zap } from "lucide-react";

type Summary = ReturnType<typeof summarizeShift>;

export function BugunScreen({ meta, tabs, hasSalon, hasPaket, onGoSale, onGoSalon, onGoPaket }: {
  meta: Meta; tabs: Map<string, TabState>;
  hasSalon: boolean; hasPaket: boolean;
  onGoSale: () => void; onGoSalon: () => void; onGoPaket: () => void;
}) {
  const { TL } = kasaFmt(meta);
  const shift = meta.shift;
  const [sum, setSum] = useState<Summary | null>(null);
  const [sales, setSales] = useState<LocalSale[]>([]);

  useEffect(() => {
    if (!shift) return;
    let alive = true;
    void shiftSales(shift.id).then((s) => {
      if (!alive) return;
      setSales(s);
      setSum(summarizeShift(shift.openingCash, s, (meta.drops ?? []).map((d) => d.amount)));
    });
    return () => { alive = false; };
  }, [shift, meta.drops]);

  const open = [...tabs.values()].filter((t) => !t.closed);
  const ready = open.reduce((a, t) => a + t.tickets.filter((k) => k.status === "hazir").length, 0);
  const waiting = open.filter((t) => t.kind === "platform" && deliveryStatus(t) === "onay_bekliyor").length;
  const recent = [...sales].reverse().slice(0, 5);
  const since = shift ? new Date(shift.openedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }) : "";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Bugün</h1>
        <p className="mt-1 text-sm text-muted">
          {meta.device?.tenantName} · {meta.device?.name}{shift && ` · vardiya ${since}'de açıldı`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ciro (KDV dahil)" value={sum ? TL(sum.gross) : "—"} tone="brand" icon={<Wallet />} hint={sum && sum.refundCount > 0 ? `${sum.refundCount} iade düşülmüş` : undefined} />
        <StatCard label="Satış" value={sum ? `${sum.saleCount}` : "—"} tone="ok" icon={<Receipt />} hint={sum ? `nakit ${TL(sum.byMethod.nakit)} · kart ${TL(sum.byMethod.kart)}` : undefined} />
        <StatCard label="Açık adisyon" value={`${open.length}`} tone="info" icon={<Users />} hint={waiting > 0 ? `${waiting} onay bekliyor` : undefined} />
        <StatCard label="Hazır bekleyen" value={`${ready}`} tone={ready > 0 ? "warn" : "neutral"} icon={<ChefHat />} />
      </div>

      <h2 className="mb-3 mt-7 font-display text-lg font-bold tracking-tight">Hızlı geçiş</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionTile icon={<Zap />} title="Hızlı satış" desc="Barkod okut ya da ürün seç" tone="brand" onClick={onGoSale} />
        {hasSalon && <ActionTile icon={<LayoutGrid />} title="Salon" desc="Masa ve adisyonları yönet" tone="neutral" onClick={onGoSalon} />}
        {hasPaket && <ActionTile icon={<Bike />} title="Paket" desc="Paket ve platform siparişleri" tone="neutral" onClick={onGoPaket} />}
      </div>

      {recent.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 font-display text-lg font-bold tracking-tight">Son fişler</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-rest">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <ShoppingBasket aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="tabular font-medium">{s.receiptNo}</span>
                <span className="text-muted">{new Date(s.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</span>
                {s.refund && <span className="rounded bg-bad-soft px-1.5 text-xs font-medium text-bad">iade</span>}
                <span className="tabular ml-auto font-semibold">{TL(s.refund ? -s.total : s.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-xs text-muted">Özet cihazda canlı güncellenir; bulut eşitlenince raporlara da yansır.</p>
    </main>
  );
}
