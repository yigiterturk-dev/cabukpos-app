"use client";
// Kasa uygulaması (çevrimdışı çalışır). Veri IndexedDB'de; PIN cihazda doğrulanır; satış/vardiya giden kutusuna
// yazılır ve arka planda /api/sync ile eşitlenir. Kasiyer oturumu yalnız bellekte (sayfa yenilenince PIN yeniden).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTL, parseTL } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import { closeShiftLocal, kasaDb, loadMeta, openShiftLocal, recordAuditLocal, recordRegisterEventLocal, recordSaleLocal, setSaleFiscal, shiftSales, waitPushed } from "@/lib/offline/db";
import type { Buyer } from "@/lib/core/fiscal";
import { agentStatus, openDrawer, printDeliverySlip, printKitchen, printSale, printShift, readScale, retryPrint, withTestFlag, type AgentStatus, type PrintResult } from "@/lib/offline/agent";
import { fiscalNotes } from "@/lib/core/receipt";
import { pendingPrints } from "@/lib/core/kitchen";
import { paidLinesOf, payableLines, type PayLine } from "@/lib/core/split";
import { totals } from "@/lib/core/cart";
import { openTabsByTable, type PayIntent, type TabState, tabLabel } from "@/lib/core/tab";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import type { Payment } from "@/lib/core/payment";
import { createSync, type SyncStatus } from "@/lib/offline/sync";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { Button, Field, Input } from "@/components/ui";
import { ShiftReport, type ShiftReportData } from "@/components/ShiftReport";
import { PinPad, type Cashier } from "./PinPad";
import { RefundScreen } from "./RefundScreen";
import { SaleScreen, type OnSale, type PrintView } from "./SaleScreen";
import { registerKasaSw } from "./sw-register";
import { SalonScreen } from "./SalonScreen";
import { TabScreen } from "./TabScreen";
import { BillScreen } from "./BillScreen";
import { KitchenScreen } from "./KitchenScreen";
import { useNow, useTabs } from "./useTabs";
import { DeliveryBoard } from "./DeliveryBoard";
import { NewDelivery } from "./NewDelivery";
import { CourierScreen } from "./CourierScreen";
import { beep } from "./beep";

type View = { name: "home" } | { name: "sale" } | { name: "tab"; tableId: string } | { name: "bill"; tabId: string } | { name: "receipt"; sale: LocalSale } | { name: "gun-sonu" } | { name: "closed" } | { name: "iade" } | { name: "cekmece" }
  | { name: "paket" } | { name: "yeni-paket" } | { name: "ptab"; tabId: string } | { name: "kurye-kapat" } | { name: "kurye-gun-sonu"; by: string }; // M6
type PrintState = PrintView & { jobId?: string | null };

function Center({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-center text-sm text-muted">{sub}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </main>
  );
}

function SyncBadge({ s }: { s: SyncStatus }) {
  const online = s.online && !s.unpaired;
  return (
    <span data-testid="sync-status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      <span className={`size-2 rounded-full ${online ? "bg-emerald-600" : "bg-amber-500"}`} />
      {online ? "Çevrimiçi" : "Çevrimdışı"}
      {s.pending > 0 && <span data-testid="sync-pending"> · {s.pending} bekleyen</span>}
    </span>
  );
}

function AgentBadge({ s }: { s: AgentStatus | null }) {
  if (!s) return null;
  const bad = !s.reachable || s.printers.some((p) => p.ok === false) || s.failed.length > 0;
  const text = !s.reachable ? "Ajan kapalı" : s.printers.length === 0 ? "Yazıcı tanımlı değil" : bad ? `Yazıcı hatası${s.failed.length ? ` · ${s.failed.length} fiş bekliyor` : ""}` : "Yazıcı hazır";
  return (
    <span data-testid="agent-status" title={s.printers.find((p) => p.error)?.error ?? undefined} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bad ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
      <span className={`size-2 rounded-full ${bad ? "bg-red-600" : "bg-emerald-600"}`} />
      {text}
    </span>
  );
}

