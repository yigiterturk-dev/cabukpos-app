"use client";

import { useState, useTransition } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore, PLAN_PRICE, PLAN_LABEL } from "@/lib/store";
import { formatTRY, prettyDate } from "@/lib/utils";
import type { PlanId } from "@/lib/types";
import { IcCheck, IcCard, IcSpark } from "@/components/icons";
import { startCheckoutAction } from "@/lib/data/actions";
import { isUpgrade } from "@/lib/payments/plans";

// soon: üründe henüz olmayan, yol haritasındaki özellik — "yakında" rozeti gösterilir (dürüstlük).
type Feature = { text: string; soon?: boolean };
const PLANS: { id: PlanId; tagline: string; features: Feature[]; highlight?: boolean }[] = [
  {
    id: "baslangic",
    tagline: "Tek nokta, yeni başlayanlar için",
    features: [
      { text: "1 işletme · 3 kullanıcı" },
      { text: "Randevu takvimi & müşteri (CRM)" },
      { text: "Online rezervasyon + QR" },
      { text: "Ödeme & kasa (tahsilat)" },
      { text: "Aylık 250 SMS / WhatsApp" },
      { text: "Temel raporlar" },
    ],
  },
  {
    id: "profesyonel",
    tagline: "Büyüyen işletmeler için",
    features: [
      { text: "Solo’daki her şey dahil" },
      { text: "Sınırsız kullanıcı" },
      { text: "WhatsApp / SMS randevu hatırlatma" },
      { text: "Personel & prim + kampanya" },
      { text: "Online ön ödeme & kapora", soon: true },
      { text: "Gelişmiş raporlar & analiz" },
    ],
    highlight: true,
  },
  {
    id: "isletme",
    tagline: "Çok şube ve zincir işletmeler için",
    features: [
      { text: "Pro’daki her şey dahil" },
      { text: "Çoklu şube & şube bazlı rapor", soon: true },
      { text: "Sadakat / üyelik & paket satışı", soon: true },
      { text: "API & entegrasyonlar", soon: true },
      { text: "Rol bazlı yetkilendirme", soon: true },
      { text: "Öncelikli destek" },
    ],
  },
];

export default function AbonelikPage() {
  const { state, changePlan } = useStore();
  const sub = state.subscription;
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function say(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function pick(id: PlanId) {
    if (id === sub.planId || pending) return;

    // Düşürme / aynı plan → ücret yok, doğrudan uygula.
    if (!isUpgrade(sub.planId, id)) {
      changePlan(id);
      say(`${PLAN_LABEL[id]} planına geçildi.`);
      return;
    }

    // Yükseltme → ödeme sayfasına git. Plan burada DEĞİŞMEZ; yalnız doğrulanmış
    // ödeme webhook'u değiştirir (bkz. app/api/payments/webhook).
    startTransition(async () => {
      const res = await startCheckoutAction(id);
      if (res.ok) {
        window.location.href = res.redirectUrl;
        return;
      }
      say(res.error);
    });
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1100px]">
        <SectionTitle sub="Komisyonsuz, aylık sabit. İstediğiniz zaman değiştirin.">Abonelik</SectionTitle>

        {/* Mevcut plan banner */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-white shadow-card">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><IcCard className="h-5 w-5 text-brand-soft" /></span>
            <div>
              <div className="text-[12px] uppercase tracking-wide text-white/50">Mevcut plan</div>
              <div className="font-display text-[20px] font-700">{PLAN_LABEL[sub.planId]} · {formatTRY(PLAN_PRICE[sub.planId])}/ay</div>
            </div>
          </div>
          <div className="text-right text-[13px] text-white/70">
            <div>Sonraki yenileme</div>
            <div className="font-semibold text-white">{sub.nextRenewal ? prettyDate(sub.nextRenewal) : "—"}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-mint/30 bg-mint/5 px-4 py-2.5 text-[13px] text-mint">
          <IcSpark className="h-4 w-4" /> Yanında POS komisyon almaz — cironuzun tamamı sizde kalır.
        </div>

        {/* Planlar */}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => {
            const current = p.id === sub.planId;
            return (
              <Card key={p.id} className={`relative flex flex-col p-5 ${p.highlight ? "ring-2 ring-brand" : ""}`}>
                {p.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">Popüler</span>
                )}
                <div className="text-[15px] font-semibold text-ink">{PLAN_LABEL[p.id]}</div>
                <div className="text-[12.5px] text-muted">{p.tagline}</div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display text-[30px] font-700 tracking-tight text-ink">{formatTRY(PLAN_PRICE[p.id])}</span>
                  <span className="mb-1.5 text-[13px] text-muted">/ay</span>
                </div>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px] text-ink">
                      <IcCheck className={`h-4 w-4 shrink-0 ${f.soon ? "text-muted/50" : "text-mint"}`} />
                      <span className={f.soon ? "text-muted" : ""}>{f.text}</span>
                      {f.soon && (
                        <span className="ml-auto shrink-0 rounded-full bg-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber">yakında</span>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => pick(p.id)}
                  disabled={current || pending}
                  className={`mt-5 rounded-xl py-2.5 text-[14px] font-semibold transition-colors ${
                    current
                      ? "cursor-default border border-line bg-canvas text-muted"
                      : p.highlight
                      ? "bg-brand text-white hover:bg-brand-deep"
                      : "border border-line text-ink hover:border-brand hover:text-brand"
                  }`}
                >
                  {current
                    ? "Mevcut planınız"
                    : pending
                    ? "Yönlendiriliyor…"
                    : isUpgrade(sub.planId, p.id)
                    ? "Yükselt"
                    : "Bu plana geç"}
                </button>
              </Card>
            );
          })}
        </div>

        {/* Fatura geçmişi */}
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-ink">Fatura geçmişi</h3>
            <p className="text-[12.5px] text-muted">Ödeme sağlayıcısı bağlanınca yükseltme buradan yapılır</p>
          </div>
          <ul className="divide-y divide-line">
            {state.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas text-muted"><IcCard className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-ink">{inv.planLabel}</div>
                  <div className="text-[12px] text-muted">{prettyDate(inv.date)}</div>
                </div>
                <span className="tnum text-[14px] font-semibold text-ink">{formatTRY(inv.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${inv.status === "odendi" ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber"}`}>
                  {inv.status === "odendi" ? "Ödendi" : "Bekliyor"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-pop">{toast}</div>
      )}
    </Shell>
  );
}
