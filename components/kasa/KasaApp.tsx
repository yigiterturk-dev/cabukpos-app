"use client";
import { staffCan } from "@/lib/core/staff-permissions";
// Kasa uygulaması (çevrimdışı çalışır). Veri IndexedDB'de; PIN cihazda doğrulanır; satış/vardiya giden kutusuna
// yazılır ve arka planda /api/sync ile eşitlenir. Kasiyer oturumu yalnız bellekte (sayfa yenilenince PIN yeniden).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatReceipt, parseTL, type Currency } from "@/lib/core/money";
import { currencyUnit, kasaFmt } from "./kasa-format";
import { MAX_PAYMENT_KURUS, PAY_METHODS } from "@/lib/core/payment";
import { countCash, summarizeShift, BANKNOTES, COINS, type CashBreakdown } from "@/lib/core/shift";
import { clearResetNotice, closeShiftLocal, kasaDb, loadMeta, openShiftLocal, recordAuditLocal, recordRegisterEventLocal, recordSaleLocal, safeDropLocal, setSaleFiscal, shiftSales, waitPushed, type SaleExtrasInput } from "@/lib/offline/db";
import { pauseSync } from "@/lib/offline/sync";
import type { Buyer } from "@/lib/core/fiscal";
import { agentStatus, openDrawer, printDeliverySlip, printKitchen, printSale, printShift, readScale, retryPrint, withTestFlag, type AgentStatus, type PrintResult } from "@/lib/offline/agent";
import { fiscalNotes } from "@/lib/core/receipt";
import { refundNote } from "@/lib/core/refundNote";
import { pendingPrints } from "@/lib/core/kitchen";
import { paidLinesOf, payableLines, type PayLine } from "@/lib/core/split";
import { totals } from "@/lib/core/cart";
import { deliveryStatus, openTabsByTable, type DeliveryMethod, type TabState, tabLabel } from "@/lib/core/tab";
import { deliveryPaymentMethod } from "@/lib/core/delivery";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import type { Payment } from "@/lib/core/payment";
import { createSync, type SyncStatus } from "@/lib/offline/sync";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { ArrowLeft, ClipboardCheck, Inbox, Landmark, LayoutDashboard, LayoutGrid, LogOut, Printer, Bike, RotateCw, Undo2, Zap } from "lucide-react";
import { Button, Card, Field, Input, LogoMark, Segmented } from "@/components/ui";
import { InstallButton } from "@/components/InstallButton";
import { ShiftReport, type ShiftReportData } from "@/components/ShiftReport";
import { PinPad, type Cashier } from "./PinPad";

const MAX_SYNC_CASH_KURUS = MAX_PAYMENT_KURUS;
import { RefundScreen } from "./RefundScreen";
import { SaleScreen, type OnSale, type PrintView } from "./SaleScreen";
import { onSyncNow, registerKasaSw, registerOutboxPeriodicDrain, registerOutboxSync } from "./sw-register";
import { SalonScreen } from "./SalonScreen";
import { TabScreen } from "./TabScreen";
import { BillScreen } from "./BillScreen";
import { KitchenScreen } from "./KitchenScreen";
import { useOrderAlert } from "./useOrderAlert";
import { printHtml } from "@/lib/offline/browser-print";
import { kitchenTicketHtml } from "@/lib/core/kitchen";
import { useKasaSetting } from "./useKasaSetting";
import { ALERT_VALUES, DIRECT_PRINT_KEY } from "./DeliverySoundControls";
import { useNow, useTabs } from "./useTabs";
import { DeliveryBoard, type CourierJobView } from "./DeliveryBoard";
import { NewDelivery } from "./NewDelivery";
import { CourierScreen } from "./CourierScreen";
import { BugunScreen } from "./BugunScreen";
import { beep } from "./beep";

type View = { name: "home" } | { name: "sale" } | { name: "bugun" } | { name: "tab"; tableId: string } | { name: "bill"; tabId: string } | { name: "receipt"; sale: LocalSale } | { name: "gun-sonu" } | { name: "closed" } | { name: "iade" } | { name: "cekmece" } | { name: "safe-drop" }
  | { name: "paket" } | { name: "yeni-paket" } | { name: "ptab"; tabId: string } | { name: "kurye-kapat" } | { name: "kurye-gun-sonu"; by: string }; // M6
type PrintState = PrintView & { jobId?: string | null };

function Center({ title, sub, logo, card, focusTitle = false, children }: { title: string; sub?: string; logo?: boolean; card?: boolean; focusTitle?: boolean; children?: React.ReactNode }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusTitle) titleRef.current?.focus(); }, [focusTitle, title]);
  return (
    <main id="kasa-content" tabIndex={-1} className="relative grid min-h-0 flex-1 place-items-center overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-8 outline-none">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(224_90_16/0.14),transparent)]" />
      <div className="relative w-full max-w-sm">
        {logo && <LogoMark size="lg" className="mx-auto mb-6" />}
        <h1 ref={titleRef} tabIndex={focusTitle ? -1 : undefined} className="break-words text-center font-display text-[28px] font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{title}</h1>
        {sub && <p className="mt-1.5 break-words text-center text-sm text-muted">{sub}</p>}
        {children && (card ? <Card className="mt-6 p-6 shadow-raised">{children}</Card> : <div className="mt-8">{children}</div>)}
      </div>
    </main>
  );
}

/** Kasa üst şeridi: marka + işletme/cihaz, bölüm segmenti, sağda durum ve eylemler. */
function Bar({ tenant, device, nav, children }: { tenant: string; device: string; nav?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex min-w-0 min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-black/40 bg-espresso px-3 py-1 text-cream shadow-[inset_0_1px_0_rgb(255_255_255/0.07)] ring-1 ring-inset ring-white/5 print:hidden">
      <a href="#kasa-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-pop focus-visible:ring-4 focus-visible:ring-brand-ring/60">İçeriğe geç</a>
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoMark />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-display text-sm font-bold tracking-tight" title={tenant}>{tenant}</div>
          <div className="truncate text-xs text-cream-muted" title={device}>{device}</div>
        </div>
      </div>
      {nav && <span aria-hidden className="hidden h-7 w-px bg-white/10 sm:block" />}
      {nav}
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{children}
        <button type="button" onClick={() => location.reload()} title="Yenile" aria-label="Sayfayı yenile" className="press inline-flex size-11 items-center justify-center rounded-lg text-cream outline-none hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-brand-ring/60"><RotateCw aria-hidden className="size-5" /></button>
      </div>
    </header>
  );
}

const LinkNote = ({ link }: { link: string }) => (
  <>
    {link === "yok" && <span className="text-xs font-medium text-warn">Canlı bağlantı yok</span>}
    {link === "lan" && <span data-testid="link-lan" className="text-xs font-medium text-info">Yerel ağ (internet yok)</span>}
  </>
);

function SyncBadge({ s }: { s: SyncStatus }) {
  const online = s.online && !s.unpaired;
  const delayed = online && s.pending > 0;
  const label = !online ? "Çevrimdışı — satışlar bu cihazda kuyruğa alınır" : delayed ? `${s.pending} belge eşitlenmeyi bekliyor` : "Bulut eşitlemesi güncel";
  return (
    <span data-testid="sync-status" role="status" aria-live="polite" aria-label={label} title={label} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${!online || delayed ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
      <span className={`size-2 rounded-full ${!online || delayed ? "motion-safe:animate-pulse bg-warn" : "bg-ok"}`} />
      {online ? "Çevrimiçi" : "Çevrimdışı"}
      {s.pending > 0 && <span data-testid="sync-pending"> · {s.pending} bekleyen</span>}
    </span>
  );
}

// Chrome 142+: https sayfadan 127.0.0.1 ajanına istek "yerel ağ erişimi" izni ister; reddedilirse ajan kapalı görünür.
function useLocalNetworkDenied(check: boolean) {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!check || !navigator.permissions) return;
    let alive = true;
    for (const name of ["local-network-access", "loopback-network"]) {
      navigator.permissions.query({ name } as unknown as PermissionDescriptor).then((st) => {
        if (alive && st.state === "denied") setDenied(true);
      }, () => {});
    }
    return () => { alive = false; };
  }, [check]);
  return denied;
}