function MoneyForm({ label, hint, submit, onSubmit, defaultValue = "" }: { label: string; hint?: string; submit: string; defaultValue?: string; onSubmit: (k: number) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const k = parseTL(String(new FormData(e.currentTarget).get("amount") ?? ""));
        if (k === null) return setError("Tutar geçersiz (ör. 500 ya da 500,00).");
        setBusy(true);
        await onSubmit(k);
        setBusy(false);
      }}
    >
      <Field label={label} hint={hint}><Input name="amount" inputMode="decimal" defaultValue={defaultValue} className="text-lg" required /></Field>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{submit}</Button>
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
  const [msg, setMsg] = useState<string | null>(null);
  const print = async () => {
    const job = printSale(meta, sale);
    if (!job) return window.print();
    setMsg("Yazdırılıyor…");
    const r = await job;
    onPrinted(r);
    setMsg(r.ok ? "Yazıcıya gönderildi." : `Yazdırılamadı (${r.error}). Tarayıcıdan yazdırabilirsiniz.`);
  };
  const at = new Date(sale.at);
  const weighed = (id: string) => meta.catalog.products.find((p) => p.id === id)?.kind === "tartili";
  const f = withTestFlag(meta, sale).fiscal;
  const fiscal = f ? fiscalNotes(f, location.origin) : null;
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 0 } @media print { body { background: #fff } }`}</style>
      <div className="flex justify-center gap-3 border-b border-line p-3 print:hidden">
        <Button variant="ghost" onClick={() => void print()}>Yazdır</Button>
        {meta.agent && <button type="button" onClick={() => window.print()} className="inline-flex items-center px-3 text-sm underline">Tarayıcıdan yazdır</button>}
        <button type="button" onClick={onBack} className="inline-flex items-center px-3 text-sm underline">Kasaya dön</button>
      </div>
      {msg && <p className="p-2 text-center text-sm print:hidden" role="status">{msg}</p>}
      <article className="mx-auto my-4 w-[72mm] font-mono text-[12px] leading-snug print:my-0 print:p-[4mm]">
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
              <div className="flex justify-between pl-2"><span>{qty(l.qtyMilli, Boolean(l.productId && weighed(l.productId)))} × {formatTL(l.unitPrice)}</span><span>{formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span></div>
              {l.discount ? <div className="flex justify-between pl-2"><span>İndirim</span><span>-{formatTL(l.discount)}</span></div> : null}
            </div>
          ))}
        </div>
        <table className="mt-1 w-full border-t border-dashed border-ink">
          <thead><tr><th className="text-left font-normal">KDV</th><th className="text-right font-normal">Matrah</th><th className="text-right font-normal">KDV</th></tr></thead>
          <tbody>{sale.vat.map((v) => <tr key={v.rate}><td>%{v.rate}</td><td className="text-right">{formatTL(v.net)}</td><td className="text-right">{formatTL(v.vat)}</td></tr>)}</tbody>
        </table>
        <div className="mt-1 flex justify-between border-t border-dashed border-ink pt-1 text-[14px] font-bold"><span>{sale.refund ? "İADE TOPLAMI" : "TOPLAM"}</span><span>{formatTL(sale.total)}</span></div>
        <div className="mt-1">
          {sale.payments.map((p) => <div key={p.method} className="flex justify-between"><span>{sale.refund ? `İade (${payLabel(p.method)})` : payLabel(p.method)}</span><span>{formatTL(p.amount)}</span></div>)}
          {sale.change > 0 && <div className="flex justify-between"><span>Para üstü</span><span>{formatTL(sale.change)}</span></div>}
        </div>
        {fiscal && (
          <div className="mt-2 border-t border-dashed border-ink pt-1" data-testid="receipt-fiscal">
            {fiscal.title && <div className="text-center font-bold">{fiscal.title}</div>}
            {fiscal.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span>{k}</span><span className="text-right">{v}</span></div>)}
            {fiscal.notes.map((n) => <div key={n} className="break-all">{n}</div>)}
            {!fiscal.notes.some((n) => n.includes(fiscal.url)) && <a href={fiscal.url} className="block break-all underline print:no-underline">{fiscal.url}</a>}
          </div>
        )}
        {!fiscal?.title && <p className="mt-3 border-t border-dashed border-ink pt-2 text-center">Bilgi fişidir, mali değeri yoktur.</p>}
      </article>
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
    summary: summarizeShift(sh.openingCash, sales),
    openedByName: name(sh.openedBy),
    closedByName: name(c?.closedBy ?? null),
    sales: sales.map((s) => ({ id: s.id, receiptNo: s.receiptNo, createdAt: new Date(s.at), total: s.refund ? -s.total : s.total })),
  };
}

