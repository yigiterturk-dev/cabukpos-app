"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { useStore } from "@/lib/store";
import { formatTRY } from "@/lib/utils";
import { sectorTerms } from "@/lib/sectors";
import { IcKitchen, IcClock, IcCheck } from "@/components/icons";

/** "HH:mm" → geçen dakika (bugün için). Dün/önceki günler için negatif değil, gün farkı eklenir. */
function minutesAgo(date: string, start: string, now: Date): number {
  const [h, m] = start.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const made = new Date(y, mo - 1, d, h || 0, m || 0).getTime();
  return Math.max(0, Math.round((now.getTime() - made) / 60000));
}

function elapsedLabel(min: number): string {
  if (min < 60) return `${min} dk`;
  return `${Math.floor(min / 60)} sa ${min % 60} dk`;
}

export default function MutfakPage() {
  const { state, updateAppointmentStatus, reload } = useStore();
  const terms = sectorTerms(state.sector);
  const [now, setNow] = useState(() => new Date());

  // Canlı saat + DB modunda 15 sn'de bir sunucu senkronu (başka terminalden gelen siparişler)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const r = setInterval(() => void reload(), 15_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [reload]);

  // Açık siparişler: "bekliyor" = alındı, hazırlanıyor
  const open = useMemo(
    () => state.appointments.filter((a) => a.status === "bekliyor"),
    [state.appointments]
  );

  // Masaya/hesaba göre grupla
  const groups = useMemo(() => {
    const map = new Map<string, typeof open>();
    for (const a of open) {
      const list = map.get(a.customerId) ?? [];
      list.push(a);
      map.set(a.customerId, list);
    }
    return [...map.entries()]
      .map(([customerId, items]) => {
        const oldest = items.reduce((acc, a) => (a.date + a.start < acc.date + acc.start ? a : acc), items[0]);
        const cust = state.customers.find((c) => c.id === customerId);
        return {
          customerId,
          title: cust?.name ?? terms.customer,
          items,
          total: items.reduce((s, a) => s + (a.priceSnapshot ?? 0), 0),
          waitMin: minutesAgo(oldest.date, oldest.start, now),
        };
      })
      .sort((a, b) => b.waitMin - a.waitMin);
  }, [open, state.customers, terms.customer, now]);

  function markReady(customerId: string) {
    const group = groups.find((g) => g.customerId === customerId);
    if (!group) return;
    for (const a of group.items) updateAppointmentStatus(a.id, "geldi");
  }

  function waitColor(min: number) {
    if (min >= 20) return "text-rose";
    if (min >= 10) return "text-amber";
    return "text-emerald-600";
  }

  function waitBg(min: number) {
    if (min >= 20) return "border-rose/40 bg-rose/5";
    if (min >= 10) return "border-amber/40 bg-amber/5";
    return "border-line bg-white";
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
              {terms.appointment} Ekranı
            </h1>
            <p className="mt-1 text-[14px] text-muted">
              Açık siparişler — hazır olunca işaretleyin. {open.length} açık ·{" "}
              <span className="tnum">{now.toLocaleTimeString("tr-TR")}</span>
            </p>
          </div>
          <button
            onClick={() => void reload()}
            className="rounded-xl bg-white px-4 py-2 text-[13.5px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/40"
          >
            Yenile
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
              <IcKitchen className="h-8 w-8 text-brand" />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-ink">Tüm siparişler hazır 🎉</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Yeni sipariş Masalar sayfasından alındığında burada görünür.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <div key={g.customerId} className={`rounded-2xl border p-4 shadow-card transition ${waitBg(g.waitMin)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-[18px] font-extrabold text-ink">{g.title}</p>
                    <p className={`mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold ${waitColor(g.waitMin)}`}>
                      <IcClock className="h-4 w-4" />
                      {elapsedLabel(g.waitMin)} önce alındı
                    </p>
                  </div>
                  <span className="tnum rounded-lg bg-canvas px-2 py-1 text-[12.5px] font-bold text-ink">
                    {formatTRY(g.total)}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5">
                  {g.items.map((a) => {
                    const svc = state.services.find((s) => s.id === a.serviceId);
                    return (
                      <div key={a.id} className="flex items-center justify-between rounded-lg bg-canvas/60 px-3 py-2">
                        <span className="text-[14px] font-medium text-ink">
                          {a.serviceNameSnapshot ?? svc?.name ?? "?"}
                        </span>
                        <span className="text-[12.5px] text-muted">
                          {a.start}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => markReady(g.customerId)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white transition hover:bg-brand-deep"
                >
                  <IcCheck className="h-4.5 w-4.5" />
                  Hazırlandı
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
