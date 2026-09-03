"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, slugify } from "@/lib/store";
import { bookingUrlLabel, bookingUrlPrefix } from "@/lib/public-url";
import { enableDemoMode } from "@/lib/auth/mode";
import { SECTOR_LIST, SECTORS } from "@/lib/sectors";
import type { SectorId, Service, Staff } from "@/lib/types";
import { IcCalendar, IcSpark, IcWallet, IcCheck, IcPlus, IcTrash } from "@/components/icons";

const SECTOR_ART: Record<SectorId, { emoji: string; accent: string }> = {
  berber: { emoji: "✂️", accent: "#2F5BEA" },
  guzellik: { emoji: "💆", accent: "#EC4899" },
  otoyikama: { emoji: "🚿", accent: "#10B981" },
  veteriner: { emoji: "🐾", accent: "#0EA5E9" },
  diyetisyen: { emoji: "🥗", accent: "#10B981" },
  psikolog: { emoji: "🧠", accent: "#8B5CF6" },
  doktor: { emoji: "🩺", accent: "#2F5BEA" },
  dishekimi: { emoji: "🦷", accent: "#06B6D4" },
};

const STAFF_COLORS = ["#2F5BEA", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

// Sektöre göre tek-tık eklenebilen örnek hizmet şablonları: [ad, süre dk, fiyat ₺, prim %]
const SERVICE_TEMPLATES: Record<SectorId, [string, number, number, number][]> = {
  berber: [
    ["Saç Kesimi", 30, 250, 35],
    ["Saç + Sakal", 45, 350, 35],
    ["Sakal Düzenleme", 20, 150, 30],
  ],
  guzellik: [
    ["Cilt Bakımı", 60, 750, 35],
    ["Manikür & Pedikür", 50, 450, 40],
    ["Kaş Tasarımı", 25, 300, 45],
  ],
  otoyikama: [
    ["Dış Yıkama", 20, 200, 25],
    ["İç-Dış Komple", 40, 350, 25],
    ["Pasta & Cila", 90, 900, 30],
  ],
  veteriner: [
    ["Genel Muayene", 20, 400, 10],
    ["Karma Aşı", 15, 500, 10],
    ["Kuduz Aşısı", 10, 350, 10],
  ],
  diyetisyen: [
    ["İlk Görüşme + Ölçüm", 60, 1200, 40],
    ["Kontrol Seansı", 30, 500, 35],
    ["Online Danışmanlık", 40, 700, 35],
  ],
  psikolog: [
    ["İlk Değerlendirme", 60, 1500, 50],
    ["Bireysel Terapi", 50, 1200, 50],
    ["Online Seans", 50, 1000, 45],
  ],
  doktor: [
    ["Muayene", 20, 900, 30],
    ["Kontrol", 15, 500, 30],
    ["Online Konsültasyon", 20, 600, 30],
  ],
  dishekimi: [
    ["Muayene", 20, 400, 30],
    ["Diş Temizliği", 30, 800, 35],
    ["Dolgu", 45, 1200, 40],
  ],
};

function initials(name: string) {
  return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

type DraftService = { id: string; name: string; durationMin: number; price: number; commissionPct: number };
type DraftStaff = { id: string; name: string; role: string; workStart: string; workEnd: string };

const TOTAL_DOTS = 6; // adım göstergesi (sektör → bilgi → tercih → hizmet → personel → saat)

export default function Onboarding() {
  const { ready, hasSetup, chooseSector, mode } = useStore();
  const router = useRouter();

  // Oturum yoksa (mode !== "db") demo akışıdır → /dashboard'a geçmeden önce demo çerezini set et
  // (middleware gate'i demo çerezini ister; aksi halde /giris'e atar). DB modunda gerek yok.
  async function ensureDemoCookie() {
    if (mode !== "db") {
      await enableDemoMode();
    }
  }

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<SectorId | null>(null);

  // Adım 2 — işletme bilgisi
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Boş başlatma taslakları
  const [services, setServices] = useState<DraftService[]>([]);
  const [staff, setStaff] = useState<DraftStaff[]>([]);

  // Genel açılış-kapanış (adım 6)
  const [openStart, setOpenStart] = useState("09:00");
  const [openEnd, setOpenEnd] = useState("19:00");

  useEffect(() => {
    if (ready && hasSetup) router.replace("/dashboard");
  }, [ready, hasSetup, router]);

  const terms = useMemo(() => (selected ? SECTORS[selected].terms : SECTORS.berber.terms), [selected]);

  // İsimden slug otomatik türet (kullanıcı elle değiştirmediyse)
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  function goSector(id: SectorId) {
    setSelected(id);
  }

  async function startDemo() {
    if (!selected) return;
    await ensureDemoCookie();
    // DB modunda chooseSector kurulum yazımının Promise'ını döner → await ile DB hazır olunca geç.
    await chooseSector(selected, { businessName: name, phone, bookingSlug: slug });
    router.push("/dashboard");
  }

  async function finishEmpty() {
    if (!selected) return;
    await ensureDemoCookie();
    const svc: Service[] = services.map((s, i) => ({
      id: "svc-" + (i + 1),
      name: s.name.trim(),
      durationMin: s.durationMin || 30,
      price: s.price || 0,
      commissionRate: Math.min(1, Math.max(0, (s.commissionPct || 0) / 100)),
      active: true,
    }));
    const stf: Staff[] = staff.map((s, i) => ({
      id: "stf-" + (i + 1),
      name: s.name.trim(),
      role: s.role.trim() || terms.staff,
      color: STAFF_COLORS[i % STAFF_COLORS.length],
      initials: initials(s.name),
      workStart: s.workStart || openStart,
      workEnd: s.workEnd || openEnd,
      serviceIds: [],
      active: true,
    }));
    await chooseSector(selected, {
      empty: true,
      businessName: name,
      phone,
      bookingSlug: slug,
      services: svc,
      staff: stf,
    });
    router.push("/dashboard");
  }

  // --- Adım taslak yardımcıları ---
  function addTemplateService(t: [string, number, number, number]) {
    if (services.some((s) => s.name.toLowerCase() === t[0].toLowerCase())) return;
    setServices((cur) => [
      ...cur,
      { id: "d-" + Date.now() + Math.random(), name: t[0], durationMin: t[1], price: t[2], commissionPct: t[3] },
    ]);
  }
  function addBlankService() {
    setServices((cur) => [
      ...cur,
      { id: "d-" + Date.now() + Math.random(), name: "", durationMin: 30, price: 0, commissionPct: 30 },
    ]);
  }
  function addBlankStaff() {
    setStaff((cur) => [
      ...cur,
      { id: "d-" + Date.now() + Math.random(), name: "", role: terms.staff, workStart: openStart, workEnd: openEnd },
    ]);
  }

  const namedServices = services.filter((s) => s.name.trim());
  const namedStaff = staff.filter((s) => s.name.trim());
  const canProceedInfo = name.trim().length > 0;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(520px,640px)]">
      {/* Sol — marka & değer */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff22 1px, transparent 1px), linear-gradient(90deg, #ffffff22 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(120% 90% at 30% 10%, #000, transparent 75%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand text-white">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <path d="M5 5h9a4.5 4.5 0 0 1 0 9H5z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M5 14l8 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-[22px] font-700 tracking-tight">Yanında POS</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-[40px] font-700 leading-[1.1] tracking-tight">
            İşletmenizin
            <br />
            tüm günü <span className="text-brand-soft">tek panelde.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Randevudan prime, müşteri geçmişinden günlük ciroya kadar her şey burada. Komisyon yok, aylık sabit
            abonelik. Sektörünüze göre kurulur.
          </p>

          <div className="mt-9 space-y-3.5">
            {[
              { Icon: IcCalendar, t: "Personele göre kolonlu randevu takvimi" },
              { Icon: IcWallet, t: "Otomatik prim ve ciro hesabı" },
              { Icon: IcSpark, t: "Kendi hizmet ve ekibinizle ya da hazır demoyla başlayın" },
            ].map(({ Icon, t }, i) => (
              <div key={i} className="flex items-center gap-3 text-[14px] text-white/85">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-[17px] w-[17px] text-brand-soft" />
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[12.5px] text-white/45">
          Berber · Güzellik · Veteriner · Klinik · Diş — tek çekirdek, çok sektör.
        </div>
      </div>

      {/* Sağ — wizard */}
      <div className="flex flex-col justify-center bg-canvas px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md animate-fade-up">
          {/* Adım göstergesi */}
          <div className="mb-4 flex items-center gap-1.5">
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-brand" : i < step ? "w-3 bg-brand/40" : "w-3 bg-line"
                }`}
              />
            ))}
          </div>

          {/* ADIM 0 — Sektör */}
          {step === 0 && (
            <>
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                Kurulum · 1. adım
              </div>
              <h2 className="font-display text-[26px] font-700 tracking-tight text-ink">Sektörünüzü seçin</h2>
              <p className="mt-1.5 text-[14px] text-muted">
                Terminoloji ve örnek veri seçiminize göre hazırlanır. İstediğiniz zaman değiştirebilirsiniz.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {SECTOR_LIST.map((s) => {
                  const art = SECTOR_ART[s.id];
                  const active = selected === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => goSector(s.id)}
                      className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? "border-brand bg-surface shadow-lift ring-1 ring-brand"
                          : "border-line bg-surface hover:border-brand/40 hover:shadow-card"
                      }`}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-[20px]"
                        style={{ background: art.accent + "18" }}
                      >
                        {art.emoji}
                      </span>
                      <span className="text-[14.5px] font-semibold leading-tight text-ink">{s.label}</span>
                      {active && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                          <IcCheck className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <PrimaryBtn disabled={!selected} onClick={() => setStep(1)}>
                Devam et
              </PrimaryBtn>
            </>
          )}

          {/* ADIM 1 — İşletme bilgisi */}
          {step === 1 && (
            <>
              <StepHead n="2. adım" title="İşletme bilgileri" sub="Panelde ve rezervasyon linkinde görünecek bilgiler." />

              <div className="mt-6 space-y-4">
                <Field label="İşletme adı" required>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn. Maestro Kuaför"
                    className={inputCls}
                  />
                </Field>

                <Field label="Telefon" optional>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0532 123 45 67"
                    inputMode="tel"
                    className={inputCls}
                  />
                </Field>

                <Field label="Rezervasyon linki" optional>
                  <div className="flex items-center rounded-xl border border-line bg-surface px-3.5 py-2.5 focus-within:border-brand">
                    <span className="select-none text-[13.5px] text-muted">{bookingUrlPrefix()}</span>
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(slugify(e.target.value));
                      }}
                      placeholder="isletme"
                      className="ml-0.5 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/60"
                    />
                  </div>
                </Field>
              </div>

              <NavRow
                onBack={() => setStep(0)}
                next={
                  <PrimaryBtn disabled={!canProceedInfo} onClick={() => setStep(2)} inline>
                    Devam et
                  </PrimaryBtn>
                }
              />
            </>
          )}

          {/* ADIM 2 — Başlangıç tercihi */}
          {step === 2 && (
            <>
              <StepHead n="3. adım" title="Nasıl başlamak istersiniz?" sub="Hızlı keşif için demo, gerçek kullanım için sıfırdan kurulum." />

              <div className="mt-6 space-y-3">
                <button
                  onClick={startDemo}
                  className="group relative flex w-full items-start gap-3.5 rounded-2xl border border-brand bg-surface p-4 text-left shadow-card ring-1 ring-brand/30 transition-all hover:shadow-lift"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
                    <IcSpark className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">Demo veriyle başla</span>
                      <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-white">önerilen</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      Örnek randevu ve müşterilerle paneli hemen keşfedin. İstediğinizde sıfırlayabilirsiniz.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setStep(3)}
                  className="group flex w-full items-start gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:border-brand/40 hover:shadow-card"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink">
                    <IcPlus className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[15px] font-semibold text-ink">Sıfırdan kur (boş başla)</span>
                    <p className="mt-0.5 text-[13px] text-muted">
                      Kendi hizmet, ekip ve çalışma saatlerinizi girin. Demo veri yüklenmez.
                    </p>
                  </div>
                  <span className="mt-1 text-muted transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>

              <NavRow onBack={() => setStep(1)} />
            </>
          )}

          {/* ADIM 3 — Hizmetler (boş başlatma) */}
          {step === 3 && (
            <>
              <StepHead n="4. adım" title={`${terms.service} ekleyin`} sub={`En az 1 ${terms.service.toLowerCase()} ekleyin. Şablonlardan hızlıca seçebilirsiniz.`} />

              {/* Şablonlar */}
              <div className="mt-5 flex flex-wrap gap-2">
                {(SERVICE_TEMPLATES[selected ?? "berber"] ?? []).map((t) => {
                  const added = services.some((s) => s.name.toLowerCase() === t[0].toLowerCase());
                  return (
                    <button
                      key={t[0]}
                      onClick={() => addTemplateService(t)}
                      disabled={added}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        added
                          ? "border-mint/40 bg-mint/10 text-mint"
                          : "border-line bg-surface text-ink hover:border-brand/40 hover:text-brand"
                      }`}
                    >
                      {added ? <IcCheck className="h-3.5 w-3.5" /> : <IcPlus className="h-3.5 w-3.5" />}
                      {t[0]}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-2.5">
                {services.map((s, idx) => (
                  <div key={s.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={s.name}
                        onChange={(e) => setServices((cur) => cur.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                        placeholder={`${terms.service} adı`}
                        className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13.5px] text-ink outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => setServices((cur) => cur.filter((x) => x.id !== s.id))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose/10 hover:text-rose"
                        aria-label="Sil"
                      >
                        <IcTrash className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <NumField label="Süre (dk)" value={s.durationMin} onChange={(v) => setServices((cur) => cur.map((x) => (x.id === s.id ? { ...x, durationMin: v } : x)))} />
                      <NumField label="Fiyat (₺)" value={s.price} onChange={(v) => setServices((cur) => cur.map((x) => (x.id === s.id ? { ...x, price: v } : x)))} />
                      <NumField label="Prim (%)" value={s.commissionPct} onChange={(v) => setServices((cur) => cur.map((x) => (x.id === s.id ? { ...x, commissionPct: v } : x)))} />
                    </div>
                    {!s.name.trim() && idx === services.length - 1 && (
                      <p className="mt-1.5 text-[11.5px] text-amber">Ad girilmeyen hizmet kaydedilmez.</p>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addBlankService}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
              >
                <IcPlus className="h-4 w-4" /> Boş {terms.service.toLowerCase()} ekle
              </button>

              <NavRow
                onBack={() => setStep(2)}
                next={
                  <PrimaryBtn disabled={namedServices.length === 0} onClick={() => setStep(4)} inline>
                    Devam et
                  </PrimaryBtn>
                }
              />
            </>
          )}

          {/* ADIM 4 — Personel (boş başlatma) */}
          {step === 4 && (
            <>
              <StepHead n="5. adım" title={`${terms.staff} ekleyin`} sub={`En az 1 ${terms.staff.toLowerCase()} ekleyin. Takvimde her biri için kolon açılır.`} />

              <div className="mt-5 space-y-2.5">
                {staff.map((s) => (
                  <div key={s.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={s.name}
                        onChange={(e) => setStaff((cur) => cur.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                        placeholder="Ad Soyad"
                        className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13.5px] text-ink outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => setStaff((cur) => cur.filter((x) => x.id !== s.id))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rose/10 hover:text-rose"
                        aria-label="Sil"
                      >
                        <IcTrash className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted">Rol</label>
                        <input
                          value={s.role}
                          onChange={(e) => setStaff((cur) => cur.map((x) => (x.id === s.id ? { ...x, role: e.target.value } : x)))}
                          placeholder={terms.staff}
                          className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted">Başlangıç</label>
                        <input
                          type="time"
                          value={s.workStart}
                          onChange={(e) => setStaff((cur) => cur.map((x) => (x.id === s.id ? { ...x, workStart: e.target.value } : x)))}
                          className="w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted">Bitiş</label>
                        <input
                          type="time"
                          value={s.workEnd}
                          onChange={(e) => setStaff((cur) => cur.map((x) => (x.id === s.id ? { ...x, workEnd: e.target.value } : x)))}
                          className="w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addBlankStaff}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
              >
                <IcPlus className="h-4 w-4" /> {terms.staff} ekle
              </button>

              <NavRow
                onBack={() => setStep(3)}
                next={
                  <PrimaryBtn disabled={namedStaff.length === 0} onClick={() => setStep(5)} inline>
                    Devam et
                  </PrimaryBtn>
                }
              />
            </>
          )}

          {/* ADIM 5 — Çalışma saatleri & özet (boş başlatma) */}
          {step === 5 && (
            <>
              <StepHead n="6. adım" title="Çalışma saatleri ve özet" sub="İşletmenizin genel açılış-kapanışını belirleyin." />

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Field label="Açılış">
                  <input type="time" value={openStart} onChange={(e) => setOpenStart(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Kapanış">
                  <input type="time" value={openEnd} onChange={(e) => setOpenEnd(e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="mt-5 space-y-2.5 rounded-2xl border border-line bg-surface p-4">
                <SummaryRow label="İşletme" value={name || "—"} />
                <SummaryRow label="Sektör" value={selected ? SECTORS[selected].label : "—"} />
                <SummaryRow label="Rezervasyon linki" value={bookingUrlLabel(slug || slugify(name) || "isletme")} />
                <SummaryRow label={terms.service} value={`${namedServices.length} adet`} />
                <SummaryRow label={terms.staff} value={`${namedStaff.length} kişi`} />
                <SummaryRow label="Çalışma saati" value={`${openStart} – ${openEnd}`} />
              </div>

              <p className="mt-3 text-[12px] text-muted">
                Boş başlıyorsunuz: demo randevu/müşteri eklenmez. Panel hemen kullanıma hazır olur.
              </p>

              <NavRow
                onBack={() => setStep(4)}
                next={
                  <PrimaryBtn onClick={finishEmpty} inline>
                    Kurulumu tamamla
                  </PrimaryBtn>
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- küçük UI parçaları ---------- */

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand";

function StepHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <>
      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
        Kurulum · {n}
      </div>
      <h2 className="font-display text-[26px] font-700 tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-[14px] text-muted">{sub}</p>
    </>
  );
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-rose">*</span>}
        {optional && <span className="ml-1 font-normal text-muted">(opsiyonel)</span>}
      </label>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-muted">{label}</label>
      <input
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13.5px]">
      <span className="text-muted">{label}</span>
      <span className="truncate font-medium text-ink">{value}</span>
    </div>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  inline,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[15px] font-semibold text-white shadow-card transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40 ${
        inline ? "" : "mt-6 w-full"
      }`}
    >
      {children}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function NavRow({ onBack, next }: { onBack: () => void; next?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        onClick={onBack}
        className="rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-canvas"
      >
        Geri
      </button>
      {next ?? <span />}
    </div>
  );
}
