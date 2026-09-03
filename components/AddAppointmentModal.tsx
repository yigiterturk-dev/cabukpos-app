"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import { DAY_END_MIN, formatTRY, hasConflict, serviceById, staffById, timeSlots, timeToMin } from "@/lib/utils";
import { IcX, IcPlus } from "@/components/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  date: string;
  defaultStaffId?: string;
  defaultStart?: string;
}

export function AddAppointmentModal({ open, onClose, date, defaultStaffId, defaultStart }: Props) {
  const { state, addAppointment, addCustomer } = useStore();
  const terms = sectorTerms(state.sector);

  const [staffId, setStaffId] = useState(defaultStaffId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [start, setStart] = useState(defaultStart ?? "10:00");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");

  useEffect(() => {
    if (open) {
      setStaffId(defaultStaffId ?? state.staff[0]?.id ?? "");
      setServiceId(state.services[0]?.id ?? "");
      setCustomerId(state.customers[0]?.id ?? "");
      setStart(defaultStart ?? "10:00");
      setMode("existing");
      setNewName("");
      setNewPhone("");
    }
  }, [open, defaultStaffId, defaultStart, state.staff, state.services, state.customers]);

  const durationMin = useMemo(
    () => serviceById(state, serviceId)?.durationMin ?? 30,
    [state, serviceId]
  );
  const conflict = useMemo(
    () => (staffId && serviceId ? hasConflict(state, date, staffId, start, durationMin) : false),
    [state, date, staffId, serviceId, start, durationMin]
  );
  // Mesai dışı taşma: randevu bitişi personelin (yoksa günün) çalışma sonunu aşıyor mu?
  const overflowsHours = useMemo(() => {
    if (!staffId || !serviceId) return false;
    const endLimit = timeToMin(staffById(state, staffId)?.workEnd ?? "") || DAY_END_MIN;
    return timeToMin(start) + durationMin > endLimit;
  }, [state, staffId, serviceId, start, durationMin]);

  if (!open) return null;

  function submit() {
    if (conflict || overflowsHours) return;
    let cid = customerId;
    if (mode === "new") {
      if (!newName.trim()) return;
      const c = addCustomer({ name: newName.trim(), phone: newPhone.trim() || "—" });
      cid = c.id;
    }
    if (!staffId || !serviceId || !cid) return;
    addAppointment({ date, start, staffId, customerId: cid, serviceId, status: "bekliyor" });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] animate-fade-up overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="font-display text-[17px] font-700 text-ink">Yeni {terms.appointment}</h3>
            <p className="text-[12.5px] text-muted">{date}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
            <IcX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Müşteri */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-ink">{terms.customer}</label>
              <div className="flex rounded-lg bg-canvas p-0.5 text-[12px]">
                <button
                  onClick={() => setMode("existing")}
                  className={`rounded-md px-2.5 py-1 font-medium ${mode === "existing" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
                >
                  Kayıtlı
                </button>
                <button
                  onClick={() => setMode("new")}
                  className={`rounded-md px-2.5 py-1 font-medium ${mode === "new" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
                >
                  Yeni
                </button>
              </div>
            </div>
            {mode === "existing" ? (
              <Select value={customerId} onChange={setCustomerId}>
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Input value={newName} onChange={setNewName} placeholder="Ad Soyad" />
                <Input value={newPhone} onChange={setNewPhone} placeholder="Telefon" />
              </div>
            )}
          </div>

          {/* Hizmet */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">{terms.service}</label>
            <Select value={serviceId} onChange={setServiceId}>
              {state.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.price > 0 ? `· ${formatTRY(s.price)}` : ""} · {s.durationMin}dk
                </option>
              ))}
            </Select>
          </div>

          {/* Personel + Saat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">{terms.staff}</label>
              <Select value={staffId} onChange={setStaffId}>
                {state.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Saat</label>
              <Select value={start} onChange={setStart}>
                {timeSlots().map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {conflict && (
            <div className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5 text-[12.5px] font-medium text-rose">
              <span className="mt-px">⚠</span>
              <span>Bu {terms.staff.toLowerCase()} {start} saatinde başka bir {terms.appointment.toLowerCase()} ile dolu. Farklı bir saat veya {terms.staff.toLowerCase()} seçin.</span>
            </div>
          )}

          {!conflict && overflowsHours && (
            <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/5 px-3.5 py-2.5 text-[12.5px] font-medium text-amber">
              <span className="mt-px">⚠</span>
              <span>Bu {terms.service.toLowerCase()} {durationMin} dk sürüyor ve {start} saatinde başlarsa mesai bitişini aşar. Daha erken bir saat seçin.</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-canvas"
          >
            Vazgeç
          </button>
          <button
            onClick={submit}
            disabled={conflict || overflowsHours}
            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IcPlus className="h-4 w-4" />
            {terms.appointment} ekle
          </button>
        </div>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-line bg-surface px-3.5 py-2.5 pr-9 text-[14px] text-ink outline-none transition-colors focus:border-brand"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
    />
  );
}
