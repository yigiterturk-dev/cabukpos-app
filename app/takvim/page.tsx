"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { StatusChip, StaffAvatar } from "@/components/ui";
import { AddAppointmentModal } from "@/components/AddAppointmentModal";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import {
  addDaysISO,
  appointmentsForDate,
  aptPrice,
  aptServiceName,
  availableSlots,
  customerById,
  formatTRY,
  hasConflict,
  prettyDate,
  serviceById,
  staffById,
  todayISO,
  weekdayShort,
  shortDate,
  timeSlots,
  timeToMin,
  DAY_START_MIN,
  PX_PER_MIN,
  STATUS_META,
} from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { IcPlus, IcChevronL, IcChevronR } from "@/components/icons";

export default function TakvimPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState<"gun" | "hafta">("gun");
  const [modal, setModal] = useState<{ open: boolean; staffId?: string; start?: string }>({ open: false });
  const [selected, setSelected] = useState<Appointment | null>(null);

  const slots = timeSlots();
  const gridHeight = slots.length * 30 * PX_PER_MIN;

  return (
    <Shell>
      <div className="mx-auto max-w-[1300px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[22px] font-700 tracking-tight text-ink">Takvim</h1>
            <div className="flex items-center gap-1">
              <NavBtn onClick={() => setDate(addDaysISO(date, view === "gun" ? -1 : -7))}>
                <IcChevronL className="h-4 w-4" />
              </NavBtn>
              <button
                onClick={() => setDate(todayISO())}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Bugün
              </button>
              <NavBtn onClick={() => setDate(addDaysISO(date, view === "gun" ? 1 : 7))}>
                <IcChevronR className="h-4 w-4" />
              </NavBtn>
            </div>
            <span className="text-[14px] font-medium text-muted">{prettyDate(date)}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-canvas p-0.5">
              {(["gun", "hafta"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                    view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {v === "gun" ? "Gün" : "Hafta"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setModal({ open: true })}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[14px] font-semibold text-white shadow-card transition-colors hover:bg-brand-deep"
            >
              <IcPlus className="h-4 w-4" />
              {terms.appointment}
            </button>
          </div>
        </div>

        {view === "gun" ? (
          <DayView
            date={date}
            slots={slots}
            gridHeight={gridHeight}
            onSlot={(staffId, start) => setModal({ open: true, staffId, start })}
            onSelect={setSelected}
          />
        ) : (
          <WeekView date={date} onPick={(d) => { setDate(d); setView("gun"); }} />
        )}
      </div>

      <AddAppointmentModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        date={date}
        defaultStaffId={modal.staffId}
        defaultStart={modal.start}
      />

      {selected && <AppointmentSheet apt={selected} onClose={() => setSelected(null)} />}
    </Shell>
  );
}

function DayView({
  date,
  slots,
  gridHeight,
  onSlot,
  onSelect,
}: {
  date: string;
  slots: string[];
  gridHeight: number;
  onSlot: (staffId: string, start: string) => void;
  onSelect: (a: Appointment) => void;
}) {
  const { state } = useStore();
  // Reddedilen online talepleri (approval === "reddedildi") takvimde gösterme — iz store'da kalır.
  const apts = appointmentsForDate(state, date).filter((a) => a.approval !== "reddedildi");

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* Personel başlıkları */}
      <div
        className="grid border-b border-line bg-canvas/50"
        style={{ gridTemplateColumns: `64px repeat(${state.staff.length}, minmax(0,1fr))` }}
      >
        <div className="border-r border-line" />
        {state.staff.map((s) => {
          const count = apts.filter((a) => a.staffId === s.id && a.status !== "iptal").length;
          return (
            <div key={s.id} className="flex items-center gap-2.5 border-r border-line px-3 py-2.5 last:border-r-0">
              <StaffAvatar staff={s} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{s.name}</div>
                <div className="text-[11px] text-muted">{count} randevu</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Izgara */}
      <div className="relative overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `64px repeat(${state.staff.length}, minmax(140px,1fr))` }}
        >
          {/* Saat ekseni */}
          <div className="relative border-r border-line" style={{ height: gridHeight }}>
            {slots.map((t, i) => (
              <div
                key={t}
                className="absolute right-2 -translate-y-1.5 text-[11px] font-medium tnum text-muted"
                style={{ top: i * 30 * PX_PER_MIN }}
              >
                {t}
              </div>
            ))}
          </div>

          {/* Personel kolonları */}
          {state.staff.map((s) => {
            const colApts = apts.filter((a) => a.staffId === s.id);
            return (
              <div key={s.id} className="relative border-r border-line last:border-r-0" style={{ height: gridHeight }}>
                {/* slot çizgileri + tıklanabilir boşluklar */}
                {slots.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => onSlot(s.id, t)}
                    className="group absolute left-0 right-0 border-b border-line/70 transition-colors hover:bg-brand-soft/40"
                    style={{ top: i * 30 * PX_PER_MIN, height: 30 * PX_PER_MIN }}
                    aria-label={`${s.name} ${t} randevu ekle`}
                  >
                    <span className="pointer-events-none absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
                      +
                    </span>
                  </button>
                ))}

                {/* randevu kartları */}
                {colApts.map((a) => {
                  const svc = serviceById(state, a.serviceId);
                  const c = customerById(state, a.customerId);
                  const top = (timeToMin(a.start) - DAY_START_MIN) * PX_PER_MIN;
                  const h = Math.max(28 * PX_PER_MIN, (svc?.durationMin ?? 30) * PX_PER_MIN) - 4;
                  const m = STATUS_META[a.status];
                  // Onay bekleyen online talep: kesikli sarı çerçeve ile ayırt et.
                  const pending = a.approval === "bekliyor";
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      className={`absolute left-1.5 right-1.5 overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition-all hover:shadow-lift ${
                        a.status === "iptal" ? "opacity-55" : ""
                      } ${pending ? "border-dashed border-amber bg-amber/[0.06]" : "border-solid bg-surface"}`}
                      style={{
                        top: top + 2,
                        height: h,
                        ...(pending
                          ? {}
                          : {
                              borderColor: "var(--tw-shadow-color, #E6E9EF)",
                              borderLeft: `3px solid ${m.dot.includes("mint") ? "#10B981" : m.dot.includes("amber") ? "#F59E0B" : "#EF4444"}`,
                            }),
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="tnum text-[11px] font-semibold text-ink">{a.start}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
                      </div>
                      <div className={`truncate text-[12.5px] font-semibold text-ink ${a.status === "iptal" ? "line-through" : ""}`}>
                        {c?.name}
                      </div>
                      {pending ? (
                        <div className="truncate text-[10px] font-semibold uppercase text-amber">onay bekliyor</div>
                      ) : (
                        h > 50 && <div className="truncate text-[11px] text-muted">{aptServiceName(state, a)}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekView({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const { state } = useStore();
  // haftanın pazartesisi
  const base = useMemo(() => {
    const d = new Date(date + "T00:00:00");
    const day = (d.getDay() + 6) % 7; // pzt=0
    return addDaysISO(date, -day);
  }, [date]);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(base, i));
  const today = todayISO();

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((d) => {
        // Reddedilen online talepleri (approval === "reddedildi") haftalık görünümde de gösterme.
        const apts = appointmentsForDate(state, d).filter((a) => a.status !== "iptal" && a.approval !== "reddedildi");
        const isToday = d === today;
        const isSel = d === date;
        return (
          <button
            key={d}
            onClick={() => onPick(d)}
            className={`flex flex-col gap-2 rounded-2xl border bg-surface p-3 text-left shadow-card transition-all hover:shadow-lift ${
              isSel ? "border-brand ring-1 ring-brand" : "border-line"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium uppercase text-muted">{weekdayShort(d)}</div>
                <div className={`tnum font-display text-[18px] font-700 ${isToday ? "text-brand" : "text-ink"}`}>
                  {shortDate(d)}
                </div>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-deep">
                {apts.length}
              </span>
            </div>
            <div className="space-y-1">
              {apts.slice(0, 4).map((a) => {
                const c = customerById(state, a.customerId);
                const st = state.staff.find((s) => s.id === a.staffId);
                const pending = a.approval === "bekliyor";
                return (
                  <div key={a.id} className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${pending ? "border border-dashed border-amber bg-amber/[0.06]" : "bg-canvas"}`}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pending ? "#F59E0B" : st?.color }} />
                    <span className="tnum text-[10.5px] font-medium text-muted">{a.start}</span>
                    <span className="truncate text-[11px] text-ink">{c?.name}</span>
                    {pending && <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase text-amber">onay</span>}
                  </div>
                );
              })}
              {apts.length > 4 && <div className="px-1.5 text-[10.5px] text-muted">+{apts.length - 4} daha</div>}
              {apts.length === 0 && <div className="px-1.5 py-1 text-[11px] text-muted/70">Boş</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AppointmentSheet({ apt, onClose }: { apt: Appointment; onClose: () => void }) {
  const { state, updateAppointmentStatus, updateAppointment, deleteAppointment, setApproval } = useStore();
  const terms = sectorTerms(state.sector);
  const svc = serviceById(state, apt.serviceId);
  const c = customerById(state, apt.customerId);

  const [editing, setEditing] = useState(false);
  const [staffId, setStaffId] = useState(apt.staffId);
  const [start, setStart] = useState(apt.start);

  const st = staffById(state, staffId);
  const durationMin = svc?.durationMin ?? 30;

  // Düzenleme slotları: seçili personelin müsait saatleri + mevcut saatin kendisi (çakışma sayılmasın).
  const slotOptions = useMemo(() => {
    const free = availableSlots(state, apt.date, staffId, durationMin);
    return Array.from(new Set([apt.start, ...free])).sort();
  }, [state, apt.date, apt.start, staffId, durationMin]);

  // Düzenlemede çakışma: kendi randevusunu yok say (ignoreId).
  const conflict = useMemo(
    () => hasConflict(state, apt.date, staffId, start, durationMin, apt.id),
    [state, apt.date, apt.id, staffId, start, durationMin]
  );

  function setStatus(s: AppointmentStatus) {
    updateAppointmentStatus(apt.id, s);
    onClose();
  }

  function saveEdit() {
    if (conflict) return;
    // Snapshot alanlarına dokunma — sadece saat/personel değişir.
    const stf = staffById(state, staffId);
    updateAppointment(apt.id, { start, staffId, staffNameSnapshot: stf?.name ?? apt.staffNameSnapshot });
    onClose();
  }

  function remove() {
    if (confirm(`Bu ${terms.appointment.toLowerCase()} silinsin mi? Bu işlem geri alınamaz.`)) {
      deleteAppointment(apt.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-[420px] animate-fade-up rounded-t-3xl bg-surface p-5 shadow-pop sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          {st && <StaffAvatar staff={st} size={44} />}
          <div className="flex-1">
            <div className="text-[17px] font-semibold text-ink">{c?.name}</div>
            <div className="text-[13px] text-muted">{c?.phone}</div>
          </div>
          <StatusChip status={apt.status} />
        </div>

        {!editing ? (
          <>
            {/* Onay bekleyen online talep: işletme buradan da onaylayıp reddedebilir */}
            {apt.approval === "bekliyor" && (
              <div className="mt-4 rounded-xl border border-dashed border-amber bg-amber/[0.06] p-3">
                <div className="text-[12.5px] font-medium text-ink">Bu online bir taleptir, işletme onayı bekliyor.</div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => { setApproval(apt.id, "onaylandi"); onClose(); }}
                    className="flex-1 rounded-lg bg-mint/10 py-2 text-[13px] font-semibold text-mint transition-colors hover:bg-mint/20"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => { setApproval(apt.id, "reddedildi"); onClose(); }}
                    className="flex-1 rounded-lg bg-rose/10 py-2 text-[13px] font-semibold text-rose transition-colors hover:bg-rose/20"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-[13px]">
              <Field label={terms.service} value={aptServiceName(state, apt)} />
              <Field label="Saat" value={`${apt.start} · ${durationMin}dk`} />
              <Field label={terms.staff} value={st?.name ?? apt.staffNameSnapshot ?? ""} />
              <Field label="Tutar" value={aptPrice(state, apt) > 0 ? formatTRY(aptPrice(state, apt)) : "—"} />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setStatus("geldi")}
                className="flex-1 rounded-xl bg-mint/10 py-2.5 text-[13.5px] font-semibold text-mint transition-colors hover:bg-mint/20"
              >
                Geldi
              </button>
              <button
                onClick={() => setStatus("bekliyor")}
                className="flex-1 rounded-xl bg-amber/10 py-2.5 text-[13.5px] font-semibold text-amber transition-colors hover:bg-amber/20"
              >
                Bekliyor
              </button>
              <button
                onClick={() => setStatus("iptal")}
                className="flex-1 rounded-xl bg-rose/10 py-2.5 text-[13.5px] font-semibold text-rose transition-colors hover:bg-rose/20"
              >
                İptal
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => { setStaffId(apt.staffId); setStart(apt.start); setEditing(true); }}
                className="flex-1 rounded-xl border border-line py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-canvas"
              >
                Düzenle
              </button>
              <button
                onClick={remove}
                className="flex-1 rounded-xl border border-rose/30 py-2.5 text-[13.5px] font-semibold text-rose transition-colors hover:bg-rose/5"
              >
                Sil
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">{terms.staff}</label>
                <SheetSelect value={staffId} onChange={setStaffId}>
                  {state.staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </SheetSelect>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Saat</label>
                <SheetSelect value={start} onChange={setStart}>
                  {slotOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </SheetSelect>
              </div>
              {conflict && (
                <div className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5 text-[12.5px] font-medium text-rose">
                  <span className="mt-px">⚠</span>
                  <span>Bu {terms.staff.toLowerCase()} {start} saatinde başka bir {terms.appointment.toLowerCase()} ile dolu. Farklı bir saat veya {terms.staff.toLowerCase()} seçin.</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl border border-line py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-canvas"
              >
                Vazgeç
              </button>
              <button
                onClick={saveEdit}
                disabled={conflict}
                className="flex-[1.4] rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                Kaydet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SheetSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-line bg-surface px-3.5 py-2.5 pr-9 text-[14px] text-ink outline-none transition-colors focus:border-brand"
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-medium text-ink">{value}</div>
    </div>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-canvas"
    >
      {children}
    </button>
  );
}
