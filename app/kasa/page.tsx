"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { useStore } from "@/lib/store";
import { formatTRY, prettyDate, todayISO, waLink } from "@/lib/utils";
import {
  AGING_BUCKETS,
  agingSummary,
  categoryLabel,
  customerBalances,
  dailyCollectedSeries,
  debtReminderText,
  methodLabel,
  rangeCashSummary,
  totalReceivable,
} from "@/lib/finance";
import type { ExpenseCategory, PaymentMethod } from "@/lib/types";

const METHODS: PaymentMethod[] = ["nakit", "kart", "havale"];
const CATEGORIES: ExpenseCategory[] = ["kira", "maas", "malzeme", "fatura", "vergi", "diger"];

export default function KasaPage() {
  const { state, addPayment, deletePayment, addExpense, deleteExpense } = useStore();
  const [range, setRange] = useState<1 | 7 | 30>(7);
  const [tab, setTab] = useState<"hareket" | "borclular">("hareket");

  const summary = useMemo(() => rangeCashSummary(state, range), [state, range]);
  const series = useMemo(() => dailyCollectedSeries(state, range === 1 ? 7 : range), [state, range]);
  const debtors = useMemo(() => customerBalances(state, { onlyDebtors: true }), [state]);
  const aging = useMemo(() => agingSummary(state), [state]);
  const receivable = useMemo(() => totalReceivable(state), [state]);

  // Dönemdeki hareketler (tahsilat + gider), yeniden eskiye.
  const movements = useMemo(() => {
    const rows = [
      ...state.payments
        .filter((p) => p.date >= summary.from && p.date <= summary.to)
        .map((p) => ({
          id: p.id,
          kind: "tahsilat" as const,
          date: p.date,
          amount: p.amount,
          label: methodLabel(p.method),
          who: state.customers.find((c) => c.id === p.customerId)?.name ?? "Genel",
          note: p.note,
        })),
      ...state.expenses
        .filter((e) => e.date >= summary.from && e.date <= summary.to)
        .map((e) => ({
          id: e.id,
          kind: "gider" as const,
          date: e.date,
          amount: e.amount,
          label: categoryLabel(e.category),
          who: "—",
          note: e.note,
        })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [state, summary.from, summary.to]);

  const uncollected = Math.max(0, summary.earned - summary.collected);

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle sub="Tahsilat, gider ve müşteri cari hesabı">Kasa & Cari</SectionTitle>
          <div className="flex rounded-lg bg-canvas p-0.5">
            {([1, 7, 30] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  range === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {r === 1 ? "Bugün" : r === 7 ? "7 gün" : "30 gün"}
              </button>
            ))}
          </div>
        </div>

        {/* KPI — ciro DEĞİL, kasaya giren para */}
        <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Kpi label="Tahsil edilen" value={formatTRY(summary.collected)} accent="#10B981" hint="kasaya giren" />
          <Kpi label="Gider" value={formatTRY(summary.expenses)} accent="#F43F5E" hint="kasadan çıkan" />
          <Kpi
            label="Net"
            value={formatTRY(summary.net)}
            accent={summary.net >= 0 ? "#2F5BEA" : "#F43F5E"}
            hint="tahsilat − gider"
          />
          <Kpi label="Açık alacak" value={formatTRY(receivable)} accent="#F59E0B" hint={`${debtors.length} borçlu`} />
        </div>

        {/* Ciro ↔ tahsilat ayrımı — modülün asıl anlattığı şey */}
        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Ciro mu, tahsilat mı?</h3>
              <p className="mt-1 max-w-[560px] text-[13px] text-muted">
                <strong className="text-ink">Ciro</strong> tamamlanan adisyon ve siparişlerin toplam bedeli — yani hak
                ettiğin para. <strong className="text-ink">Tahsilat</strong> ise kasaya fiilen giren para.
                Aradaki fark veresiyeler / müşterilerin sana olan borcudur.
              </p>
            </div>
            <div className="flex items-center gap-5">
              <Figure label="Dönem cirosu" value={formatTRY(summary.earned)} />
              <span className="text-[18px] text-muted">−</span>
              <Figure label="Tahsil edilen" value={formatTRY(summary.collected)} tone="ok" />
              <span className="text-[18px] text-muted">=</span>
              <Figure label="Tahsil edilmeyen" value={formatTRY(uncollected)} tone={uncollected > 0 ? "warn" : "ok"} />
            </div>
          </div>
        </Card>

        {/* Kayıt formları */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <PaymentForm onSave={addPayment} />
          <ExpenseForm onSave={addExpense} />
        </div>

        {/* Tahsilat trendi + yöntem kırılımı */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">Günlük tahsilat</h3>
              <span className="text-[12.5px] text-muted">Son {range === 1 ? 7 : range} gün</span>
            </div>
            <LineChart
              data={series.map((d, i) => ({
                label: i % Math.max(1, Math.ceil(series.length / 7)) === 0 ? d.label : "",
                value: d.value,
              }))}
              height={190}
              format={(n) => formatTRY(n)}
            />
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-[15px] font-semibold text-ink">Tahsilat yöntemi</h3>
            <ul className="space-y-2.5">
              {METHODS.map((m) => {
                const v = summary.byMethod[m];
                const pct = summary.collected > 0 ? Math.round((v / summary.collected) * 100) : 0;
                return (
                  <li key={m}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="text-ink">{methodLabel(m)}</span>
                      <span className="tnum font-semibold text-ink">{formatTRY(v)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <h3 className="mb-2 mt-5 text-[15px] font-semibold text-ink">Alacak yaşlandırma</h3>
            <ul className="space-y-1.5">
              {AGING_BUCKETS.map((b) => (
                <li key={b} className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">{b === "90+" ? "90+ gün" : `${b} gün`}</span>
                  <span className={`tnum font-semibold ${b === "90+" && aging[b] > 0 ? "text-rose" : "text-ink"}`}>
                    {formatTRY(aging[b])}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Hareketler / Borçlular */}
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line px-3 py-2.5">
            {(
              [
                ["hareket", `Hareketler (${movements.length})`],
                ["borclular", `Borçlular (${debtors.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === k ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "hareket" ? (
            movements.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">Bu dönemde kasa hareketi yok.</p>
            ) : (
              <ul className="divide-y divide-line">
                {movements.map((m) => (
                  <li key={m.kind + m.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
                        m.kind === "tahsilat" ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"
                      }`}
                    >
                      {m.kind === "tahsilat" ? "+" : "−"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">
                        {m.kind === "tahsilat" ? m.who : m.label}
                      </div>
                      <div className="truncate text-[12px] text-muted">
                        {prettyDate(m.date)} · {m.kind === "tahsilat" ? m.label : "Gider"}
                        {m.note ? ` · ${m.note}` : ""}
                      </div>
                    </div>
                    <span
                      className={`tnum shrink-0 text-[14px] font-semibold ${
                        m.kind === "tahsilat" ? "text-emerald" : "text-rose"
                      }`}
                    >
                      {m.kind === "tahsilat" ? "+" : "−"}
                      {formatTRY(m.amount)}
                    </span>
                    <button
                      onClick={() => (m.kind === "tahsilat" ? deletePayment(m.id) : deleteExpense(m.id))}
                      className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-rose/10 hover:text-rose"
                      aria-label="Kaydı sil"
                    >
                      Sil
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : debtors.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">
              Açık borcu olan müşteri yok. Hesaplar kapalı.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {debtors.map((d) => {
                const text = debtReminderText(state, d.customer.id);
                const wa = text ? waLink(d.customer.phone, text) : null;
                return (
                  <li key={d.customer.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/musteriler?m=${encodeURIComponent(d.customer.id)}`}
                        className="truncate text-[13.5px] font-medium text-ink hover:text-brand"
                      >
                        {d.customer.name}
                      </Link>
                      <div className="text-[12px] text-muted">
                        {formatTRY(d.charged)} hizmet · {formatTRY(d.paid)} tahsilat
                        {d.oldestDebtDays > 0 && ` · en eski borç ${d.oldestDebtDays} gün`}
                      </div>
                    </div>
                    <span
                      className={`tnum shrink-0 text-[15px] font-semibold ${
                        d.oldestDebtDays > 90 ? "text-rose" : "text-ink"
                      }`}
                    >
                      {formatTRY(d.balance)}
                    </span>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Hatırlat
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Formlar
// ---------------------------------------------------------------------------

function PaymentForm({
  onSave,
}: {
  onSave: (p: {
    date: string;
    amount: number;
    method: PaymentMethod;
    customerId?: string;
    note?: string;
  }) => void;
}) {
  const { state } = useStore();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("nakit");
  const [customerId, setCustomerId] = useState<string>("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");

  const amountNum = Number(amount.replace(",", "."));
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return state.customers
      .filter((c) => c.name.toLowerCase().includes(t) || c.phone.includes(t))
      .slice(0, 5);
  }, [q, state.customers]);

  const picked = state.customers.find((c) => c.id === customerId);

  function save() {
    if (!valid) return;
    onSave({
      date,
      amount: amountNum,
      method,
      customerId: customerId || undefined,
      note: note.trim() || undefined,
    });
    setAmount("");
    setNote("");
    setCustomerId("");
    setQ("");
  }

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Tahsilat ekle</h3>
      <p className="mt-0.5 text-[12.5px] text-muted">Kasaya giren parayı kaydet.</p>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <Field label="Tutar (TRY)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
          />
        </Field>
        <Field label="Tarih">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
          />
        </Field>
      </div>

      <Field label="Yöntem" className="mt-3">
        <Chips options={METHODS.map((m) => [m, methodLabel(m)])} value={method} onChange={setMethod} />
      </Field>

      <Field label="Müşteri (borcuna sayılsın)" className="mt-3">
        {picked ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
            <span className="flex-1 truncate text-[13.5px] text-ink">{picked.name}</span>
            <button
              onClick={() => {
                setCustomerId("");
                setQ("");
              }}
              className="text-[12px] font-medium text-muted hover:text-rose"
            >
              Kaldır
            </button>
          </div>
        ) : (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İsim veya telefon ara — boş bırakırsan genel tahsilat"
              className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
            />
            {matches.length > 0 && (
              <ul className="mt-1.5 overflow-hidden rounded-xl border border-line">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setCustomerId(c.id);
                        setQ("");
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-canvas"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-[11.5px] text-muted">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Field>

      <Field label="Not (opsiyonel)" className="mt-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Örn. eski borç kapatma"
          className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
        />
      </Field>

      <button
        onClick={save}
        disabled={!valid}
        className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        Tahsilatı kaydet
      </button>
    </Card>
  );
}

function ExpenseForm({
  onSave,
}: {
  onSave: (e: { date: string; amount: number; category: ExpenseCategory; note?: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("malzeme");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const amountNum = Number(amount.replace(",", "."));
  const valid = Number.isFinite(amountNum) && amountNum > 0;

  function save() {
    if (!valid) return;
    onSave({ date, amount: amountNum, category, note: note.trim() || undefined });
    setAmount("");
    setNote("");
  }

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Gider ekle</h3>
      <p className="mt-0.5 text-[12.5px] text-muted">Kasadan çıkan parayı kaydet.</p>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <Field label="Tutar (TRY)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
          />
        </Field>
        <Field label="Tarih">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
          />
        </Field>
      </div>

      <Field label="Kategori" className="mt-3">
        <Chips options={CATEGORIES.map((c) => [c, categoryLabel(c)])} value={category} onChange={setCategory} />
      </Field>

      <Field label="Not (opsiyonel)" className="mt-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Örn. Eylül kirası"
          className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
        />
      </Field>

      <button
        onClick={save}
        disabled={!valid}
        className="mt-4 w-full rounded-xl bg-ink py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Gideri kaydet
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Küçük parçalar
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Native <select> kullanılmaz — dokunmatikte de okunaklı chip seçici. */
function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
            value === v
              ? "border-brand bg-brand-soft text-brand"
              : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
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

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald" : tone === "warn" ? "text-amber" : "text-ink";
  return (
    <div className="text-right">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={`tnum font-display text-[17px] font-700 ${color}`}>{value}</div>
    </div>
  );
}
