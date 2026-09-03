"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle, StaffAvatar } from "@/components/ui";
import { BarChart, LineChart, Donut } from "@/components/charts";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import {
  addDaysISO,
  dailyRevenueSeries,
  monthlyRevenueSeries,
  formatTRY,
  popularServices,
  rangeRevenue,
  serviceById,
  shortDate,
  staffPerformance,
  todayISO,
} from "@/lib/utils";
import { rangeCashSummary, totalReceivable } from "@/lib/finance";

const DONUT_COLORS = ["#2F5BEA", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

// Çok noktalı seride (örn. 90 gün) ekseni seyrelt: ~7 etiket göster, gerisi boş.
function labelEvery(i: number, total: number, dateIso: string): string {
  const step = Math.max(1, Math.ceil(total / 7));
  return i % step === 0 || i === total - 1 ? shortDate(dateIso) : "";
}

export default function RaporlarPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [range, setRange] = useState<7 | 30 | 90>(30);

  const daily = useMemo(() => dailyRevenueSeries(state, range), [state, range]);
  const monthly = useMemo(() => monthlyRevenueSeries(state, 6), [state]);
  const popular = useMemo(() => popularServices(state).filter((p) => p.count > 0), [state]);
  const perf = useMemo(() => staffPerformance(state), [state]);

  const revenue = rangeRevenue(state, range);
  // Seçili döneme (fromDate..bugün) filtrele — tüm KPI'lar "Dönem cirosu" ile aynı pencerede olsun.
  const fromDate = useMemo(() => addDaysISO(todayISO(), -(range - 1)), [range]);
  // Reddedilen online talepleri (approval === "reddedildi") hiçbir metriğe karıştırma.
  // (Ciro/prim zaten status==="geldi" sayar; reddedilen status "bekliyor"da kalır, ama gelme oranı
  //  ve adet sayımlarının da etkilenmediğinden emin olmak için baştan filtreliyoruz.)
  const inRange = useMemo(
    () => state.appointments.filter((a) => a.date >= fromDate && a.date <= todayISO() && a.approval !== "reddedildi"),
    [state, fromDate]
  );
  const served = inRange.filter((a) => a.status === "geldi").length;
  const cancelled = inRange.filter((a) => a.status === "iptal").length;
  const showRate = served + cancelled > 0 ? Math.round((served / (served + cancelled)) * 100) : 100;
  // Ort. işlem = dönem cirosu / dönemdeki fiyatlı gelme adedi (revenue ile aynı pencere)
  const rangeServedPriced = useMemo(
    () =>
      inRange.filter(
        (a) => a.status === "geldi" && (serviceById(state, a.serviceId)?.price ?? 0) > 0
      ).length,
    [inRange, state]
  );
  const avgTicket = rangeServedPriced > 0 ? Math.round(revenue / rangeServedPriced) : 0;

  // Ciro ≠ tahsilat. Rapor ekranı bu ikisini AYRI gösterir; net, tahsilattan gideri düşer.
  const cash = useMemo(() => rangeCashSummary(state, range), [state, range]);
  const receivable = useMemo(() => totalReceivable(state), [state]);

  // CSV indir (Excel-TR uyumlu: ";" ayraç, UTF-8 BOM). Personel performansı + dönem özeti.
  function downloadCSV() {
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""');
      return /[";\n]/.test(s) ? `"${s}"` : s;
    };
    const rows: (string | number)[][] = [];
    rows.push([`${state.businessName} — Rapor`]);
    rows.push([`Dönem`, `Son ${range} gün (${fromDate} – ${todayISO()})`]);
    rows.push([]);
    rows.push(["Dönem özeti"]);
    rows.push(["Dönem cirosu", revenue]);
    rows.push(["Gelme oranı (%)", showRate]);
    rows.push(["Tamamlanan randevu", served]);
    rows.push(["İptal", cancelled]);
    rows.push(["Ortalama işlem (TRY)", avgTicket]);
    rows.push(["Tahsil edilen (TRY)", cash.collected]);
    rows.push(["Gider (TRY)", cash.expenses]);
    rows.push(["Net (tahsilat - gider) (TRY)", cash.net]);
    rows.push(["Toplam acik alacak (TRY)", receivable]);
    rows.push([]);
    rows.push([`${terms.staff} performansı (tüm dönem)`]);
    rows.push([terms.staff, "Tamamlanan", "Ciro (TRY)", "Prim (TRY)"]);
    for (const p of perf) rows.push([p.staff.name, p.served, p.revenue, p.commission]);
    rows.push([]);
    rows.push([`Popüler ${terms.service.toLowerCase()}ler`]);
    rows.push([terms.service, "Adet", "Ciro (TRY)"]);
    for (const p of popular) rows.push([p.service.name, p.count, p.revenue]);

    const csv = rows.map((r) => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapor-${todayISO()}-son${range}gun.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const donutSegs = popular.slice(0, 6).map((p, i) => ({ label: p.service.name, value: p.count, color: DONUT_COLORS[i % DONUT_COLORS.length] }));
  // Donut merkezi = gösterilen segmentlerin toplamı (tüm dönem popüler hizmetler), böylece dilimlerle tutar.
  const donutTotal = donutSegs.reduce((s, x) => s + x.value, 0);
  const maxPerf = Math.max(1, ...perf.map((p) => p.revenue));

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle sub="Ciro, performans ve hizmet analizleri">Raporlar</SectionTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-canvas p-0.5">
              {([7, 30, 90] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${range === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                  {r === 7 ? "7 gün" : r === 30 ? "30 gün" : "3 ay"}
                </button>
              ))}
            </div>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              CSV indir
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi label="Dönem cirosu" value={formatTRY(revenue)} accent="#10B981" hint="hak edilen" />
          <Kpi label="Tahsil edilen" value={formatTRY(cash.collected)} accent="#2F5BEA" hint="kasaya giren" />
          <Kpi label="Gider" value={formatTRY(cash.expenses)} accent="#EF4444" hint="kasadan çıkan" />
          <Kpi
            label="Net"
            value={formatTRY(cash.net)}
            accent={cash.net >= 0 ? "#8B5CF6" : "#EF4444"}
            hint="tahsilat − gider"
          />
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi label="Gelme oranı" value={`%${showRate}`} accent="#2F5BEA" hint={`${served} geldi · ${cancelled} iptal`} />
          <Kpi label="Tamamlanan" value={`${served}`} accent="#F59E0B" hint="randevu" />
          <Kpi label="Ort. işlem" value={formatTRY(avgTicket || 0)} accent="#8B5CF6" hint="işlem başı ciro" />
          <Kpi label="Açık alacak" value={formatTRY(receivable)} accent="#F59E0B" hint="tahsil edilmemiş" />
        </div>

        {/* Ciro trendi */}
        <Card className="mt-4 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">Günlük ciro trendi</h3>
            <span className="text-[12.5px] text-muted">Son {range} gün</span>
          </div>
          <LineChart data={daily.map((d, i) => ({ label: labelEvery(i, daily.length, d.date), value: d.value }))} height={200} format={(n) => formatTRY(n)} />
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          {/* Aylık */}
          <Card className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold text-ink">Aylık ciro</h3>
            <BarChart data={monthly} height={190} format={(n) => formatTRY(n)} />
          </Card>

          {/* Popüler hizmet donut */}
          <Card className="p-5">
            <h3 className="mb-3 text-[15px] font-semibold text-ink">Popüler {terms.service.toLowerCase()}ler</h3>
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <Donut segments={donutSegs} size={132} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-[20px] font-700 text-ink">{donutTotal}</span>
                  <span className="text-[10.5px] text-muted">işlem</span>
                </div>
              </div>
              <ul className="flex-1 space-y-1.5">
                {donutSegs.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 truncate text-ink">{s.label}</span>
                    <span className="tnum font-medium text-muted">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        {/* Personel performans */}
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-ink">{terms.staff} performansı (tüm dönem)</h3>
          </div>
          <ul className="divide-y divide-line">
            {perf.map((p) => (
              <li key={p.staff.id} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <StaffAvatar staff={p.staff} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ink">{p.staff.name}</div>
                    <div className="text-[12px] text-muted">{p.served} tamamlanan · {formatTRY(p.commission)} prim</div>
                  </div>
                  <div className="tnum text-[15px] font-semibold text-ink">{formatTRY(p.revenue)}</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full" style={{ width: `${(p.revenue / maxPerf) * 100}%`, background: p.staff.color }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} /> {label}
      </div>
      <div className="mt-2 tnum font-display text-[24px] font-700 leading-none tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1.5 truncate text-[12px] text-muted">{hint}</div>}
    </Card>
  );
}
