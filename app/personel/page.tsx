"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle, StaffAvatar } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import { formatTRY, staffPerformance, todayISO } from "@/lib/utils";
import { IcWallet, IcSpark } from "@/components/icons";

type Range = "bugun" | "tum";

export default function PersonelPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [range, setRange] = useState<Range>("bugun");

  const perf = useMemo(
    () => staffPerformance(state, range === "bugun" ? todayISO() : undefined),
    [state, range]
  );

  const totalRevenue = perf.reduce((s, p) => s + p.revenue, 0);
  const totalCommission = perf.reduce((s, p) => s + p.commission, 0);
  const netRevenue = totalRevenue - totalCommission;
  const maxRevenue = Math.max(1, ...perf.map((p) => p.revenue));

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle sub="Hizmet bazlı prim oranı ve otomatik ciro hesabı">
            {terms.staff} & Prim
          </SectionTitle>
          <div className="flex rounded-lg bg-canvas p-0.5">
            {(["bugun", "tum"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  range === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {r === "bugun" ? "Bugün" : "Tüm dönem"}
              </button>
            ))}
          </div>
        </div>

        {/* Toplamlar */}
        <div className="mt-5 grid grid-cols-3 gap-3.5">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
              <IcWallet className="h-4 w-4 text-brand" /> Toplam ciro
            </div>
            <div className="mt-1.5 tnum font-display text-[24px] font-700 text-ink">{formatTRY(totalRevenue)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
              <IcSpark className="h-4 w-4 text-amber" /> Ödenecek prim
            </div>
            <div className="mt-1.5 tnum font-display text-[24px] font-700 text-amber">{formatTRY(totalCommission)}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">İşletmeye kalan</div>
            <div className="mt-1.5 tnum font-display text-[24px] font-700 text-mint">{formatTRY(netRevenue)}</div>
          </Card>
        </div>

        {/* Personel tablosu */}
        <Card className="mt-4 overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_repeat(4,1fr)] gap-2 border-b border-line px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted sm:grid">
            <span>{terms.staff}</span>
            <span className="text-right">Randevu</span>
            <span className="text-right">Tamamlanan</span>
            <span className="text-right">Ciro</span>
            <span className="text-right">Prim</span>
          </div>
          <ul className="divide-y divide-line">
            {perf.map((p) => (
              <li key={p.staff.id} className="px-5 py-3.5">
                <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1.6fr_repeat(4,1fr)]">
                  <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                    <StaffAvatar staff={p.staff} size={36} />
                    <div>
                      <div className="text-[14px] font-semibold text-ink">{p.staff.name}</div>
                      <div className="text-[12px] text-muted">{p.staff.role}</div>
                    </div>
                  </div>
                  <Cell label="Randevu" value={`${p.appointments}`} />
                  <Cell label="Tamamlanan" value={`${p.served}`} />
                  <Cell label="Ciro" value={formatTRY(p.revenue)} strong />
                  <Cell label="Prim" value={formatTRY(p.commission)} className="text-mint" strong />
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(p.revenue / maxRevenue) * 100}%`, background: p.staff.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Hizmet prim oranları */}
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-ink">{terms.service} prim oranları</h3>
            <p className="text-[12.5px] text-muted">Her hizmet için personele giden pay</p>
          </div>
          <ul className="divide-y divide-line">
            {state.services.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 text-[14px] font-medium text-ink">{s.name}</div>
                <div className="tnum text-[13px] text-muted">{s.durationMin} dk</div>
                {s.price > 0 && <div className="tnum w-24 text-right text-[13.5px] font-medium text-ink">{formatTRY(s.price)}</div>}
                <div className="flex w-32 items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${s.commissionRate * 100}%` }} />
                  </div>
                  <span className="tnum w-10 text-right text-[13px] font-semibold text-brand">
                    %{Math.round(s.commissionRate * 100)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

function Cell({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="text-right">
      <span className="mr-1.5 text-[11px] text-muted sm:hidden">{label}</span>
      <span className={`tnum text-[13.5px] ${strong ? "font-semibold" : ""} ${className || "text-ink"}`}>{value}</span>
    </div>
  );
}