function AgentBadge({ s }: { s: AgentStatus | null }) {
  const lnaDenied = useLocalNetworkDenied(!!s && !s.reachable);
  if (!s) return null;
  const missing = s.printers.length === 0;
  const bad = !s.reachable || s.printers.some((p) => p.ok === false) || s.failed.length > 0;
  const text = !s.reachable ? (lnaDenied ? "Chrome yerel ağ izni kapalı" : "Ajan kapalı") : s.printers.length === 0 ? "Yazıcı tanımlı değil" : bad ? `Yazıcı hatası${s.failed.length ? ` · ${s.failed.length} fiş bekliyor` : ""}` : "Yazıcı hazır";
  return (
    <>
      <span data-testid="agent-status" role="status" aria-label={text} title={lnaDenied && !s.reachable ? "Adres çubuğundaki kilit simgesi → Site ayarları → Yerel ağ erişimi: İzin ver, sonra sayfayı yenileyin." : s.printers.find((p) => p.error)?.error ?? text} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${bad ? "bg-bad-soft text-bad" : missing ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
        <Printer aria-hidden className="size-3.5" />
        {text}
      </span>
      {lnaDenied && !s.reachable && (
        <details className="relative">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg px-2 text-xs font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 [&::-webkit-details-marker]:hidden">İzin adımları</summary>
          <div role="note" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 text-sm text-ink shadow-raised">
            <p>Adres çubuğundaki kilit simgesini açın, Site ayarları → Yerel ağ erişimi bölümünde İzin ver’i seçin, ardından kasayı yenileyin.</p>
          </div>
        </details>
      )}
    </>
  );
}

function MoneyForm({ label, hint, submit, pendingMessage, onSubmit, defaultValue = "", currency, positive = false }: { label: string; hint?: string; submit: string; pendingMessage: string; onSubmit: (k: number) => Promise<void>; defaultValue?: string; currency?: Currency; positive?: boolean }) {
  const errorId = useId();
  const submitButtonId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [amount, setAmount] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!error || busy || amountInvalid) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(submitButtonId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [amountInvalid, busy, error, submitButtonId]);
  return (
    <form
      className="space-y-4"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (submittingRef.current) return;
        const k = parseTL(amount);
        if (k === null || (positive && k === 0)) {
          setError(k === null ? "Tutar geçersiz (ör. 500 ya da 500,00)." : "Aktarılacak tutar sıfırdan büyük olmalı.");
          setAmountInvalid(true);
          requestAnimationFrame(() => amountRef.current?.focus());
          return;
        }
        if (k > MAX_SYNC_CASH_KURUS) {
          setError("Tutar en fazla 1.000.000 olabilir.");
          setAmountInvalid(true);
          requestAnimationFrame(() => amountRef.current?.focus());
          return;
        }
        setError(null);
        setAmountInvalid(false);
        submittingRef.current = true;
        setBusy(true);
        try {
          await onSubmit(k);
        } catch (e) {
          setError(e instanceof Error ? e.message : "İşlem kaydedilemedi. Tekrar deneyin.");
        } finally {
          submittingRef.current = false;
          setBusy(false);
        }
      }}
    >
      <Field label={label} hint={hint ?? `En fazla 1.000.000 ${currencyUnit(currency)}.${positive ? " Sıfırdan büyük olmalı." : ""}`}><Input ref={amountRef} name="amount" inputMode="decimal" maxLength={12} value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); setAmountInvalid(false); }} disabled={busy} aria-invalid={amountInvalid || undefined} aria-describedby={amountInvalid ? errorId : undefined} className={`tabular h-14 text-right text-2xl font-semibold disabled:cursor-wait disabled:opacity-50 ${amountInvalid ? "border-bad focus:border-bad focus:ring-bad/40" : ""}`} required /></Field>
      {error && <p id={errorId} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {busy && <p className="sr-only" role="status" aria-live="polite">{pendingMessage}</p>}
      <Button id={submitButtonId} type="submit" size="lg" disabled={busy} className="w-full">{busy ? "Kaydediliyor…" : submit}</Button>
    </form>
  );
}

