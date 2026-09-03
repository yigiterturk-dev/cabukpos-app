"use client";

// Public rezervasyon akışı (client) — server'dan gelen DAR veriyle çalışır (useStore YOK).
// Slot hesabı server'dan gelen `busy` aralıklarından yerelde yapılır. Randevu yazımı
// createPublicBooking(slug, ...) public server action'ı üzerinden (session DEĞİL, slug bağlı).

import { useMemo, useRef, useState } from "react";

import { createPublicBooking } from "@/lib/public-booking-actions";
import type {
  PublicBookingBusy,
  PublicBookingData,
  PublicBookingService,
  PublicBookingStaff,
} from "@/lib/data/public-booking";
import { sectorTerms, SECTORS } from "@/lib/sectors";
import {
  addDaysISO,
  formatTRY,
  isValidTRPhone,
  minToTime,
  prettyDate,
  shortDate,
  timeToMin,
  todayISO,
  weekdayShort,
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
} from "@/lib/utils";
import type { SectorId } from "@/lib/types";
import { IcCheck, IcChevronL, IcClock, IcScissors, IcStaff, IcCalendar } from "@/components/icons";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// Public slot hesabı: server'dan gelen busy aralıkları + personel mesai + geçmiş saat.
function publicAvailableSlots(
  busy: PublicBookingBusy[],
  staff: PublicBookingStaff,
  date: string,
  durationMin: number
): string[] {
  const intervals = busy
    .filter((b) => b.staffId === staff.id && b.date === date)
    .map((b) => {
      const s = timeToMin(b.start);
      return { start: s, end: s + (b.durationMin || SLOT_MIN) };
    });
  const startMin = staff.workStart ? timeToMin(staff.workStart) : DAY_START_MIN;
  const endMin = staff.workEnd ? timeToMin(staff.workEnd) : DAY_END_MIN;
  const today = todayISO();
  const nowMin = date === today ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
  const out: string[] = [];
  for (let t = startMin; t + durationMin <= endMin; t += SLOT_MIN) {
    if (t < nowMin) continue;
    const slotEnd = t + durationMin;
    const blocked = intervals.some((iv) => overlaps(t, slotEnd, iv.start, iv.end));
    if (!blocked) out.push(minToTime(t));
  }
  return out;
}

function staffForService(staff: PublicBookingStaff[], serviceId: string): PublicBookingStaff[] {
  return staff.filter((s) => !s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(serviceId));
}