function GunSonu({ meta, closed, onClose, onBack }: { meta: Meta; closed: boolean; onClose: (counted: number) => Promise<void>; onBack: () => void }) {
  const [data, setData] = useState<ShiftReportData | null>(null);
  const shiftId = closed ? meta.lastClosed?.id : meta.shift?.id;
  useEffect(() => {
    if (!shiftId) return;
    void shiftSales(shiftId).then(async (s) => {
      const d = reportData(meta, s, closed);
      setData(d);
      // M8: kesilemeyen e-Arşiv sayısı buluttan (çevrimdışıysa gösterilmez)
      if (d && s.some((x) => x.fiscal)) {
        const n = await fetch(`/api/fiscal/shift?shiftId=${shiftId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { errors?: number } | null) => j?.errors).catch(() => undefined);
        if (n) setData({ ...d, fiscalErrors: n });
      }
    });
  }, [shiftId, meta, closed]);
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={onBack} className="text-sm underline">← Kasa</button>
        {closed && data && meta.agent && (
          <Button variant="ghost" onClick={() => {
            const sh = meta.lastClosed!;
            void printShift(meta, { deviceName: meta.device!.name, openedByName: data.openedByName, closedByName: data.closedByName, openingCash: sh.openingCash, openedAt: new Date(sh.openedAt), closedAt: new Date(sh.closedAt), countedCash: sh.countedCash, expectedCash: sh.expectedCash, summary: data.summary, fiscalErrors: data.fiscalErrors });
          }}>Fiş yazıcısına</Button>
        )}
        {closed && <Button variant="ghost" onClick={() => window.print()}>Yazdır / PDF</Button>}
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{closed ? "Vardiya kapandı" : "Gün sonu"}</h1>
      <p className="mb-5 text-sm text-muted">{meta.device?.tenantName} · {meta.device?.name}</p>
      {data && <ShiftReport data={data} showSales={closed} />}
      {!closed && (
        <div className="mt-6 print:hidden">
          <MoneyForm label="Sayılan nakit (TL)" hint="Kasadaki nakdi sayıp girin; fark beklenen kasaya göre hesaplanır." submit="Gün sonunu kapat" onSubmit={onClose} />
        </div>
      )}
    </main>
  );
}

export function KasaApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [signedIn, setCashier] = useState<Cashier | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [prints, setPrints] = useState<Record<string, PrintState>>({});
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const sync = useRef<ReturnType<typeof createSync> | null>(null);
  const agentCfg = meta?.agent ?? null;

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

  const trackPrint = useCallback(async (saleId: string, job: Promise<PrintResult> | null) => {
    if (!job) return;
    setPrints((p) => ({ ...p, [saleId]: { state: "printing" } }));
    const r = await job;
    setPrints((p) => ({ ...p, [saleId]: { state: r.ok ? "ok" : "fail", error: r.error, jobId: r.jobId } }));
    refreshAgent();
  }, [refreshAgent]);
  const router = useRouter();

  useEffect(() => {
    registerKasaSw();
    void loadMeta().then(setMeta);
    const s = createSync((st, m) => { setStatus(st); if (m) setMeta(m); });
    sync.current = s;
    void s.kick();
    return () => s.stop();
  }, []);

  // Eşleme yok/iptal ve gönderilecek belge kalmadıysa eşleme ekranına.
  useEffect(() => {
    if (status?.unpaired && status.pending === 0) router.replace("/kasa/eslestir");
  }, [status, router]);

  // Kasiyer yönetimden pasife alındıysa (katalogdan düştüyse) oturum geçersiz.
  const cashier = signedIn && meta?.catalog.staff.some((s) => s.id === signedIn.id) ? signedIn : null;

  // — M5 salon: adisyonlar, mutfak yazıcısı, hazır sesi —
  const role = meta?.device?.role ?? "kasa";
  const restoran = meta?.device?.vertical === "restoran";
  const kick = useCallback(() => void sync.current?.kick(), []);
  const tabsApi = useTabs(Boolean(restoran), kick, meta?.agent ?? meta?.lan);
  const now = useNow();
  const printingRef = useRef(new Map<string, number>()); // bilet → bir sonraki deneme zamanı
  useEffect(() => {
    const a = meta?.agent;
    if (!a || !restoran || role !== "kasa" || !meta) return;
    const stations = meta.catalog.stations ?? [];
    const jobs = pendingPrints(tabsApi.tabs.values(), (sid) => stations.find((s) => s.id === sid)?.printer ?? null, Date.now())
      .filter((j) => (printingRef.current.get(j.ticket.id) ?? 0) <= Date.now());
    for (const j of jobs) {
      printingRef.current.set(j.ticket.id, Date.now() + 30_000);
      const job = printKitchen(a, j.printer, {
        tableName: tabLabel(j.tab, meta.catalog.tables ?? [], PLATFORM_NAMES),
        packed: j.tab.kind !== "masa",
        stationName: stations.find((s) => s.id === j.ticket.stationId)?.name ?? null,
        staffName: meta.catalog.staff.find((s) => s.id === j.ticket.staffId)?.name ?? null,
        at: j.ticket.at,
        lines: j.ticket.lineIds.flatMap((id) => j.tab.lines.filter((l) => l.lineId === id && !l.voided)),
      });
      void job?.then((r) => { if (r.ok) void tabsApi.add([{ tabId: j.tab.id, tableId: j.tab.tableId, staffId: null, ev: { type: "printed", ticketId: j.ticket.id } }]); });
    }
  }, [tabsApi, meta, restoran, role, now]);
  const readyCount = useMemo(() => [...openTabsByTable(tabsApi.tabs).values()].flat().reduce((a, t) => a + t.tickets.filter((k) => k.status === "hazir").length, 0), [tabsApi.tabs]);
  const lastReady = useRef(0);
  useEffect(() => {
    if (restoran && role !== "mutfak" && readyCount > lastReady.current) beep();
    lastReady.current = readyCount;
  }, [readyCount, restoran, role]);

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

  const onSale: OnSale = useCallback(async (saleId, payments, cart, buyer) => {
    const r = await recordSaleLocal(cashier!, cart, payments, saleId, undefined, buyer);
    return r.ok ? afterSale(r.sale) : r;
  }, [cashier, afterSale]);

  const onTabPay = useCallback(async (tab: TabState, part: PayLine[], saleId: string, payments: Payment[], buyer: Buyer | null) => {
    const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
    const r = await recordSaleLocal(cashier!, part, payments, saleId, { tabId: tab.id, tableId: tab.tableId, tableName, paidLines: paidLinesOf(part), kind: tab.kind }, buyer);
    if (!r.ok) return r;
    await tabsApi.reload();
    return afterSale(r.sale);
  }, [cashier, afterSale, tabsApi, meta]);

  // M6 platform: "Kuryeye verildi" → handover + kalan tutar online satış (ödeme platformda alındı).
  const onHandover = useCallback(async (tab: TabState) => {
    if (!cashier) return;
    await tabsApi.add([{ tabId: tab.id, tableId: null, staffId: cashier.id, ev: { type: "handover" } }]);
    const part = payableLines(tab);
    if (!part.length) return;
    const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
    const r = await recordSaleLocal(cashier, part, [{ method: "online", amount: totals(part).total }], crypto.randomUUID(), { tabId: tab.id, tableId: null, tableName, paidLines: paidLinesOf(part), kind: tab.kind });
    await tabsApi.reload();
    if (r.ok) void afterSale(r.sale);
  }, [cashier, tabsApi, meta, afterSale]);

  // M6 kurye: "Teslim ettim" → delivered + kalan tutar seçilen yöntemle satış (kuryenin vardiyasına).
  const onDeliver = useCallback(async (tab: TabState, method: PayIntent) => {
    if (!cashier) return;
    await tabsApi.add([{ tabId: tab.id, tableId: null, staffId: cashier.id, ev: { type: "delivered", method } }]);
    const part = payableLines(tab);
    if (part.length) {
      const tableName = tabLabel(tab, meta?.catalog.tables ?? [], PLATFORM_NAMES);
      await recordSaleLocal(cashier, part, [{ method, amount: totals(part).total }], crypto.randomUUID(), { tabId: tab.id, tableId: null, tableName, paidLines: paidLinesOf(part), kind: tab.kind });
    }
    await tabsApi.reload();
    void sync.current?.kick();
  }, [cashier, tabsApi, meta]);

  // Kurye telefonunda vardiya yoksa açılış nakdi 0 ile kendiliğinden açılır.
  useEffect(() => {
    if (role !== "kurye" || !cashier || !meta || meta.shift) return;
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

  if (!meta || !status) return <Center title="Kasa açılıyor…" />;
  if (!meta.device) {
    if (status.syncing || status.lastOkAt === null && status.online) return <Center title="Kasa açılıyor…" />;
    return <Center title="Bağlantı gerekli" sub="Bu cihazın ilk kurulumu için internet bağlantısı gerekir. Bağlanınca kasa kendiliğinden açılır." />;
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
  const header = (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-sm print:hidden">
      <span className="font-semibold">{d.tenantName}</span>
      <span className="text-muted">{d.name}</span>
      {cashier && <span className="font-medium">{cashier.name}</span>}
      <SyncBadge s={status} />
      <AgentBadge s={agentCfg ? agent : null} />
      {restoran && tabsApi.link === "lan" && <span data-testid="link-lan" className="text-xs font-medium text-sky-700">Yerel ağ (internet yok)</span>}
      {status.rejected > 0 && <span className="text-xs font-medium text-red-700">{status.rejected} belge reddedildi</span>}
      <div className="ml-auto flex items-center gap-4">
        {cashier && meta.agent?.drawer && atHome && (
          <button type="button" className="underline" onClick={() => {
            if (meta.catalog.staff.find((x) => x.id === cashier.id)?.role === "mudur") void drawerBy(null);
            else setView({ name: "cekmece" });
          }}>Çekmece</button>
        )}
        {cashier && meta.shift && atHome && <button type="button" onClick={() => setView({ name: "iade" })} className="underline">İade</button>}
        {cashier && meta.shift && atHome && <button type="button" onClick={() => setView({ name: "gun-sonu" })} className="underline">Gün sonu</button>}
        {cashier && <button type="button" onClick={() => { setCashier(null); setView({ name: "home" }); }} className="text-muted underline">Kasiyer değiştir</button>}
      </div>
    </header>
  );

  if (restoran && role === "mutfak") {
    return (
      <>
        <header className="flex items-center gap-4 border-b border-line px-4 py-2 text-sm">
          <span className="font-semibold">{d.tenantName}</span><span className="text-muted">{d.name} · Mutfak</span>
          <SyncBadge s={status} />
          {tabsApi.link === "yok" && <span className="text-xs font-medium text-amber-700">Canlı bağlantı yok</span>}{tabsApi.link === "lan" && <span data-testid="link-lan" className="text-xs font-medium text-sky-700">Yerel ağ (internet yok)</span>}
        </header>
        <KitchenScreen meta={meta} tabs={tabsApi.tabs} now={now} add={tabsApi.add} />
      </>
    );
  }
  if (view.name === "closed") {
    return <>{header}<GunSonu meta={meta} closed onClose={async () => {}} onBack={() => setView({ name: "home" })} /></>;
  }
  if (!cashier) {
    return <>{header}<Center title={d.tenantName} sub={`${d.name} · PIN ile girin`}><PinPad meta={meta} onMeta={setMeta} onOk={setCashier} only={role === "kurye" ? (x) => x.role === "kurye" : undefined} /></Center></>;
  }
  if (restoran && role === "kurye") {
    const kHeader = (
      <header className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
        <span className="font-semibold">{d.tenantName}</span><span className="font-medium">{cashier.name}</span>
        <SyncBadge s={status} />
        {tabsApi.link === "yok" && <span className="text-xs font-medium text-amber-700">Canlı bağlantı yok</span>}{tabsApi.link === "lan" && <span data-testid="link-lan" className="text-xs font-medium text-sky-700">Yerel ağ (internet yok)</span>}
        {view.name === "home" && <button type="button" onClick={() => setCashier(null)} className="ml-auto text-muted underline">Çıkış</button>}
      </header>
    );
    if (view.name === "kurye-kapat") {
      return <>{kHeader}<Center title="Hesap kapat" sub="Kasiyer ya da müdür PIN'i"><PinPad meta={meta} onMeta={setMeta} only={(x) => x.role === "kasiyer" || x.role === "mudur"} onOk={(c) => setView({ name: "kurye-gun-sonu", by: c.id })} />
        <button type="button" onClick={() => setView({ name: "home" })} className="mt-4 text-sm underline">Vazgeç</button></Center></>;
    }
    if (view.name === "kurye-gun-sonu" && meta.shift) {
      const by = view.by;
      return <>{kHeader}<GunSonu meta={meta} closed={false} onBack={() => setView({ name: "home" })} onClose={async (counted) => {
        setMeta(await closeShiftLocal(by, counted));
        setCashier(null);
        setView({ name: "closed" });
        void sync.current?.kick();
      }} /></>;
    }
    if (!meta.shift) return <>{kHeader}<Center title="Vardiya açılıyor…" /></>;
    return <>{kHeader}<CourierScreen meta={meta} courier={cashier} tabs={tabsApi.tabs} now={now} add={tabsApi.add} onDeliver={onDeliver} onCloseShift={() => setView({ name: "kurye-kapat" })} /></>;
  }
  if (view.name === "receipt") return <Receipt meta={meta} sale={view.sale} onBack={() => setView({ name: "home" })} onPrinted={(r) => { setPrints((p) => ({ ...p, [view.sale.id]: { state: r.ok ? "ok" : "fail", error: r.error, jobId: r.jobId } })); refreshAgent(); }} />;
  if (view.name === "cekmece") {
    return (
      <>
        {header}
        <Center title="Müdür onayı" sub="Çekmeceyi açmak için müdür PIN'i girsin.">
          <PinPad meta={meta} onMeta={setMeta} only={(x) => x.role === "mudur"} onOk={(m) => void drawerBy(m.id)} />
          <button type="button" onClick={() => setView({ name: "home" })} className="mt-6 w-full text-center text-sm underline">Vazgeç</button>
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
      return <BillScreen tab={tab} tableName={tables.find((t) => t.id === tab.tableId)?.name ?? ""} onPay={(part, id, p, b) => onTabPay(tab, part, id, p, b)}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }} onBack={() => setView(tab.closed || !tab.tableId ? { name: "home" } : { name: "tab", tableId: tab.tableId })} />;
    }
    return <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} now={now} onOpen={(tableId) => setView({ name: "tab", tableId })} />;
  };
  // Masa tanımlı değilse restoran kasası da doğrudan hızlı satışta açılır. Paket sekmesi restoran kasasında hep var (M6).
  const hasSalon = restoran && tables.length > 0;
  const hasPaket = restoran && role === "kasa";
  const billTab = view.name === "bill" ? tabsApi.tabs.get(view.tabId) : undefined;
  const inPaket = view.name === "paket" || view.name === "yeni-paket" || view.name === "ptab" || Boolean(billTab && billTab.kind !== "masa");
  const section = inPaket ? "paket" : view.name === "sale" || !hasSalon ? "sale" : "salon";
  const tabBtn = (on: boolean) => `rounded-lg px-4 py-1.5 text-sm ${on ? "bg-ink text-white" : "border border-line"}`;
  const salonTabs = (hasSalon || hasPaket) && role === "kasa" && (
    <nav className="flex gap-1 border-b border-line px-4 py-2 print:hidden" aria-label="Kasa bölümü">
      {hasSalon && <button type="button" aria-pressed={section === "salon"} onClick={() => setView({ name: "home" })} className={tabBtn(section === "salon")}>Salon</button>}
      {hasPaket && <button type="button" aria-pressed={section === "paket"} onClick={() => setView({ name: "paket" })} className={tabBtn(section === "paket")}>Paket</button>}
      <button type="button" aria-pressed={section === "sale"} onClick={() => setView({ name: "sale" })} className={tabBtn(section === "sale")}>Hızlı satış</button>
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
      return <BillScreen tab={tab} tableName={tabLabel(tab, tables, PLATFORM_NAMES)} onPay={(part, id, p, b) => onTabPay(tab, part, id, p, b)}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }} onBack={() => setView(tab.closed ? { name: "paket" } : { name: "ptab", tabId: tab.id })} />;
    }
    return null;
  };
  if (restoran && role === "garson") return <>{header}{salonView() ?? <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} now={now} onOpen={(tableId) => setView({ name: "tab", tableId })} />}</>;
  if (!meta.shift) {
    return (
      <>
        {header}
        <Center title="Vardiya kapalı" sub="Satışa başlamak için kasadaki nakdi girip vardiyayı açın.">
          {d.billing && <p data-testid="kasa-billing" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{d.billing.state === "deneme" || d.billing.state === "aktif" ? `Abonelik ${d.billing.daysLeft} gün sonra bitiyor.` : "Abonelik sona erdi. Satış devam eder; yöneticinize haber verin."}</p>}
          <MoneyForm label="Kasadaki açılış nakdi (TL)" submit="Vardiyayı aç" defaultValue="0" onSubmit={async (k) => { setMeta(await openShiftLocal(cashier.id, k)); void sync.current?.kick(); }} />
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
            setMeta(await closeShiftLocal(cashier.id, counted));
            setCashier(null);
            setView({ name: "closed" });
            void sync.current?.kick();
          }}
        />
      </>
    );
  }
  if (inPaket) {
    return (
      <>
        {header}
        {salonTabs}
        {paketView() ?? <DeliveryBoard meta={meta} onMeta={setMeta} tabs={tabsApi.tabs} now={now} add={tabsApi.add} waiter={waiter}
          onNew={() => setView({ name: "yeni-paket" })} onOpen={(tabId) => setView({ name: "ptab", tabId })} onBill={(tabId) => setView({ name: "bill", tabId })} onHandover={onHandover} />}
      </>
    );
  }
  if (hasSalon && view.name !== "sale") return <>{header}{salonTabs}{salonView()}</>;
  return (
    <>
      {header}
      {salonTabs}
      <SaleScreen
        categories={meta.catalog.categories}
        products={meta.catalog.products}
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
