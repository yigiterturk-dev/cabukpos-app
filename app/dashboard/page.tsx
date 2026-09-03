"use client";

import { useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle, StatusChip, StaffAvatar } from "@/components/ui";
import { AddAppointmentModal } from "@/components/AddAppointmentModal";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import {
  appointmentsForDate,
  aptPrice,
  customerById,
  dayRevenue,
  formatTRY,
  prettyDate,
  serviceById,
  staffById,
  staffPerformance,
  todayISO,
} from "@/lib/utils";
import { IcPlus, IcCalendar, IcWallet, IcClock, IcSpark, IcCheck, IcX, IcUsers, IcLink, IcBell } from "@/components/icons";

export default function DashboardPage() {
  const { state, setApproval } = useStore();
  const [modal, setModal] = useState(false);
  const terms = sectorTerms(state.sector);
  const today = todayISO();

  // Onay bekleyen online talepler (approval === "bekliyor"). Bugüne/geleceğe ait, tarih+saat sıralı.
  const pendingApprovals = state.appointments
    .filter((a) => a.approval === "bekliyor")
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));

  // K2: reddedilen online talepleri tüm dashboard hesaplarından dışla (takvim/rapor ile tutarlı).
  const todays = appointmentsForDate(state, today).filter((a) => a.approval !== "reddedildi");
  const revenue = dayRevenue(state, today);
  const perf = staffPerformance(state, today);
  const served = todays.filter((a) => a.status === "geldi").length;
  const waiting = todays.filter((a) => a.status === "bekliyor").length;
  const expectedRevenue = todays
    .filter((a) => a.status !== "iptal")
    .reduce((s, a) => s + aptPrice(state, a), 0);

  const upcoming = todays
    .filter((a) => a.status === "bekliyor")
    .slice(0, 6);

  const totalCommission = perf.reduce((s, p) => s + p.commission, 0);
  const maxRevenue = Math.max(1, ...perf.map((p) => p.revenue));

  // Boş başlatma (empty seed): henüz müşteri ve randevu yoksa "Hızlı başlangıç" rehberi göster.
  const emptyStart = state.customers.length === 0 && state.appointments.length === 0;
  const checklist = [
    { done: state.services.length > 0, label: "İlk hizmetini ekle", href: "/hizmetler" },
    { done: state.staff.length > 0, label: `İlk ${terms.staff.toLowerCase()} ekle`, href: "/personel" },
    { done: state.customers.length > 0, label: `İlk ${terms.customer.toLowerCase()} ekle`, href: "/musteriler" },
    { done: state.appointments.length > 0, label: `İlk ${terms.appointment.toLowerCase()} oluştur`, href: "/takvim" },
    { done: false, label: "Online rezervasyon linkini paylaş", href: "/rezervasyon" },
  ];

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle sub={`Bugün ${todays.length} ${terms.appointment.toLowerCase()} · ${state.businessName}`}>
            Genel Bakış
          </SectionTitle>
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-[14px] font-semibold text-white shadow-card transition-colors hover:bg-brand-deep"
          >
            <IcPlus className="h-4 w-4" />
            Yeni {terms.appointment}
          </button>
        </div>

        {/* Boş başlangıç rehberi — yalnızca boş seed'de görünür */}
        {emptyStart && (
          <Card className="mt-5 overflow-hidden border-brand/30">
            <div className="flex items-center gap-2 border-b border-line bg-brand-soft/40 px-5 py-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand"><IcSpark className="h-4 w-4" /></span>
              <h3 className="text-[15px] font-semibold text-ink">Hızlı başlangıç</h3>
              <span className="text-[12.5px] text-muted">birkaç adımda hazır olun</span>
            </div>
            <ul className="divide-y divide-line">
              {checklist.map((item) => (
                <li key={item.href + item.label}>
                  <Link href={item.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas/60">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${item.done ? "bg-mint text-white" : "border border-line bg-surface text-muted"}`}>
                      {item.done ? <IcCheck className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted/50" />}
                    </span>
                    <span className={`flex-1 text-[13.5px] ${item.done ? "text-muted line-through" : "font-medium text-ink"}`}>{item.label}</span>
                    {!item.done && <span className="text-[13px] font-medium text-brand">Git →</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Hızlı aksiyonlar */}
        <div className="mt-5 flex flex-wrap gap-2.5">
          <QuickAction Icon={IcPlus} label={`Yeni ${terms.appointment}`} onClick={() => setModal(true)} primary />
          <QuickAction Icon={IcUsers} label={`${terms.customer} ekle`} href="/musteriler" />
          <QuickAction Icon={IcLink} label="Linki paylaş / QR" href="/rezervasyon" />
          <QuickAction Icon={IcBell} label="Hatırlatma" href="/hatirlatma" />
        </div>

        {/* KPI'lar */}
        <div className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi Icon={IcWallet} label="Bugünkü ciro" value={formatTRY(revenue)} accent="#10B981"
            hint={expectedRevenue > revenue ? `Beklenen ${formatTRY(expectedRevenue)}` : "Tamamlandı"} />
          <Kpi Icon={IcCalendar} label={terms.appointment} value={`${todays.length}`} accent="#2F5BEA"
            hint={`${served} geldi · ${waiting} bekliyor`} />
          <Kpi Icon={IcClock} label="Sıradaki" value={upcoming[0]?.start ?? "—"} accent="#F59E0B"
            hint={upcoming[0] ? customerById(state, upcoming[0].customerId)?.name ?? "" : (todays.length === 0 ? "Boş gün" : "Bekleyen yok")} />
          <Kpi Icon={IcSpark} label="Bugünkü prim" value={formatTRY(totalCommission)} accent="#8B5CF6"
            hint={`${terms.staff} payı`} />
        </div>

        {/* Onay bekleyen online talepler */}
        {pendingApprovals.length > 0 && (
          <Card className="mt-4 overflow-hidden border-amber/40">
            <div className="flex items-center justify-between border-b border-line bg-amber/[0.06] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber/15 text-amber"><IcClock className="h-4 w-4" /></span>
                <h3 className="text-[15px] font-semibold text-ink">Onay bekleyen {terms.appointment.toLowerCase()} talepleri</h3>
                <span className="rounded-full bg-amber px-2 py-0.5 text-[11px] font-bold text-white">{pendingApprovals.length}</span>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {pendingApprovals.map((a) => {
                const c = customerById(state, a.customerId);
                const svc = serviceById(state, a.serviceId);
                const st = staffById(state, a.staffId);
                return (
                  <li key={a.id} className="flex items-center gap-3.5 px-5 py-3">
                    {st && <StaffAvatar staff={st} size={34} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-medium text-ink">{c?.name}</span>
                        <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-brand-deep">online</span>
                      </div>
                      <div className="truncate text-[12.5px] text-muted">
                        {prettyDate(a.date)} · {a.start} · {svc?.name} · {st?.name}
                      </div>
                      {c?.phone && c.phone !== "—" && <div className="truncate text-[11.5px] text-muted">{c.phone}</div>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setApproval(a.id, "onaylandi")}
                        className="flex items-center gap-1 rounded-lg bg-mint/10 px-3 py-2 text-[12.5px] font-semibold text-mint transition-colors hover:bg-mint/20"
                      >
                        <IcCheck className="h-3.5 w-3.5" /> Onayla
                      </button>
                      <button
                        onClick={() => setApproval(a.id, "reddedildi")}
                        className="flex items-center gap-1 rounded-lg bg-rose/10 px-3 py-2 text-[12.5px] font-semibold text-rose transition-colors hover:bg-rose/20"
                      >
                        <IcX className="h-3.5 w-3.5" /> Reddet
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Sıradaki randevular */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 className="text-[15px] font-semibold text-ink">Bugün sırada</h3>
              <Link href="/takvim" className="text-[13px] font-medium text-brand hover:text-brand-deep">
                Takvime git →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <Empty label="Bekleyen randevu yok" cta="Randevu ekle" onClick={() => setModal(true)} />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((a) => {
                  const c = customerById(state, a.customerId);
                  const svc = serviceById(state, a.serviceId);
                  const st = staffById(state, a.staffId);
                  return (
                    <li key={a.id} className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-canvas/60">
                      <div className="w-[52px] shrink-0 tnum text-[15px] font-semibold text-ink">{a.start}</div>
                      {st && <StaffAvatar staff={st} size={34} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium text-ink">{c?.name}</span>
                          {a.source === "online" && (
                            <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-brand-deep">online</span>
                          )}
                          {a.approval === "bekliyor" && (
                            <span className="shrink-0 rounded-full bg-amber/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-amber">onay bekliyor</span>
                          )}
                        </div>
                        <div className="truncate text-[12.5px] text-muted">
                          {svc?.name} · {st?.name}
                        </div>
                      </div>
                      <div className="text-right">
                        {aptPrice(state, a) > 0 && (
                          <div className="tnum text-[14px] font-semibold text-ink">{formatTRY(aptPrice(state, a))}</div>
                        )}
                        <StatusChip status={a.status} size="xs" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Personel performansı */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 className="text-[15px] font-semibold text-ink">{terms.staff} performansı</h3>
              <Link href="/personel" className="text-[13px] font-medium text-brand hover:text-brand-deep">
                Detay →
              </Link>
            </div>
            <ul className="space-y-1 px-3 py-3">
              {perf.map((p) => (
                <li key={p.staff.id} className="rounded-xl px-2 py-2 transition-colors hover:bg-canvas/60">
                  <div className="flex items-center gap-3">
                    <StaffAvatar staff={p.staff} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">{p.staff.name}</div>
                      <div className="text-[11.5px] text-muted">
                        {p.served}/{p.appointments} tamamlandı
                      </div>
                    </div>
                    <div className="text-right tnum">
                      <div className="text-[13.5px] font-semibold text-ink">{formatTRY(p.revenue)}</div>
                      <div className="text-[11.5px] text-mint">+{formatTRY(p.commission)} prim</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(p.revenue / maxRevenue) * 100}%`, background: p.staff.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <AddAppointmentModal open={modal} onClose={() => setModal(false)} date={today} />
    </Shell>
  );
}

function Kpi({
  Icon,
  label,
  value,
  hint,
  accent,
}: {
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: accent + "16" }}>
          <Icon className="h-[15px] w-[15px]" style={{ color: accent }} />
        </span>
      </div>
      <div className="mt-2 tnum font-display text-[24px] font-700 leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-1.5 truncate text-[12px] text-muted">{hint}</div>
    </Card>
  );
}

function QuickAction({
  Icon,
  label,
  href,
  onClick,
  primary,
}: {
  Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const cls = primary
    ? "flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2.5 text-[13.5px] font-semibold text-white shadow-card transition-colors hover:bg-brand-deep"
    : "flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand";
  const inner = (
    <>
      <Icon className="h-4 w-4" />
      {label}
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}

function Empty({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-muted">
        <IcCalendar className="h-5 w-5" />
      </span>
      <p className="text-[13.5px] text-muted">{label}</p>
      <button onClick={onClick} className="text-[13.5px] font-semibold text-brand hover:text-brand-deep">
        {cta} →
      </button>
    </div>
  );
}