export default function BookingClient({ data }: { data: PublicBookingData }) {
  const terms = sectorTerms(data.sector as SectorId | null);
  const sectorLabel = data.sector ? SECTORS[data.sector as SectorId].label : "";

  const [step, setStep] = useState(0); // 0 hizmet, 1 personel, 2 saat, 3 bilgi, 4 onay
  const [service, setService] = useState<PublicBookingService | null>(null);
  const [staff, setStaff] = useState<PublicBookingStaff | null>(null);
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Anti-spam (asıl koruma SUNUCUDA): honeypot + formOpenedAt sunucuya da iletilir.
  const [honeypot, setHoneypot] = useState("");
  const formOpenedAt = useRef<number>(Date.now());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(todayISO(), i)), []);
  const slots = useMemo(
    () => (service && staff ? publicAvailableSlots(data.busy, staff, date, service.durationMin) : []),
    [data.busy, date, staff, service]
  );

  async function confirmBooking() {
    if (submitting) return;
    if (!service || !staff || !slot) return;
    if (!isValidTRPhone(phone)) {
      setError("Geçerli bir telefon numarası girin (örn. 0532 123 45 67).");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await createPublicBooking(data.slug, {
      serviceId: service.id,
      staffId: staff.id,
      date,
      start: slot,
      name: name.trim().slice(0, 80),
      phone: phone.trim().slice(0, 30),
      honeypot,
      formMs: Date.now() - formOpenedAt.current,
    });
    if (res.ok) {
      setStep(4);
    } else {
      setSubmitting(false);
      setError(res.error);
      // Slot doldu hatasında kullanıcıyı saat ekranına geri al.
      if (res.error.includes("doldu")) {
        setSlot(null);
        setStep(2);
      }
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-5 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-[18px] font-bold text-white">
            {data.businessName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-[18px] font-700 text-ink">{data.businessName}</h1>
            <p className="text-[12.5px] text-muted">{sectorLabel} · Online {terms.appointment.toLowerCase()}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[640px] px-5 py-6">
        {step < 4 && <Stepper step={step} />}

        {/* Adım 0: hizmet */}
        {step === 0 && (
          <Section icon={<IcScissors className="h-4 w-4" />} title={`${terms.service} seçin`}>
            {data.services.length === 0 ? (
              <p className="rounded-xl bg-surface py-6 text-center text-[13px] text-muted">Henüz hizmet eklenmemiş.</p>
            ) : (
              <div className="space-y-2">
                {data.services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setService(s); setStaff(null); setSlot(null); setStep(1); }}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-all hover:border-brand hover:shadow-card"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-ink">{s.name}</div>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-muted"><IcClock className="h-3.5 w-3.5" />{s.durationMin} dk</div>
                    </div>
                    {s.price > 0 && <div className="tnum text-[15px] font-semibold text-ink">{formatTRY(s.price)}</div>}
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Adım 1: personel */}
        {step === 1 && service && (
          <Section icon={<IcStaff className="h-4 w-4" />} title={`${terms.staff} seçin`} onBack={() => setStep(0)}>
            <div className="grid grid-cols-2 gap-2">
              {staffForService(data.staff, service.id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setStaff(s); setSlot(null); setStep(2); }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-4 transition-all hover:border-brand hover:shadow-card"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full text-[16px] font-semibold text-white" style={{ background: s.color }}>{s.initials}</span>
                  <div className="text-center">
                    <div className="text-[13.5px] font-semibold text-ink">{s.name}</div>
                    <div className="text-[11.5px] text-muted">{s.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Adım 2: tarih + saat */}
        {step === 2 && service && staff && (
          <Section icon={<IcCalendar className="h-4 w-4" />} title="Gün ve saat seçin" onBack={() => setStep(1)}>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => {
                const sel = d === date;
                return (
                  <button key={d} onClick={() => { setDate(d); setSlot(null); }} className={`flex min-w-[60px] flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 transition-colors ${sel ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
                    <span className="text-[11px] font-medium text-muted">{weekdayShort(d)}</span>
                    <span className={`tnum font-display text-[16px] font-700 ${sel ? "text-brand-deep" : "text-ink"}`}>{shortDate(d)}</span>
                  </button>
                );
              })}
            </div>
            {slots.length === 0 ? (
              <p className="rounded-xl bg-surface py-6 text-center text-[13px] text-muted">Bu gün için müsait saat yok. Başka bir gün seçin.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {slots.map((t) => (
                  <button key={t} onClick={() => { setSlot(t); setError(null); formOpenedAt.current = Date.now(); setStep(3); }} className="tnum rounded-lg border border-line bg-surface py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft">
                    {t}
                  </button>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Adım 3: bilgi */}
        {step === 3 && service && staff && slot && (
          <Section icon={<IcCheck className="h-4 w-4" />} title="Bilgileriniz" onBack={() => setStep(2)}>
            <div className="mb-4 rounded-xl border border-line bg-surface p-4">
              <Row label={terms.service} value={service.name} />
              <Row label={terms.staff} value={staff.name} />
              <Row label="Tarih" value={prettyDate(date)} />
              <Row label="Saat" value={slot} />
              {service.price > 0 && <Row label="Tutar" value={formatTRY(service.price)} strong />}
            </div>
            <div className="space-y-3">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] outline-none focus:border-brand" />
              <input value={phone} onChange={(e) => { setPhone(e.target.value); if (error) setError(null); }} inputMode="tel" placeholder="Telefon (örn. 0532 123 45 67)" className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[14px] outline-none focus:border-brand" />
              {/* Honeypot: gerçek kullanıcılar görmez; bot doldurursa SUNUCU sessizce reddeder. */}
              <input
                type="text"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />
            </div>
            {error && (
              <p className="mt-3 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5 text-[12.5px] font-medium text-rose">{error}</p>
            )}
            <button onClick={confirmBooking} disabled={!name.trim() || submitting} className="mt-4 w-full rounded-xl bg-brand py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40">
              {submitting ? "Gönderiliyor…" : `${terms.appointment} talebi gönder`}
            </button>
            <p className="mt-2 text-center text-[11.5px] text-muted">Talebiniz işletme onayından sonra kesinleşir.</p>
          </Section>
        )}

        {/* Adım 4: onay */}
        {step === 4 && service && staff && slot && (
          <div className="mt-8 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber/15 text-amber"><IcClock className="h-8 w-8" /></span>
            <h2 className="mt-4 font-display text-[22px] font-700 text-ink">Talebiniz alındı!</h2>
            <p className="mt-1.5 text-[14px] text-muted">{prettyDate(date)} · {slot} · {staff.name}</p>
            <div className="mt-5 w-full max-w-[360px] rounded-2xl border border-line bg-surface p-4 text-left">
              <Row label={terms.service} value={service.name} />
              <Row label="Durum" value="İşletme onayı bekleniyor" />
              {service.price > 0 && <Row label="Tutar" value={formatTRY(service.price)} strong />}
            </div>
            <p className="mt-4 max-w-[340px] text-[12.5px] text-muted">{terms.appointment} talebiniz işletmeye iletildi. Onaylandığında hatırlatma mesajı gönderilecek. Bu bir kesin {terms.appointment.toLowerCase()} değildir; işletme onayı bekleniyor.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11.5px] text-muted">Yanında POS ile güçlendirilmiştir</p>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Hizmet", "Personel", "Saat", "Bilgi"];
  return (
    <div className="mb-6 flex items-center gap-1.5">
      {labels.map((l, i) => (
        <div key={i} className="flex flex-1 items-center gap-1.5">
          <div className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand" : "bg-line"}`} />
        </div>
      ))}
    </div>
  );
}

function Section({ icon, title, onBack, children }: { icon: React.ReactNode; title: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex items-center gap-2.5">
        {onBack && (
          <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:text-ink"><IcChevronL className="h-4 w-4" /></button>
        )}
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">{icon}</span>
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13.5px]">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}