/** #48: banknot/bozuk kırılımıyla sayım; toplamı sayılan nakde aktarır. */
function CashCount({ onApply, currency }: { onApply: (k: number) => void; currency?: Currency }) {
  const { TL } = kasaFmt({ device: { currency } });
  const unit = currencyUnit(currency);
  const [b, setB] = useState<CashBreakdown>({});
  const total = countCash(b);
  const [announcedTotal, setAnnouncedTotal] = useState(total);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedTotal(total), 600);
    return () => window.clearTimeout(timer);
  }, [total]);
  return (
    <details className="rounded-[10px] border border-line p-3" data-testid="cash-count">
      <summary className="inline-flex min-h-12 cursor-pointer items-center rounded-md px-1 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Para kırılımıyla say</summary>
      <p className="mt-2 text-xs text-muted">Kupür başına en fazla 9.999 adet girilebilir.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...BANKNOTES, ...COINS].map((v) => {
          const denomination = v >= 100 ? `${v / 100} ${unit}` : unit === "TL" ? `${v} kr` : TL(v);
          return (
            <label key={v} className="text-xs">
              <span className="mb-1 block font-medium">{denomination}</span>
              <Input aria-label={`${denomination} adedi`} inputMode="numeric" maxLength={4} className="tabular min-h-12 text-right" value={b[v] ? String(b[v]) : ""}
                onChange={(e) => setB({ ...b, [v]: Math.min(9999, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted">Sayılan toplam</span>
        <span className="tabular font-semibold" data-testid="cash-count-total">{TL(total)}</span>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcedTotal !== total ? "" : `Sayılan toplam: ${TL(announcedTotal)}`}</span>
      {total > MAX_SYNC_CASH_KURUS && <p className="mt-2 text-sm text-bad" role="status" aria-live="polite">Toplam 1.000.000 {unit} sınırını aşıyor; adetleri azaltın.</p>}
      <Button type="button" variant="secondary" className="mt-3 min-h-12 w-full" disabled={total <= 0 || total > MAX_SYNC_CASH_KURUS} onClick={() => onApply(total)}>Sayılanı nakde aktar</Button>
    </details>
  );
}

/** Gün sonu kapanışı: eşitleme bandını durdurur, işlem zaman aşımına düşerse bir kez daha dener (IDB açlık koruması). */
async function closeShiftGuarded(staffId: string, counted: number): Promise<Meta> {
  pauseSync(true);
  try {
    for (let i = 0; ; i++) {
      const m = await Promise.race([
        closeShiftLocal(staffId, counted),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      if (m) return m;
      if (i >= 2) throw new Error("Kapanış kaydedilemedi; tekrar deneyin.");
    }
  } finally {
    pauseSync(false);
  }
}

/** #48: gün sonu kapanış formu — kırılımlı sayım + sayılan nakit. */
function KapanisForm({ onClose, currency, expected }: { onClose: (counted: number) => Promise<void>; currency?: Currency; expected?: number | null }) {
  const amountRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const closeButtonId = useId();
  const [error, setError] = useState<string | null>(null);
  const [invalidAmount, setInvalidAmount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const parsedCounted = amount ? parseTL(amount) : null;
  const counted = parsedCounted !== null && parsedCounted <= MAX_SYNC_CASH_KURUS ? parsedCounted : null;
  const diff = counted !== null && expected != null ? counted - expected : null;
  const changeAmount = (value: string) => { setAmount(value); setError(null); setInvalidAmount(false); };
  useEffect(() => {
    if (!error || busy || invalidAmount) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(closeButtonId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [busy, closeButtonId, error, invalidAmount]);
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const k = parseTL(amount);
      if (k === null || k > MAX_SYNC_CASH_KURUS) {
        setError(k === null ? "Tutar geçersiz (ör. 500 ya da 500,00)." : "Sayılan tutar en fazla 1.000.000 olabilir.");
        setInvalidAmount(true);
        requestAnimationFrame(() => amountRef.current?.focus());
        return;
      }
      setError(null);
      setInvalidAmount(false);
      setBusy(true);
      void onClose(k).catch((e) => setError(e instanceof Error ? e.message : "Kapanış kaydedilemedi.")).finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} aria-busy={busy} className="m-0 space-y-4 border-0 p-0">
        <CashCount onApply={(k) => changeAmount(String(k / 100).replace(".", ","))} currency={currency} />
        <Field label={`Sayılan nakit (${currencyUnit(currency)})`} hint={`Kasadaki nakdi sayıp girin; fark beklenen kasaya göre hesaplanır. En fazla 1.000.000 ${currencyUnit(currency)}.`}>
          <Input ref={amountRef} id="shift-counted-cash" name="amount" inputMode="decimal" maxLength={12} value={amount} onChange={(e) => changeAmount(e.target.value)} aria-invalid={invalidAmount || undefined} aria-describedby={invalidAmount ? errorId : undefined} className="tabular h-14 text-right text-2xl font-semibold" required />
        </Field>
        {expected != null && (
          <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-muted">Beklenen kasa</span><span className="tabular font-medium">{formatReceipt(expected, currency)}</span></div>
            <div className="mt-1 flex items-center justify-between gap-3"><span className="text-muted">Kapanış farkı</span><span className={`tabular font-semibold ${diff === null ? "text-muted" : diff < 0 ? "text-bad" : diff > 0 ? "text-ok" : "text-ink"}`}>{diff === null ? "Sayılan tutarı girin" : `${diff < 0 ? "−" : diff > 0 ? "+" : ""}${formatReceipt(Math.abs(diff), currency)}`}</span></div>
          </div>
        )}
      </fieldset>
      {error && <p id={errorId} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {busy && <p className="sr-only" role="status" aria-live="polite">Gün sonu kapanışı kaydediliyor.</p>}
      <Button id={closeButtonId} type="submit" size="lg" disabled={busy} className="w-full">{busy ? "Kapanış kaydediliyor…" : "Gün sonunu kapat"}</Button>
    </form>
  );
}

const qty = (m: number, weighed = false) => (weighed ? `${(m / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : m % 1000 === 0 ? String(m / 1000) : (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 }));
const payLabel = (m: string) => PAY_METHODS.find((p) => p.value === m)?.label ?? m;

const FISCAL_WAIT_MS = 3000;
/** Satış eşitlenir, bulut keser; toplam en çok 3 sn. Kesildiyse yerel satışa numara/ETTN yazılır. */
async function issueFiscal(sale: LocalSale, pushed: Promise<void> | undefined): Promise<LocalSale> {
  if (!navigator.onLine) return sale;
  const deadline = Date.now() + FISCAL_WAIT_MS;
  const timeout = (ms: number) => new Promise<"timeout">((r) => setTimeout(() => r("timeout"), Math.max(0, ms)));
  // Bütçe aşılsa da iş arka planda sürer: yerel satışa numara yazılır (fiş yeniden basılınca görünür).
  const work = (async () => {
    // Tüm eşitleme turunu (push + katalog) değil, yalnız bu satışın buluta yazılmasını bekle.
    if (!(await waitPushed(sale.id, 60_000))) await pushed;
    const res = await fetch("/api/fiscal/issue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ saleId: sale.id }) });
    if (!res.ok) return sale;
    const j = (await res.json()) as { status: string; number: string | null; ettn: string | null };
    if (j.status !== "issued" || !j.number || !j.ettn) return sale;
    return (await setSaleFiscal(sale.id, j.number, j.ettn)) ?? sale;
  })().catch(() => sale);
  const r = await Promise.race([work, timeout(deadline - Date.now())]);
  return r === "timeout" ? sale : r;
}

function Receipt({ meta, sale, onBack, onPrinted }: { meta: Meta; sale: LocalSale; onBack: () => void; onPrinted: (r: PrintResult) => void }) {
  const d = meta.device!;
  const TL = (k: number) => formatReceipt(k, d.currency); // ekrandaki fiş = basılan fiş (#16)
  const [msg, setMsg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (printing) return;
    let job: ReturnType<typeof printSale>;
    try {
      job = printSale(meta, sale);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Yazıcı işi başlatılamadı.";
      onPrinted({ ok: false, error, jobId: null });
      setMsg(`Yazdırılamadı (${error}). Tarayıcıdan yazdırabilirsiniz.`);
      return;
    }
    if (!job) return window.print();
    setPrinting(true);
    setMsg("Yazdırılıyor…");
    try {
      const r = await job;
      onPrinted(r);
      setMsg(r.ok ? "Yazıcıya gönderildi." : `Yazdırılamadı (${r.error}). Tarayıcıdan yazdırabilirsiniz.`);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Bilinmeyen yazıcı hatası.";
      onPrinted({ ok: false, error, jobId: null });
      setMsg(`Yazdırılamadı (${error}). Tarayıcıdan yazdırabilirsiniz.`);
    } finally {
      setPrinting(false);
    }
  };
  const at = new Date(sale.at);
  const weighed = (id: string) => meta.catalog.products.find((p) => p.id === id)?.kind === "tartili";
  const f = withTestFlag(meta, sale).fiscal;
  const fiscal = f ? fiscalNotes(f, location.origin) : null;
  const rn = sale.refund && sale.refundFiscal ? refundNote(sale.refundFiscal, d.tenantName, sale.receiptNo) : null;
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 0 } @media print { body { background: #fff } }`}</style>
      <main id="kasa-content" tabIndex={-1} className="outline-none">
      <div className="flex justify-center gap-2 border-b border-line bg-surface p-3 print:hidden">
        <Button variant="ghost" className="min-h-12" onClick={onBack}><ArrowLeft aria-hidden className="size-4" />Kasaya dön</Button>
        {meta.agent && <Button variant="ghost" className="min-h-12" onClick={() => window.print()}>Tarayıcıdan yazdır</Button>}
        <Button className="min-h-12" disabled={printing} onClick={() => void print()}><Printer aria-hidden className="size-4" />{printing ? "Yazdırılıyor…" : "Yazdır"}</Button>
      </div>
      {msg && <p className="p-2 text-center text-sm print:hidden" role="status">{msg}</p>}
      <article className="mx-auto my-6 w-[80mm] bg-surface p-[4mm] font-mono shadow-card print:shadow-none text-[12px] leading-snug print:my-0 print:p-[4mm]">
        <header className="text-center">
          <div className="text-[14px] font-bold">{d.tenantName}</div>
          {sale.refund && <div className="mt-1 text-[14px] font-bold">İADE FİŞİ</div>}
          {d.storeName && <div>{d.storeName}</div>}
          {d.storeAddress && <div>{d.storeAddress}</div>}
        </header>
        <div className="mt-2 border-t border-dashed border-ink pt-1">
          <div className="flex justify-between"><span>{at.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span><span>{at.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}</span></div>
          <div className="flex justify-between"><span>Fiş no</span><span>{sale.receiptNo}</span></div>
          {sale.refund && <div className="flex justify-between"><span>Asıl fiş</span><span>{sale.refundOfNo}</span></div>}
          {sale.tableName && <div className="flex justify-between"><span>Masa</span><span>{sale.tableName}</span></div>}
          <div className="flex justify-between"><span>Kasiyer</span><span>{sale.staffName}</span></div>
        </div>
        <div className="mt-1 border-t border-dashed border-ink pt-1">
          {sale.lines.map((l, i) => (
            <div key={i} className="py-0.5">
              <div>{l.name}</div>
              {l.options?.map((o) => <div key={o.id} className="pl-2">+ {o.name}</div>)}
              <div className="flex justify-between pl-2"><span>{qty(l.qtyMilli, Boolean(l.productId && weighed(l.productId)))} × {TL(l.unitPrice)}</span><span>{TL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span></div>
              {l.discount ? <div className="flex justify-between pl-2"><span>İndirim</span><span>-{TL(l.discount)}</span></div> : null}
            </div>
          ))}
        </div>
        <table className="mt-1 w-full border-t border-dashed border-ink">
          <thead><tr><th scope="col" className="text-left font-normal">Oran</th><th scope="col" className="text-right font-normal">Matrah</th><th scope="col" className="text-right font-normal">KDV</th></tr></thead>
          <tbody>{sale.vat.map((v) => <tr key={v.rate}><td>%{v.rate}</td><td className="text-right">{TL(v.net)}</td><td className="text-right">{TL(v.vat)}</td></tr>)}</tbody>
        </table>
        <div className="mt-1 flex justify-between border-t border-dashed border-ink pt-1 text-[14px] font-bold"><span>{sale.refund ? "İADE TOPLAMI" : "TOPLAM"}</span><span>{TL(sale.total)}</span></div>
        <div className="mt-1">
          {sale.payments.map((p) => <div key={p.method} className="flex justify-between"><span>{sale.refund ? `İade (${payLabel(p.method)})` : payLabel(p.method)}</span><span>{TL(p.amount)}</span></div>)}
          {sale.change > 0 && <div className="flex justify-between"><span>Para üstü</span><span>{TL(sale.change)}</span></div>}
        </div>
        {fiscal && (
          <div className="mt-2 border-t border-dashed border-ink pt-1" data-testid="receipt-fiscal">
            {fiscal.title && <div className="text-center font-bold">{fiscal.title}</div>}
            {fiscal.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="text-right">{v}</span></div>)}
            {fiscal.notes.map((n) => <div key={n} className="break-all">{n}</div>)}
            {!fiscal.notes.some((n) => n.includes(fiscal.url)) && <a href={fiscal.url} className="block break-all underline print:no-underline">{fiscal.url}</a>}
          </div>
        )}
        {rn?.kind === "note" && <p className="mt-2 border-t border-dashed border-ink pt-1">{rn.text}</p>}
        {rn?.kind === "tutanak" && (
          <div className="mt-2 border-t border-dashed border-ink pt-1" data-testid="refund-note">
            <div className="text-center font-bold">{rn.title}</div>
            {rn.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="break-all text-right">{v}</span></div>)}
            <p className="mt-1">{rn.statement}</p>
            {rn.sign.map((s) => <div key={s} className="mt-4 flex gap-1"><span>{s}:</span><span className="flex-1 border-b border-dotted border-ink" /></div>)}
          </div>
        )}
        {!fiscal?.title && <p className="mt-3 border-t border-dashed border-ink pt-2 text-center">Bilgi fişidir, mali değeri yoktur.</p>}
      </article>
      </main>
    </>
  );
}

function reportData(meta: Meta, sales: LocalSale[], closed: boolean): ShiftReportData | null {
  const sh = closed ? meta.lastClosed : meta.shift;
  if (!sh) return null;
  const name = (id: string | null) => meta.catalog.staff.find((s) => s.id === id)?.name ?? "—";
  const c = closed ? meta.lastClosed! : null;
  return {
    shift: { openingCash: sh.openingCash, openedAt: new Date(sh.openedAt), closedAt: c ? new Date(c.closedAt) : null, countedCash: c?.countedCash ?? null, expectedCash: c?.expectedCash ?? null },
    summary: summarizeShift(sh.openingCash, sales, c ? (c.dropped ? [c.dropped] : []) : (meta.drops ?? []).map((d) => d.amount)),
    openedByName: name(sh.openedBy),
    closedByName: name(c?.closedBy ?? null),
    sales: sales.map((s) => ({ id: s.id, receiptNo: s.receiptNo, createdAt: new Date(s.at), total: s.refund ? -s.total : s.total })),
    currency: meta.device?.currency,
  };
}

function GunSonu({ meta, closed, onClose, onBack }: { meta: Meta; closed: boolean; onClose: (counted: number) => Promise<void>; onBack: () => void }) {
  const shiftId = closed ? meta.lastClosed?.id : meta.shift?.id;
  const [loaded, setLoaded] = useState<{ shiftId: string; data: ShiftReportData } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!shiftId) return;
    let alive = true;
    void shiftSales(shiftId).then(async (s) => {
      const d = reportData(meta, s, closed);
      if (!alive) return;
      if (d) setLoaded({ shiftId, data: d });
      // M8: kesilemeyen e-Arşiv sayısı buluttan (çevrimdışıysa gösterilmez)
      if (d && s.some((x) => x.fiscal)) {
        const n = await fetch(`/api/fiscal/shift?shiftId=${shiftId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { errors?: number } | null) => j?.errors).catch(() => undefined);
        if (alive && n) setLoaded({ shiftId, data: { ...d, fiscalErrors: n } });
      }
    }).catch(() => { if (alive) setLoadError(shiftId); });
    return () => { alive = false; };
  }, [shiftId, meta, closed, retry]);
  const data = shiftId && loaded?.shiftId === shiftId ? loaded.data : null;
  const failed = !!shiftId && loadError === shiftId;
  return (
    <main id="kasa-content" tabIndex={-1} className="mx-auto w-full max-w-lg px-4 py-6 outline-none">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" className="min-h-12" onClick={onBack}>← Kasa</Button>
        {closed && <div className="ml-auto flex max-w-full flex-wrap gap-2">
          {data && meta.agent && (
          <Button variant="secondary" className="min-h-12" onClick={() => {
              const sh = meta.lastClosed!;
              void printShift(meta, { deviceName: meta.device!.name, openedByName: data.openedByName, closedByName: data.closedByName, openingCash: sh.openingCash, openedAt: new Date(sh.openedAt), closedAt: new Date(sh.closedAt), countedCash: sh.countedCash, expectedCash: sh.expectedCash, summary: data.summary, fiscalErrors: data.fiscalErrors });
            }}>Fiş yazıcısına</Button>
          )}
          <Button variant="secondary" className="min-h-12" onClick={() => window.print()}>Yazdır / PDF</Button>
        </div>}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{closed ? "Vardiya kapandı" : "Gün sonu"}</h1>
      <p className="mb-5 text-sm text-muted">{meta.device?.tenantName} · {meta.device?.name}</p>
      {!data && (failed ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn" role="alert">
        <span>Vardiya satışları okunamadı; beklenen kasa tutarı doğrulanamıyor.</span>
        <button type="button" onClick={() => { setLoadError(null); setRetry((n) => n + 1); }} className="inline-flex min-h-11 items-center rounded-lg border border-warn/30 bg-surface px-3 font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yeniden yükle</button>
      </div> : <p className="sr-only" role="status" aria-live="polite">Vardiya satışları yükleniyor.</p>)}
      {data && <ShiftReport data={data} showSales={closed} />}
      {!closed && (meta.drops?.length ?? 0) > 0 && (
        <Card className="mt-6 p-5 print:hidden" data-testid="drops">
          <h2 className="mb-2 font-medium">Güvenli kasaya aktarılan</h2>
          <ul className="divide-y divide-line text-sm">
            {meta.drops!.map((d) => (
              <li key={d.id} className="flex justify-between py-1.5"><span>{new Date(d.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span><span className="tabular-nums">-{formatReceipt(d.amount, meta.device?.currency)}</span></li>
            ))}
          </ul>
        </Card>
      )}
      {!closed && data && (
        <Card className="mt-6 p-5 print:hidden">
          <KapanisForm onClose={onClose} currency={meta.device?.currency} expected={data?.shift.expectedCash ?? data?.summary.expectedCash} />
        </Card>
      )}
    </main>
  );
}

export function KasaApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [startupError, setStartupError] = useState(false);
  const [signedIn, setCashier] = useState<Cashier | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [prints, setPrints] = useState<Record<string, PrintState>>({});
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const sync = useRef<ReturnType<typeof createSync> | null>(null);
  const agentCfg = meta?.agent ?? null;

  // A view switch unmounts the activated control. Move keyboard focus into the new screen,
  // but preserve an intentional autofocus target such as the sale search field.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const content = document.getElementById("kasa-content");
      if (content && !content.contains(document.activeElement)) content.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [view, meta?.shift?.id]);

  // Ajan durumu: tanımlıysa 30 sn'de bir (ve yazdırmadan sonra) sorulur.
  const refreshAgent = useCallback(() => { if (agentCfg) void agentStatus(agentCfg).then(setAgent); }, [agentCfg]);
  useEffect(() => {
    if (!agentCfg) return;
    let live = true;
    const tick = () => void agentStatus(agentCfg).then((s) => { if (live) setAgent(s); });
    tick();
    const t = setInterval(tick, 30_000);
    return () => { live = false; clearInterval(t); };
  }, [agentCfg]);

  const [courierJobs, setCourierJobs] = useState<Record<string, CourierJobView>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/kasa/courier", { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (!r.ok || !alive) return;
        const j = (await r.json()) as { jobs?: CourierJobView[] };
        const map: Record<string, CourierJobView> = {};
        for (const job of j.jobs ?? []) map[job.tabId] = job;
        if (alive) setCourierJobs(map);
      } catch { /* pano yerel veriyle çalışmaya devam eder */ }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const trackPrint = useCallback(async (saleId: string, job: Promise<PrintResult> | null) => {
    if (!job) return;
    setPrints((p) => ({ ...p, [saleId]: { state: "printing" } }));
    const r = await job;
    setPrints((p) => ({ ...p, [saleId]: { state: r.ok ? "ok" : "fail", error: r.error, jobId: r.jobId } }));
    refreshAgent();
  }, [refreshAgent]);
  useEffect(() => {
    registerKasaSw();
    registerOutboxPeriodicDrain();
    void loadMeta().then(setMeta).catch(() => setStartupError(true));
    const s = createSync((st, m) => {
      setStatus(st);
      if (m) setMeta(m);
      // Çevrimdışı + kuyruk dolu: ağ dönünce SW uyandırsın.
      if (st.pending > 0 && !navigator.onLine) registerOutboxSync();
    });
    sync.current = s;
    void s.kick().catch(() => setStartupError(true));
    const offSyncNow = onSyncNow(() => s.kick());
    // Bulut→istemci itme (#27): sunucu değişim belirteci değişince hemen eşitle; EventSource kendi yeniden bağlanır.
    const es = new EventSource("/api/sync/stream");
    es.onmessage = () => s.kick();
    return () => { es.close(); offSyncNow(); s.stop(); };
  }, []);

  // Kasiyer yönetimden pasife alındıysa (katalogdan düştüyse) oturum geçersiz.
  const cashier = signedIn && meta?.catalog.staff.some((s) => s.id === signedIn.id) ? signedIn : null;

  // — M5 salon: adisyonlar, mutfak yazıcısı, hazır sesi —
  const role = meta?.device?.role ?? "kasa";
  const restoran = meta?.device?.vertical === "restoran";
  const kick = useCallback(() => void sync.current?.kick(), []);
  const tabsApi = useTabs(Boolean(restoran), kick, meta?.agent ?? meta?.lan);
  useOrderAlert(tabsApi.tabs, tabsApi.loaded, Boolean(restoran) && role === "kasa");
  const now = useNow();
  const printingRef = useRef(new Map<string, number>()); // bilet → bir sonraki deneme zamanı
  const [directPrint, setDirectPrint] = useKasaSetting(DIRECT_PRINT_KEY, ALERT_VALUES, "kapali");
  // Chrome kasa kısayolu ?dogrudan=1 ile açar → bu cihazda doğrudan yazdırma kendiliğinden açılır.
  useEffect(() => { if (new URLSearchParams(location.search).get("dogrudan") === "1" && directPrint !== "acik") setDirectPrint("acik"); }, [directPrint, setDirectPrint]);
  useEffect(() => {
    const a = meta?.agent;
    // Ajan yoksa ve bu kasa "doğrudan yazdır" (Chrome kısayolu) ile açıldıysa: tüm istasyon fişleri varsayılan yazıcıya.
    const browser = !a && directPrint === "acik";
    if ((!a && !browser) || !restoran || role !== "kasa" || !meta) return;
    const stations = meta.catalog.stations ?? [];
    const jobs = pendingPrints(tabsApi.tabs.values(), (sid) => (browser ? "tarayici" : stations.find((s) => s.id === sid)?.printer ?? null), Date.now())
      .filter((j) => (printingRef.current.get(j.ticket.id) ?? 0) <= Date.now());
    for (const j of jobs) {
      printingRef.current.set(j.ticket.id, Date.now() + 30_000);
      const data = {
        tableName: tabLabel(j.tab, meta.catalog.tables ?? [], PLATFORM_NAMES),
        packed: j.tab.kind !== "masa",
        buzz: j.tab.kind === "platform" || Boolean(j.tab.order?.source),
        stationName: stations.find((s) => s.id === j.ticket.stationId)?.name ?? null,
        staffName: meta.catalog.staff.find((s) => s.id === j.ticket.staffId)?.name ?? null,
        at: j.ticket.at,
        lines: j.ticket.lineIds.flatMap((id) => j.tab.lines.filter((l) => l.lineId === id && !l.voided)),
        order: j.tab.order ? { no: j.tab.order.source?.externalId ?? null, name: j.tab.order.name, phone: j.tab.order.phone, address: j.tab.order.address, directions: j.tab.order.directions, note: j.tab.order.note, pay: j.tab.order.payIntent, total: j.tab.total } : null,
      };
      const markPrinted = () => void tabsApi.add([{ tabId: j.tab.id, tableId: j.tab.tableId, staffId: null, ev: { type: "printed", ticketId: j.ticket.id } }]);
      if (browser) { void printHtml(kitchenTicketHtml(data)).then(markPrinted); continue; }
      const job = printKitchen(a!, j.printer, data);
      void job?.then((r) => { if (r.ok) markPrinted(); });
    }
  }, [tabsApi, meta, restoran, role, now, directPrint]);
  const readyCount = useMemo(() => [...openTabsByTable(tabsApi.tabs).values()].flat().reduce((a, t) => a + t.tickets.filter((k) => k.status === "hazir").length, 0), [tabsApi.tabs]);
  const lastReady = useRef<number | null>(null);
  useEffect(() => {
    if (!tabsApi.loaded) { lastReady.current = null; return; }
    if (lastReady.current !== null && restoran && role !== "mutfak" && role !== "kurye" && readyCount > lastReady.current) beep();
    lastReady.current = readyCount;
  }, [readyCount, restoran, role, tabsApi.loaded]);

  // Donanım satışı beklemez: fiş (+ nakitte çekmece) arka planda.
  // M8: e-Arşiv satışında fiş en çok 3 sn bekler (eşitle + kes) → numara/ETTN basılır; olmazsa bağlantı/e-posta notu.
  const afterSale = useCallback(async (sale: LocalSale) => {
    const m = await loadMeta();
    setMeta(m);
    const pushed = sync.current?.kick();
    const cash = sale.payments.some((p) => p.method === "nakit");
    // e-Arşivde çekmece fişi beklemez (hemen açılır), fiş kesimden sonra basılır.
    if (cash && m.agent?.drawer && (sale.fiscal || !m.agent.autoPrint)) void openDrawer(m.agent);
    const print = (s: LocalSale) => { if (m.agent?.autoPrint) void trackPrint(s.id, printSale(m, s, cash && !s.fiscal)); };
    if (sale.fiscal) void issueFiscal(sale, pushed).then(print);
    else print(sale);
    return { ok: true as const, saleId: sale.id, receiptNo: sale.receiptNo, change: sale.change };
  }, [trackPrint]);

  const onSale: OnSale = useCallback(async (saleId, payments, cart, buyer, tip, extras) => {
    const r = await recordSaleLocal(cashier!, cart, payments, saleId, undefined, buyer, tip, extras);
    return r.ok ? afterSale(r.sale) : r;
  }, [cashier, afterSale]);

  const onTabPay = useCallback(async (tab: TabState, part: PayLine[], saleId: string, payments: Payment[], buyer: Buyer | null, tip: number, extras?: SaleExtrasInput) => {
    const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
    const r = await recordSaleLocal(cashier!, part, payments, saleId, { tabId: tab.id, tableId: tab.tableId, tableName, paidLines: paidLinesOf(part), kind: tab.kind }, buyer, tip, extras);
    if (!r.ok) return r;
    await tabsApi.reload();
    return afterSale(r.sale);
  }, [cashier, afterSale, tabsApi, meta]);

  // M6 platform: "Kuryeye verildi" → handover + kalan tutar online satış (ödeme platformda alındı).
  const onHandover = useCallback(async (tab: TabState) => {
    if (!cashier) throw new Error("Kasiyer oturumu gerekli.");
    const part = payableLines(tab);
    if (part.length) {
      const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
      const r = await recordSaleLocal(cashier, part, [{ method: "online", amount: totals(part).total }], tab.id, { tabId: tab.id, tableId: null, tableName, paidLines: paidLinesOf(part), kind: tab.kind });
      if (!r.ok) throw new Error(r.error);
      void afterSale(r.sale);
    }
    await tabsApi.add([{ tabId: tab.id, tableId: null, staffId: cashier.id, ev: { type: "handover" } }]);
    await tabsApi.reload();
  }, [cashier, tabsApi, meta, afterSale]);

  // M6 kurye: "Teslim ettim" → delivered + kalan tutar seçilen yöntemle satış (kuryenin vardiyasına).
  const onDeliver = useCallback(async (tab: TabState, method: DeliveryMethod, payments?: Payment[]) => {
    if (!cashier) throw new Error("Kurye oturumu gerekli.");
    const part = payableLines(tab);
    let actualMethod = method;
    if (part.length) {
      if (method === "karma" && !payments?.length) throw new Error("Tahsilat tutarlarını girin.");
      const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
      const sale = await recordSaleLocal(cashier, part, payments ?? [{ method: method as Exclude<DeliveryMethod, "karma">, amount: totals(part).total }], tab.id, { tabId: tab.id, tableId: null, tableName, paidLines: paidLinesOf(part), kind: tab.kind });
      if (!sale.ok) throw new Error(sale.error);
      actualMethod = deliveryPaymentMethod(sale.sale.payments);
    }
    await tabsApi.add([{ tabId: tab.id, tableId: null, staffId: cashier.id, ev: { type: "delivered", method: actualMethod } }]);
    await tabsApi.reload();
    void sync.current?.kick();
  }, [cashier, tabsApi, meta]);

  // Kurye telefonunda vardiya yoksa açılış nakdi 0 ile kendiliğinden açılır.
  useEffect(() => {
    if (role !== "kurye" || !cashier || !meta || meta.shift || !staffCan(meta.catalog.staff.find(s=>s.id===cashier.id),"shift")) return;
    void openShiftLocal(cashier.id, 0).then((m) => { setMeta(m); void sync.current?.kick(); });
  }, [role, cashier, meta]);

  // M6 paket fişi: paket ilk kez mutfağa gidince / platform siparişi kabul edilince kasa yazıcısından bir kez.
  // Basılanlar localStorage'da (bu cihaz); hata → 60 sn sonra yeniden.
  const slipRef = useRef(new Map<string, number>());
  useEffect(() => {
    if (!meta?.agent || !restoran || role !== "kasa") return;
    let done: string[] = [];
    try { done = JSON.parse(localStorage.getItem("cabukpos-slips") ?? "[]"); } catch { /* yok */ }
    const since = Date.now() - 12 * 3600_000;
    for (const t of tabsApi.tabs.values()) {
      if (t.kind === "masa" || t.closed || !t.order || Date.parse(t.openedAt) < since || done.includes(t.id)) continue;
      if (t.kind === "paket" ? t.tickets.length === 0 : !t.delivery.acceptedAt) continue;
      if ((slipRef.current.get(t.id) ?? 0) > Date.now()) continue;
      slipRef.current.set(t.id, Date.now() + 60_000);
      const zone = meta.catalog.deliveryZones?.find((z) => z.id === t.order!.zoneId);
      const job = printDeliverySlip(meta, {
        title: tabLabel(t, meta.catalog.tables ?? [], PLATFORM_NAMES), at: new Date().toISOString(), order: t.order, zoneName: zone?.name ?? null, total: t.total,
        lines: t.lines.filter((l) => !l.voided && !l.comped).map((l) => ({ qtyMilli: l.qtyMilli, name: l.name, unitPrice: l.unitPrice, note: l.note, options: l.options })),
      });
      if (!job) return;
      void job.then((r) => {
        if (!r.ok) return refreshAgent();
        try {
          const cur: string[] = JSON.parse(localStorage.getItem("cabukpos-slips") ?? "[]");
          localStorage.setItem("cabukpos-slips", JSON.stringify([...cur, t.id].slice(-300)));
        } catch { /* yok */ }
      });
    }
  }, [tabsApi.tabs, meta, restoran, role, refreshAgent]);

  const retry = useCallback((saleId: string) => {
    const job = prints[saleId]?.jobId;
    if (meta?.agent && job) void trackPrint(saleId, retryPrint(meta.agent, job));
    else void kasaDb().sales.get(saleId).then((s) => { if (s && meta) void trackPrint(saleId, printSale(meta, s)); });
  }, [prints, meta, trackPrint]);

  if ((!meta || !status) && startupError) {
    return <Center logo title="Kasa açılamadı" sub="Bu cihazdaki kasa verisi açılamadı. Tarayıcı depolama iznini kontrol edin ve yeniden deneyin." card focusTitle>
      <Button variant="primary" className="min-h-12 w-full" onClick={() => window.location.reload()}>Yeniden dene</Button>
    </Center>;
  }
  if (!meta || !status) return <Center title="Kasa açılıyor…" />;
  if (!meta.device) {
    if (status.syncing) return <Center title="Kasa açılıyor…" />;
    return (
      <Center logo title="Bu kasayı tanımla" sub={status.online ? "İlk girişte kendi PIN’ini belirleyerek bu tarayıcıyı kasaya bağla. Başka bir cihaz için eşleme kodu da kullanabilirsin." : "İlk tanımlama için internet bağlantısı gerekir."} card>
        <div className="space-y-3">
          <Link href="/kasa/kurulum" className="press inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-brand-action px-4 text-[15px] font-semibold text-white shadow-rest outline-none hover:bg-brand-action-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kendi kasamı kur ve PIN belirle</Link>
          <Link href="/kasa/eslestir" className="flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm text-brand">Eşleme koduyla bağla</Link>
          <p className="text-center text-xs text-muted">Yönetim → Cihazlar → Kasa ekle</p>
        </div>
      </Center>
    );
  }
  if (status.unpaired && status.pending > 0) {
    return <Center title="Cihaz eşlemesi kaldırıldı" sub={`${status.pending} satış buluta gönderilemedi. Yöneticinize başvurun; bu tarayıcıyı kapatmayın.`} />;
  }

  const d = meta.device;
  const atHome = view.name === "home" || view.name === "sale" || view.name === "paket";
  const drawerBy = async (approvedBy: string | null) => {
    if (!cashier || !meta.agent) return;
    await recordAuditLocal(cashier.id, approvedBy, "cekmece");
    void sync.current?.kick();
    setView({ name: "home" });
    if (!(await openDrawer(meta.agent))) refreshAgent();
  };
  const bar = (nav?: React.ReactNode) => (
    <Bar tenant={d.tenantName} device={d.name} nav={nav}>
      <InstallButton />
      <SyncBadge s={status} />
      {status.reset && (
        <>
          <span className="sr-only" role="status" aria-live="polite">{status.reset.pending} bekleyen belge reddedildi listesine taşındı.</span>
          <button
            type="button"
            data-testid="reset-notice"
            title={`${status.reset.reason} — "Anladım" ile kapatın.`}
            onClick={() => { void clearResetNotice(); setStatus({ ...status, reset: null }); }}
            className="inline-flex min-h-12 items-center rounded-xl bg-bad-soft px-3 text-xs font-medium text-bad outline-none hover:bg-bad-soft/80 focus-visible:ring-4 focus-visible:ring-bad/20"
          >
            {status.reset.pending} bekleyen belge reddedildi listesine taşındı
          </button>
        </>
      )}
      <AgentBadge s={agentCfg ? agent : null} />
      {restoran && tabsApi.link === "lan" && <span data-testid="link-lan" className="text-xs font-medium text-info">Yerel ağ (internet yok)</span>}
      {status.rejected > 0 && <span role="status" className="inline-flex h-7 items-center rounded-full bg-bad-soft px-2.5 text-xs font-medium text-bad">{status.rejected} belge reddedildi</span>}
      {cashier && meta.agent?.drawer && atHome && (
        <Button variant="secondary" title="Çekmece" className="min-h-12" onClick={() => {
          if (staffCan(meta.catalog.staff.find((x) => x.id === cashier.id),"drawer")) void drawerBy(null);
          else setView({ name: "cekmece" });
          }}><Inbox aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Çekmece</span></Button>
      )}
      {cashier && meta.shift && atHome && <Button variant="secondary" title="İade" className="min-h-12" onClick={() => setView({ name: "iade" })}><Undo2 aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">İade</span></Button>}
      {cashier && meta.shift && atHome && <Button variant="secondary" title="Güvenli kasaya aktar" data-testid="safe-drop-btn" className="min-h-12" onClick={() => setView({ name: "safe-drop" })}><Landmark aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Para aktar</span></Button>}
      {cashier && meta.shift && atHome && <Button variant="secondary" title="Gün sonu" className="min-h-12" onClick={() => setView({ name: "gun-sonu" })}><ClipboardCheck aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Gün sonu</span></Button>}
      {cashier && (
        <span className="flex min-h-12 items-center gap-1 rounded-full border border-line bg-surface pl-1 shadow-card">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{cashier.name.trim().charAt(0).toLocaleUpperCase("tr")}</span>
          <span className="max-w-32 truncate px-1 text-sm font-medium text-ink" title={cashier.name}>{cashier.name}</span>
          <button type="button" title="Kasiyer değiştir" aria-label="Kasiyer değiştir" onClick={() => { setCashier(null); setView({ name: "home" }); }} className="press flex h-full items-center gap-1.5 rounded-r-full border-l border-line px-3 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60"><LogOut aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Kasiyer değiştir</span></button>
        </span>
      )}
    </Bar>
  );
  const header = bar();

  if (restoran && role === "mutfak") {
    return (
      <>
        <Bar tenant={d.tenantName} device={`${d.name} · Mutfak`}><LinkNote link={tabsApi.link} /><SyncBadge s={status} /></Bar>
        <KitchenScreen meta={meta} tabs={tabsApi.tabs} now={now} add={tabsApi.add} loaded={tabsApi.loaded} />
      </>
    );
  }
  if (meta.catalog.staff.length === 0) {
    return (
      <Center logo title="İlk kasa PIN’inizi belirleyin" sub="PIN’inizi seçip ilk kasa kullanıcınızı oluşturun. Daha sonra Personel ekranından değiştirebilirsiniz." card>
        <Link href="/kasa/kurulum" className="press inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-brand-action px-4 text-[15px] font-semibold text-white shadow-rest outline-none hover:bg-brand-action-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kasa PIN’imi belirle</Link>
      </Center>
    );
  }
  if (view.name === "closed") {
    return <>{header}<GunSonu meta={meta} closed onClose={async () => {}} onBack={() => setView({ name: "home" })} /></>;
  }
  if (!cashier) {
    return <>{header}<Center logo title={d.tenantName} sub={`${d.name} · PIN ile girin`}><PinPad meta={meta} onMeta={setMeta} onOk={setCashier} only={role === "kurye" ? (x) => x.role === "kurye" : undefined} autoFocusFirst /><Link href="/kasa/kurulum" className="mt-4 inline-flex min-h-11 items-center justify-center text-sm text-brand underline">İlk kullanım: PIN belirle / PIN’imi değiştir</Link><Link href="/kasa/devam" className="mt-2 inline-flex min-h-11 items-center justify-center text-sm text-brand underline">Personel giriş / çıkış</Link></Center></>;
  }
  if (restoran && role === "kurye") {
    if (!meta.shift && !staffCan(meta.catalog.staff.find(s=>s.id===cashier.id),"shift")) return <Center title="Vardiya açma yetkisi yok" sub="İşletme yöneticisi Personel ekranından bu izni düzenleyebilir."><Button onClick={()=>setCashier(null)}>Giriş ekranına dön</Button></Center>;
    const kHeader = (
      <Bar tenant={d.tenantName} device={cashier.name}>
        <LinkNote link={tabsApi.link} /><SyncBadge s={status} />
        {view.name === "home" && <Button variant="ghost" className="min-h-12" onClick={() => setCashier(null)}><LogOut aria-hidden className="size-4" />Çıkış</Button>}
      </Bar>
    );
    if (view.name === "kurye-kapat") {
      return <>{kHeader}<Center title="Hesap kapat" sub="Kasiyer ya da müdür PIN'i · internet bağlantısı gerekir"><PinPad meta={meta} onMeta={setMeta} only={(x) => x.role === "kasiyer" || x.role === "mudur"} serverPurpose="courier-close" onOk={(c) => setView({ name: "kurye-gun-sonu", by: c.id })} autoFocusFirst />
        <Button variant="ghost" onClick={() => setView({ name: "home" })} className="mt-4 min-h-12 w-full">Vazgeç</Button></Center></>;
    }
    if (view.name === "kurye-gun-sonu" && meta.shift) {
      const by = view.by;
      return <>{kHeader}<GunSonu meta={meta} closed={false} onBack={() => setView({ name: "home" })} onClose={async (counted) => {
        setMeta(await closeShiftGuarded(by, counted));
        setCashier(null);
        setView({ name: "closed" });
        void sync.current?.kick();
      }} /></>;
    }
    if (!meta.shift) return <>{kHeader}<Center title="Vardiya açılıyor…" /></>;
    return <>{kHeader}<CourierScreen meta={meta} courier={cashier} tabs={tabsApi.tabs} tabsLoaded={tabsApi.loaded} now={now} add={tabsApi.add} onDeliver={onDeliver} onCloseShift={() => setView({ name: "kurye-kapat" })} /></>;
  }
  if (view.name === "receipt") return <Receipt meta={meta} sale={view.sale} onBack={() => setView({ name: "home" })} onPrinted={(r) => { setPrints((p) => ({ ...p, [view.sale.id]: { state: r.ok ? "ok" : "fail", error: r.error, jobId: r.jobId } })); refreshAgent(); }} />;
  if (view.name === "cekmece") {
    return (
      <>
        {header}
        <Center title="Müdür onayı" sub="Çekmeceyi açmak için müdür PIN'i girsin.">
          <PinPad meta={meta} onMeta={setMeta} only={(x) => staffCan(x,"drawer")} onOk={(m) => drawerBy(m.id)} autoFocusFirst />
          <Button variant="ghost" onClick={() => setView({ name: "home" })} className="mt-6 min-h-12 w-full">Vazgeç</Button>
        </Center>
      </>
    );
  }
  if (view.name === "safe-drop" && meta.shift) {
    const drops = meta.drops ?? [];
    return (
      <>
        {header}
        <Center title="Güvenli kasaya para aktar" sub="Kasadaki fazla nakdi güvenli kasaya aktarın. Tutar beklenen kasa hesabından düşer ve gün sonunda ayrı satır olarak görünür.">
          {drops.length > 0 && (
            <ul className="mb-4 w-full divide-y divide-line rounded-[10px] border border-line px-4 text-sm">
              {drops.map((d) => <li key={d.id} className="flex justify-between py-1.5"><span>{new Date(d.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span><span className="tabular-nums">-{formatReceipt(d.amount, meta.device?.currency)}</span></li>)}
            </ul>
          )}
          <MoneyForm label={`Aktarılacak tutar (${currencyUnit(meta.device?.currency)})`} currency={meta.device?.currency} positive submit="Parayı aktar" pendingMessage="Para güvenli kasaya aktarılıyor ve kaydediliyor." onSubmit={async (k) => { const m2 = await safeDropLocal(cashier.id, k); if (!m2) throw new Error("Açık vardiya bulunamadı. Kasa durumunu yenileyip tekrar deneyin."); setMeta(m2); setView({ name: "gun-sonu" }); }} />
          <Button variant="ghost" onClick={() => setView({ name: "home" })} className="mt-6 min-h-12 w-full">Vazgeç</Button>
        </Center>
      </>
    );
  }
  const staffRole = meta.catalog.staff.find((x) => x.id === cashier.id)?.role ?? "kasiyer";
  const waiter = { ...cashier, role: staffRole };
  const tables = meta.catalog.tables ?? [];
  const salonView = () => {
    if (view.name === "tab") {
      const table = tables.find((t) => t.id === view.tableId);
      if (!table) return null;
      return <TabScreen key={table.id} meta={meta} onMeta={setMeta} table={table} title={table.name} tabs={openTabsByTable(tabsApi.tabs).get(table.id) ?? []} allTabs={tabsApi.tabs} waiter={waiter} canPay={role === "kasa" && Boolean(meta.shift)} add={tabsApi.add} now={now}
        onBill={(tabId) => setView({ name: "bill", tabId })} onBack={() => setView({ name: "home" })} />;
    }
    if (view.name === "bill") {
      const tab = tabsApi.tabs.get(view.tabId);
      if (!tab) return null;
      return <BillScreen tab={tab} tableName={tables.find((t) => t.id === tab.tableId)?.name ?? ""} currency={d.currency} onPay={(part, id, p, b, tip, ex) => onTabPay(tab, part, id, p, b, tip, ex)}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }} onBack={() => setView(tab.closed || !tab.tableId ? { name: "home" } : { name: "tab", tableId: tab.tableId })} />;
    }
    return <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} tabsLoaded={tabsApi.loaded} now={now} currency={d.currency} onOpen={(tableId) => setView({ name: "tab", tableId })} />;
  };
  // Masa tanımlı değilse restoran kasası da doğrudan hızlı satışta açılır. Paket sekmesi restoran kasasında hep var (M6).
  const hasSalon = restoran && tables.length > 0;
  const hasPaket = restoran && role === "kasa";
  const billTab = view.name === "bill" ? tabsApi.tabs.get(view.tabId) : undefined;
  const inPaket = view.name === "paket" || view.name === "yeni-paket" || view.name === "ptab" || Boolean(billTab && billTab.kind !== "masa");
  const section = view.name === "bugun" ? "bugun" : inPaket ? "paket" : view.name === "sale" || !hasSalon ? "sale" : "salon";
  const icon = "size-4";
  const openSalon = [...openTabsByTable(tabsApi.tabs).values()].flat().filter((t) => !t.closed).length;
  const waitingPaket = [...tabsApi.tabs.values()].filter((t) => !t.closed && t.kind === "platform" && deliveryStatus(t) === "onay_bekliyor").length;
  const kasaTabs = role === "kasa" && (
    <nav aria-label="Kasa bölümü" className="min-w-0 max-w-full">
      <Segmented size="lg" items={[
        ...(hasSalon ? [{ key: "salon", label: <><LayoutGrid aria-hidden className={icon} />Salon{openSalon > 0 && <span aria-label={`${openSalon} açık adisyon`} className="tabular rounded-full bg-brand-soft px-1.5 text-xs font-bold text-brand">{openSalon}</span>}</>, pressed: section === "salon", onClick: () => setView({ name: "home" }) }] : []),
        ...(hasPaket ? [{ key: "paket", label: <><Bike aria-hidden className={icon} />Paket{waitingPaket > 0 && <span aria-label={`${waitingPaket} onay bekliyor`} className="tabular rounded-full bg-warn-soft px-1.5 text-xs font-bold text-warn">{waitingPaket}</span>}</>, pressed: section === "paket", onClick: () => setView({ name: "paket" }) }] : []),
        { key: "sale", label: <><Zap aria-hidden className={icon} />Hızlı satış</>, pressed: section === "sale", onClick: () => setView({ name: "sale" }) },
        { key: "bugun", label: <><LayoutDashboard aria-hidden className={icon} />Bugün</>, pressed: section === "bugun", onClick: () => setView({ name: "bugun" }) },
      ]} />
    </nav>
  );
  const paketView = () => {
    if (view.name === "yeni-paket") return <NewDelivery meta={meta} staffId={cashier.id} add={tabsApi.add} onCreated={(tabId) => setView({ name: "ptab", tabId })} onBack={() => setView({ name: "paket" })} />;
    if (view.name === "ptab") {
      const tab = tabsApi.tabs.get(view.tabId);
      if (!tab || tab.closed) return null;
      return <TabScreen key={tab.id} meta={meta} onMeta={setMeta} table={null} title={tabLabel(tab, tables, PLATFORM_NAMES)} tabs={[tab]} allTabs={tabsApi.tabs} waiter={waiter} canPay={tab.kind === "paket" && !tab.delivery.courierId} add={tabsApi.add} now={now}
        onBill={(tabId) => setView({ name: "bill", tabId })} onBack={() => setView({ name: "paket" })} />;
    }
    if (view.name === "bill") {
      const tab = tabsApi.tabs.get(view.tabId);
      if (!tab) return null;
      return <BillScreen tab={tab} tableName={tabLabel(tab, tables, PLATFORM_NAMES)} currency={d.currency} onPay={(part, id, p, b, tip, ex) => onTabPay(tab, part, id, p, b, tip, ex)}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }} onBack={() => setView(tab.closed || deliveryStatus(tab) === "teslim" ? { name: "paket" } : { name: "ptab", tabId: tab.id })} />;
    }
    return null;
  };
  if (restoran && role === "garson") return <>{header}{salonView() ?? <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} tabsLoaded={tabsApi.loaded} now={now} currency={d.currency} onOpen={(tableId) => setView({ name: "tab", tableId })} />}</>;
  if (!meta.shift) {
    return (
      <>
        {header}
        <Center card title="Vardiya kapalı" sub="Satışa başlamak için kasadaki nakdi girip vardiyayı açın.">
          {d.billing && <p data-testid="kasa-billing" className="mb-4 rounded-[10px] bg-warn-soft px-3 py-2 text-sm text-warn">{d.billing.state === "deneme" || d.billing.state === "aktif" ? `Abonelik ${d.billing.daysLeft} gün sonra bitiyor.` : "Abonelik sona erdi. Satış devam eder; yöneticinize haber verin."}</p>}
          <MoneyForm label={`Kasadaki açılış nakdi (${currencyUnit(d.currency)})`} currency={d.currency} submit="Vardiyayı aç" pendingMessage="Vardiya açılıyor, lütfen bekleyin." defaultValue="0" onSubmit={async (k) => { setMeta(await openShiftLocal(cashier.id, k)); void sync.current?.kick(); }} />
        </Center>
      </>
    );
  }
  if (view.name === "iade") {
    return <>{header}<RefundScreen meta={meta} cashier={cashier} online={status.online} onMeta={setMeta} onBack={() => setView({ name: "home" })} onDone={async (sale) => { setMeta(await loadMeta()); void sync.current?.kick(); setView({ name: "receipt", sale }); }} /></>;
  }
  if (view.name === "gun-sonu") {
    return (
      <>
        {header}
        <GunSonu
          meta={meta}
          closed={false}
          onBack={() => setView({ name: "home" })}
          onClose={async (counted) => {
            setMeta(await closeShiftGuarded(cashier.id, counted));
            setCashier(null);
            setView({ name: "closed" });
            void sync.current?.kick();
          }}
        />
      </>
    );
  }
  if (view.name === "bugun") {
    return (
      <>
        {bar(kasaTabs)}
        <BugunScreen meta={meta} tabs={tabsApi.tabs} tabsLoaded={tabsApi.loaded} hasSalon={hasSalon} hasPaket={hasPaket}
          onGoSale={() => setView({ name: "sale" })} onGoSalon={() => setView({ name: "home" })} onGoPaket={() => setView({ name: "paket" })} />
      </>
    );
  }
  if (inPaket) {
    return (
      <>
        {bar(kasaTabs)}
        {paketView() ?? <DeliveryBoard meta={meta} onMeta={setMeta} tabs={tabsApi.tabs} now={now} add={tabsApi.add} waiter={waiter} loaded={tabsApi.loaded}
          onNew={() => setView({ name: "yeni-paket" })} onOpen={(tabId) => setView({ name: "ptab", tabId })} onBill={(tabId) => setView({ name: "bill", tabId })} onHandover={onHandover} courierJobs={courierJobs} />}
      </>
    );
  }
  if (hasSalon && view.name !== "sale") return <>{bar(kasaTabs)}{salonView()}</>;
  return (
    <>
      {bar(kasaTabs)}
      <SaleScreen
        categories={meta.catalog.categories}
        products={meta.catalog.products}
        priceLists={meta.catalog.priceLists ?? []}
        market={d.vertical === "market"}
        onPay={onSale}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }}
        prints={prints}
        onRetryPrint={retry}
        scale={meta.agent?.scale ? () => readScale(meta.agent!) : undefined}
        onRemove={(type, lines) => { if (cashier && meta.shift) void recordRegisterEventLocal(meta.shift.id, cashier.id, type, lines).then(kick); }}
      />
    </>
  );
}
