"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle, StatusChip, StaffAvatar } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import {
  aptPrice,
  aptServiceName,
  customerHistory,
  dueStatus,
  formatTRY,
  prettyDate,
  relativeTime,
  shortDate,
  staffById,
  waLink,
} from "@/lib/utils";
import type {
  Customer,
  MeasurementRecord,
  TreatmentRecord,
  TreatmentStatus,
  VaccineRecord,
} from "@/lib/types";
import { IcPhone, IcPlus, IcX, IcSend } from "@/components/icons";
import {
  customerBalance,
  customerLedger,
  debtReminderText,
  methodLabel,
  openDebts,
} from "@/lib/finance";
import type { PaymentMethod } from "@/lib/types";

const METHODS: PaymentMethod[] = ["nakit", "kart", "havale"];

export default function MusterilerPage() {
  const { state, addCustomer } = useStore();
  const searchParams = useSearchParams();
  const terms = sectorTerms(state.sector);
  const [q, setQ] = useState("");
  // "Sadece borçlular" — kasa ekranındaki borçlu listesinin müşteri ekranındaki karşılığı.
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(state.customers[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nBirthday, setNBirthday] = useState("");
  // Sektöre özel ekleme alanları
  const [nPetName, setNPetName] = useState("");
  const [nPetSpecies, setNPetSpecies] = useState("");
  const [nWeight, setNWeight] = useState("");
  const [nHeight, setNHeight] = useState("");

  // Bakiye tek yerden hesaplanır (liste rozeti + filtre aynı sayıyı kullansın).
  const balanceOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of state.customers) map.set(c.id, customerBalance(state, c.id));
    return map;
  }, [state]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = t
      ? state.customers.filter((c) => c.name.toLowerCase().includes(t) || c.phone.includes(t))
      : state.customers;
    if (onlyDebtors) list = list.filter((c) => (balanceOf.get(c.id) ?? 0) > 0.005);
    return [...list].sort((a, b) =>
      onlyDebtors
        ? (balanceOf.get(b.id) ?? 0) - (balanceOf.get(a.id) ?? 0)
        : a.name.localeCompare(b.name, "tr")
    );
  }, [q, onlyDebtors, state.customers, balanceOf]);

  const debtorCount = useMemo(
    () => [...balanceOf.values()].filter((b) => b > 0.005).length,
    [balanceOf]
  );

  const selected = state.customers.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  // Kasa ekranından "?m=<musteriId>" ile gelindiğinde o müşteriyi aç.
  useEffect(() => {
    const m = searchParams.get("m");
    if (m && state.customers.some((c) => c.id === m)) setSelectedId(m);
  }, [searchParams, state.customers]);

  function saveNew() {
    if (!nName.trim()) return;
    const extra: Partial<Customer> = {};
    if (state.sector === "veteriner" && nPetName.trim()) {
      extra.pet = { name: nPetName.trim(), species: nPetSpecies.trim() || "—" };
    }
    if (state.sector === "diyetisyen") {
      const h = parseFloat(nHeight.replace(",", "."));
      const w = parseFloat(nWeight.replace(",", "."));
      if (Number.isFinite(h)) extra.heightCm = h;
      if (Number.isFinite(w)) {
        extra.measurements = [{ id: "msr-" + Date.now(), date: new Date().toISOString().slice(0, 10), weightKg: w, note: "İlk ölçüm" }];
      }
    }
    const c = addCustomer({ name: nName.trim(), phone: nPhone.trim() || "—", birthday: nBirthday || undefined, ...extra });
    setSelectedId(c.id);
    setAdding(false);
    setNName("");
    setNPhone("");
    setNBirthday("");
    setNPetName("");
    setNPetSpecies("");
    setNWeight("");
    setNHeight("");
  }

  function exportCsv() {
    const header = ["Ad Soyad", "Telefon", "Bakiye", "Kayıt Tarihi"].join(",");
    const rows = filtered.map((c) => {
      const bal = balanceOf.get(c.id) ?? 0;
      return `"${c.name}","${c.phone}","${bal}","${c.createdAt.slice(0, 10)}"`;
    });
    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `musteriler-${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-end justify-between">
          <SectionTitle
            sub={`${state.customers.length} kayıtlı ${terms.customer.toLowerCase()}${
              debtorCount > 0 ? ` · ${debtorCount} borçlu` : ""
            }`}
          >
            {terms.customer}
          </SectionTitle>
          <button
            onClick={exportCsv}
            className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV İndir
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* Liste */}
          <Card className="flex max-h-[72vh] flex-col overflow-hidden">
            <div className="border-b border-line p-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Ara: isim veya telefon"
                    className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-3 text-[13.5px] text-ink outline-none focus:border-brand"
                  />
                </div>
                <button
                  onClick={() => setAdding(true)}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-deep"
                  aria-label="Müşteri ekle"
                >
                  <IcPlus className="h-4.5 w-4.5" />
                </button>
              </div>
              <button
                onClick={() => setOnlyDebtors((v) => !v)}
                className={`mt-2 w-full rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  onlyDebtors
                    ? "border-rose bg-rose/10 text-rose"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {onlyDebtors ? "Tüm müşteriler" : `Sadece borçlular (${debtorCount})`}
              </button>
            </div>

            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {filtered.map((c) => {
                const hist = customerHistory(state, c.id);
                const active = selected?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        active ? "bg-brand-soft" : "hover:bg-canvas/60"
                      }`}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold"
                        style={{ background: active ? "#2F5BEA" : "#EAF0FE", color: active ? "#fff" : "#1E3FA8" }}
                      >
                        {c.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-ink">{c.name}</div>
                        <div className="truncate text-[12px] text-muted">{c.phone}</div>
                      </div>
                      {(() => {
                        const bal = balanceOf.get(c.id) ?? 0;
                        if (bal > 0.005)
                          return (
                            <span className="tnum shrink-0 rounded-full bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
                              {formatTRY(bal)}
                            </span>
                          );
                        return (
                          <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                            {hist.length}
                          </span>
                        );
                      })()}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-10 text-center text-[13px] text-muted">Sonuç bulunamadı</li>
              )}
            </ul>
          </Card>

          {/* Detay */}
          {selected ? (
            <CustomerDetail key={selected.id} customer={selected} />
          ) : (
            <Card className="flex items-center justify-center p-12 text-[14px] text-muted">Bir müşteri seçin</Card>
          )}
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={() => setAdding(false)}>
          <div className="w-full max-w-[400px] animate-fade-up rounded-2xl bg-surface p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[17px] font-700 text-ink">Yeni {terms.customer}</h3>
              <button onClick={() => setAdding(false)} className="rounded-lg p-1 text-muted hover:bg-canvas">
                <IcX className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                autoFocus
                value={nName}
                onChange={(e) => setNName(e.target.value)}
                placeholder="Ad Soyad"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
              />
              <input
                value={nPhone}
                onChange={(e) => setNPhone(e.target.value)}
                placeholder="Telefon"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
              />
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted">Doğum günü (opsiyonel)</label>
                <input
                  type="date"
                  value={nBirthday}
                  onChange={(e) => setNBirthday(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
                />
              </div>
              {state.sector === "veteriner" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={nPetName}
                    onChange={(e) => setNPetName(e.target.value)}
                    placeholder="Hayvan adı"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                  <input
                    value={nPetSpecies}
                    onChange={(e) => setNPetSpecies(e.target.value)}
                    placeholder="Tür (kedi/köpek)"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                </div>
              )}
              {state.sector === "diyetisyen" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={nWeight}
                    onChange={(e) => setNWeight(e.target.value)}
                    placeholder="Başlangıç kilo (kg)"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                  <input
                    value={nHeight}
                    onChange={(e) => setNHeight(e.target.value)}
                    placeholder="Boy (cm)"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                </div>
              )}
            </div>
            <button
              onClick={saveNew}
              className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function CustomerDetail({ customer }: { customer: Customer }) {
  const { state, updateCustomerNote, updateCustomer } = useStore();
  const terms = sectorTerms(state.sector);
  const [note, setNote] = useState(customer.note ?? "");
  const [dirty, setDirty] = useState(false);
  const history = customerHistory(state, customer.id);

  const waHi = waLink(
    customer.phone,
    `Merhaba ${customer.name}, ${state.businessName} olarak size ulaşıyoruz.`
  );

  const totalSpent = history
    .filter((a) => a.status === "geldi")
    .reduce((s, a) => s + aptPrice(state, a), 0);
  const visits = history.filter((a) => a.status === "geldi").length;
  // Bakiye: hak edilen − tahsil edilen. Pozitif = borçlu, negatif = avansı var.
  const balance = customerBalance(state, customer.id);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between border-b border-line p-5">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-[16px] font-semibold text-white">
            {customer.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="font-display text-[19px] font-700 text-ink">{customer.name}</div>
            <a href={`tel:${customer.phone}`} className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted hover:text-brand">
              <IcPhone className="h-3.5 w-3.5" />
              {customer.phone}
            </a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[12px] text-muted">Kayıt: {relativeTime(customer.createdAt)}</span>
          {waHi && (
            <a
              href={waHi}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <IcSend className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Özet metrikleri */}
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-4 sm:divide-x">
        <Metric label="Ziyaret" value={`${visits}`} />
        <Metric label="Hizmet tutarı" value={formatTRY(totalSpent)} />
        <Metric label="Tahsil edilen" value={formatTRY(totalSpent - balance)} />
        <Metric
          label={balance < 0 ? "Alacağı" : "Borcu"}
          value={formatTRY(Math.abs(balance))}
          tone={balance > 0.005 ? "debt" : undefined}
        />
      </div>

      {/* Cari hesap */}
      <CariPanel customer={customer} />

      {/* Sektöre özel paneller */}
      {state.sector === "veteriner" && (
        <VetPanel customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
      )}
      {state.sector === "dishekimi" && (
        <DentalPanel customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
      )}
      {state.sector === "diyetisyen" && (
        <DietPanel customer={customer} onUpdate={(patch) => updateCustomer(customer.id, patch)} />
      )}

      {/* Doğum günü */}
      <div className="border-b border-line p-5">
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">Doğum günü</label>
        <input
          type="date"
          value={customer.birthday && customer.birthday.length === 10 ? customer.birthday : ""}
          onChange={(e) => updateCustomer(customer.id, { birthday: e.target.value || undefined })}
          className="w-full max-w-[220px] rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
        />
        {customer.birthday && customer.birthday.length !== 10 && (
          <p className="mt-1.5 text-[12px] text-muted">Kayıtlı: {customer.birthday}</p>
        )}
      </div>

      {/* Not */}
      <div className="border-b border-line p-5">
        <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">Not</label>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
          rows={2}
          placeholder="Tercihleri, alerjiler, hatırlatmalar..."
          className="w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
        />
        {dirty && (
          <button
            onClick={() => {
              updateCustomerNote(customer.id, note);
              setDirty(false);
            }}
            className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white"
          >
            Notu kaydet
          </button>
        )}
      </div>

      {/* Geçmiş */}
      <div className="p-5">
        <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {terms.appointment} geçmişi
        </h4>
        {history.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Henüz randevu yok.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((a) => {
              const st = staffById(state, a.staffId);
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <div className="w-[92px] shrink-0">
                    <div className="text-[12.5px] font-medium text-ink">{prettyDate(a.date).replace(/ \S+$/, "")}</div>
                    <div className="tnum text-[11.5px] text-muted">{a.start}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{aptServiceName(state, a)}</div>
                    <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                      {st && <StaffAvatar staff={st} size={16} />}
                      {st?.name ?? a.staffNameSnapshot}
                    </div>
                  </div>
                  {aptPrice(state, a) > 0 && (
                    <span className="tnum text-[13px] font-semibold text-ink">{formatTRY(aptPrice(state, a))}</span>
                  )}
                  <StatusChip status={a.status} size="xs" />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "debt" }) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 tnum font-display text-[18px] font-700 ${tone === "debt" ? "text-rose" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cari hesap paneli — ekstre + tahsilat alma + borç hatırlatma
// ---------------------------------------------------------------------------
function CariPanel({ customer }: { customer: Customer }) {
  const { state, addPayment } = useStore();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("nakit");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const balance = customerBalance(state, customer.id);
  const ledger = customerLedger(state, customer.id);
  const debts = openDebts(state, customer.id);
  const oldest = debts[0];

  const reminder = debtReminderText(state, customer.id);
  const wa = reminder ? waLink(customer.phone, reminder) : null;

  const amountNum = Number(amount.replace(",", "."));
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  function save() {
    if (!valid) return;
    addPayment({ date, amount: amountNum, method, customerId: customer.id });
    setAmount("");
    setOpen(false);
  }

  return (
    <div className="border-b border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Cari hesap</h4>
        <div className="flex items-center gap-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[#25D366] px-2.5 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Borç hatırlat
            </a>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            {open ? "Vazgeç" : "Tahsilat al"}
          </button>
        </div>
      </div>

      {balance > 0.005 ? (
        <p className="mt-2 text-[13px] text-ink">
          <strong className="text-rose">{formatTRY(balance)}</strong> borcu var
          {oldest && ` · en eski borç ${oldest.ageDays} gün (${prettyDate(oldest.date)})`}
        </p>
      ) : balance < -0.005 ? (
        <p className="mt-2 text-[13px] text-ink">
          <strong className="text-emerald">{formatTRY(-balance)}</strong> alacağı (avans) var.
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Hesap kapalı, borç yok.</p>
      )}

      {open && (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex flex-wrap gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Tutar"
              className="w-[120px] rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
            {balance > 0.005 && (
              <button
                onClick={() => setAmount(String(balance))}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-medium text-muted hover:text-ink"
              >
                Tamamı ({formatTRY(balance)})
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  method === m
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {methodLabel(m)}
              </button>
            ))}
          </div>
          <button
            onClick={save}
            disabled={!valid}
            className="mt-3 rounded-lg bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tahsilatı kaydet
          </button>
        </div>
      )}

      {ledger.length > 0 && (
        <ul className="mt-3 max-h-[220px] space-y-1 overflow-y-auto">
          {[...ledger].reverse().map((e) => (
            <li key={e.kind + e.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[12.5px] odd:bg-canvas/60">
              <span className="w-[72px] shrink-0 text-muted">{shortDate(e.date)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.label}</span>
              <span className={`tnum shrink-0 font-medium ${e.kind === "borc" ? "text-ink" : "text-emerald"}`}>
                {e.kind === "borc" ? "+" : "−"}
                {formatTRY(Math.abs(e.amount))}
              </span>
              <span className="tnum w-[86px] shrink-0 text-right text-muted">{formatTRY(e.running)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Sonraki tarih rozeti (aşı/kontrol) ----
function DueBadge({ nextDue }: { nextDue?: string }) {
  const st = dueStatus(nextDue);
  if (!st || st === "ileri") return null;
  if (st === "gecikti")
    return <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10.5px] font-semibold text-rose">🔴 gecikti</span>;
  return <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber">🟡 yaklaşıyor</span>;
}

// ===================== VETERİNER =====================
function VetPanel({ customer, onUpdate }: { customer: Customer; onUpdate: (p: Partial<Customer>) => void }) {
  const pet = customer.pet;
  const vaccines = customer.vaccines ?? [];
  const [adding, setAdding] = useState(false);
  const [vName, setVName] = useState("");
  const [vDate, setVDate] = useState(new Date().toISOString().slice(0, 10));
  const [vNext, setVNext] = useState("");

  function addVaccine() {
    if (!vName.trim() || !vDate) return;
    const rec: VaccineRecord = { id: "vac-" + Date.now(), name: vName.trim(), date: vDate, nextDue: vNext || undefined };
    onUpdate({ vaccines: [...vaccines, rec].sort((a, b) => b.date.localeCompare(a.date)) });
    setVName("");
    setVNext("");
    setAdding(false);
  }

  function removeVaccine(id: string) {
    onUpdate({ vaccines: vaccines.filter((v) => v.id !== id) });
  }

  const petAge = pet?.birthYear ? new Date().getFullYear() - pet.birthYear : null;

  return (
    <div className="border-b border-line p-5">
      <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted">Evcil Hayvan</h4>
      {pet ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-canvas/40 px-3.5 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-[18px]">🐾</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold text-ink">{pet.name}</div>
            <div className="text-[12.5px] text-muted">
              {pet.species}
              {pet.breed ? ` · ${pet.breed}` : ""}
              {petAge !== null ? ` · ${petAge} yaş` : ""}
            </div>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-muted">Hayvan bilgisi kayıtlı değil.</p>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Aşı Takvimi</h4>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-deep">
          <IcPlus className="h-3.5 w-3.5" /> Aşı ekle
        </button>
      </div>

      {adding && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-line bg-canvas/40 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Aşı adı (Karma, Kuduz...)" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} title="Yapıldığı tarih" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input type="date" value={vNext} onChange={(e) => setVNext(e.target.value)} title="Sonraki doz" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <button onClick={addVaccine} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-deep">Ekle</button>
        </div>
      )}

      {vaccines.length === 0 ? (
        <p className="py-3 text-[13px] text-muted">Henüz aşı kaydı yok.</p>
      ) : (
        <ul className="space-y-2">
          {vaccines.map((v) => (
            <li key={v.id} className="group flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  {v.name}
                  <DueBadge nextDue={v.nextDue} />
                </div>
                <div className="text-[11.5px] text-muted">
                  Yapıldı: {shortDate(v.date)}
                  {v.nextDue ? ` · Sonraki: ${shortDate(v.nextDue)}` : ""}
                </div>
              </div>
              <button onClick={() => removeVaccine(v.id)} className="text-[11px] text-muted transition-opacity hover:text-rose sm:opacity-0 sm:group-hover:opacity-100">Sil</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===================== DİŞ HEKİMİ =====================
function DentalPanel({ customer, onUpdate }: { customer: Customer; onUpdate: (p: Partial<Customer>) => void }) {
  const treatments = customer.treatments ?? [];
  const [adding, setAdding] = useState(false);
  const [tName, setTName] = useState("");
  const [tTooth, setTTooth] = useState("");
  const [tDate, setTDate] = useState(new Date().toISOString().slice(0, 10));
  const [tStatus, setTStatus] = useState<TreatmentStatus>("planlandı");

  function addTreatment() {
    if (!tName.trim() || !tDate) return;
    const rec: TreatmentRecord = { id: "trt-" + Date.now(), date: tDate, tooth: tTooth.trim() || undefined, name: tName.trim(), status: tStatus };
    onUpdate({ treatments: [rec, ...treatments].sort((a, b) => b.date.localeCompare(a.date)) });
    setTName("");
    setTTooth("");
    setAdding(false);
  }

  function toggleStatus(id: string) {
    onUpdate({
      treatments: treatments.map((t) =>
        t.id === id ? { ...t, status: t.status === "planlandı" ? "yapıldı" : "planlandı" } : t
      ),
    });
  }

  function removeTreatment(id: string) {
    onUpdate({ treatments: treatments.filter((t) => t.id !== id) });
  }

  return (
    <div className="border-b border-line p-5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Tedavi Planı</h4>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-deep">
          <IcPlus className="h-3.5 w-3.5" /> Tedavi ekle
        </button>
      </div>

      {adding && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-line bg-canvas/40 p-3 sm:grid-cols-[1fr_72px_auto_auto_auto]">
          <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="İşlem (Dolgu, Kanal...)" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input value={tTooth} onChange={(e) => setTTooth(e.target.value)} placeholder="Diş no" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <select value={tStatus} onChange={(e) => setTStatus(e.target.value as TreatmentStatus)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand">
            <option value="planlandı">planlandı</option>
            <option value="yapıldı">yapıldı</option>
          </select>
          <button onClick={addTreatment} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-deep">Ekle</button>
        </div>
      )}

      {treatments.length === 0 ? (
        <p className="py-3 text-[13px] text-muted">Henüz tedavi planı yok.</p>
      ) : (
        <ul className="space-y-2">
          {treatments.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <div className="w-[64px] shrink-0">
                <div className="text-[12.5px] font-medium text-ink">{shortDate(t.date)}</div>
                {t.tooth && <div className="text-[11px] text-muted">Diş {t.tooth}</div>}
              </div>
              <div className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">{t.name}</div>
              <button
                onClick={() => toggleStatus(t.id)}
                title="Durumu değiştir"
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  t.status === "yapıldı"
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-amber/30 bg-amber/10 text-amber"
                }`}
              >
                {t.status}
              </button>
              <button onClick={() => removeTreatment(t.id)} className="text-[11px] text-muted transition-opacity hover:text-rose sm:opacity-0 sm:group-hover:opacity-100">Sil</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===================== DİYETİSYEN =====================
function DietPanel({ customer, onUpdate }: { customer: Customer; onUpdate: (p: Partial<Customer>) => void }) {
  const measurements = [...(customer.measurements ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const [adding, setAdding] = useState(false);
  const [mWeight, setMWeight] = useState("");
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mNote, setMNote] = useState("");

  function addMeasurement() {
    const w = parseFloat(mWeight.replace(",", "."));
    if (!Number.isFinite(w) || !mDate) return;
    const rec: MeasurementRecord = { id: "msr-" + Date.now(), date: mDate, weightKg: Math.round(w * 10) / 10, note: mNote.trim() || undefined };
    onUpdate({ measurements: [...(customer.measurements ?? []), rec] });
    setMWeight("");
    setMNote("");
    setAdding(false);
  }

  const latest = measurements[measurements.length - 1];
  const first = measurements[0];
  const delta = latest && first ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : null;
  const toTarget =
    latest && customer.targetWeightKg != null
      ? Math.round((latest.weightKg - customer.targetWeightKg) * 10) / 10
      : null;

  // Mini trend (sparkline)
  const weights = measurements.map((m) => m.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min || 1;
  const w = 220;
  const h = 44;
  const pts = measurements.map((m, i) => {
    const x = measurements.length > 1 ? (i / (measurements.length - 1)) * w : w / 2;
    const y = h - ((m.weightKg - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="border-b border-line p-5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Ölçüm Geçmişi</h4>
        <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-deep">
          <IcPlus className="h-3.5 w-3.5" /> Ölçüm ekle
        </button>
      </div>

      {(latest || customer.heightCm || customer.targetWeightKg != null) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          {latest && <span>Güncel: <b className="text-ink">{latest.weightKg} kg</b></span>}
          {customer.heightCm != null && <span>Boy: <b className="text-ink">{customer.heightCm} cm</b></span>}
          {customer.targetWeightKg != null && <span>Hedef: <b className="text-ink">{customer.targetWeightKg} kg</b></span>}
          {delta != null && delta !== 0 && (
            <span className={delta < 0 ? "text-mint" : "text-rose"}>{delta < 0 ? "▼" : "▲"} {Math.abs(delta)} kg</span>
          )}
          {toTarget != null && toTarget > 0 && <span>Hedefe: <b className="text-ink">{toTarget} kg</b></span>}
          {toTarget != null && toTarget <= 0 && <span className="font-semibold text-mint">Hedefe ulaşıldı ✓</span>}
        </div>
      )}

      {adding && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-line bg-canvas/40 p-3 sm:grid-cols-[88px_auto_1fr_auto]">
          <input value={mWeight} onChange={(e) => setMWeight(e.target.value)} placeholder="Kilo (kg)" inputMode="decimal" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Not (opsiyonel)" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand" />
          <button onClick={addMeasurement} className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-deep">Ekle</button>
        </div>
      )}

      {measurements.length === 0 ? (
        <p className="py-3 text-[13px] text-muted">Henüz ölçüm yok.</p>
      ) : (
        <>
          {measurements.length > 1 && (
            <svg viewBox={`0 0 ${w} ${h}`} className="mb-3 h-12 w-full" preserveAspectRatio="none">
              <polyline points={pts.join(" ")} fill="none" stroke="#2F5BEA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <ul className="space-y-2">
            {[...measurements].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <div className="w-[64px] shrink-0 text-[12.5px] font-medium text-ink">{shortDate(m.date)}</div>
                <div className="tnum w-[68px] shrink-0 text-[14px] font-semibold text-ink">{m.weightKg} kg</div>
                {m.note && <div className="min-w-0 flex-1 truncate text-[12px] text-muted">{m.note}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
