"use client";
// Kasa uygulaması (çevrimdışı çalışır). Veri IndexedDB'de; PIN cihazda doğrulanır; satış/vardiya giden kutusuna
// yazılır ve arka planda /api/sync ile eşitlenir. Kasiyer oturumu yalnız bellekte (sayfa yenilenince PIN yeniden).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTL, parseTL } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import { closeShiftLocal, kasaDb, loadMeta, openShiftLocal, recordAuditLocal, recordSaleLocal, shiftSales } from "@/lib/offline/db";
import { agentStatus, openDrawer, printKitchen, printSale, printShift, readScale, retryPrint, type AgentStatus, type PrintResult } from "@/lib/offline/agent";
import { pendingPrints } from "@/lib/core/kitchen";
import { paidLinesOf, type PayLine } from "@/lib/core/split";
import { openTabsByTable, type TabState } from "@/lib/core/tab";
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

type View = { name: "home" } | { name: "sale" } | { name: "tab"; tableId: string } | { name: "bill"; tabId: string } | { name: "receipt"; sale: LocalSale } | { name: "gun-sonu" } | { name: "closed" } | { name: "iade" } | { name: "cekmece" };
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
              <div className="flex justify-between pl-2"><span>{qty(l.qtyMilli, weighed(l.productId))} × {formatTL(l.unitPrice)}</span><span>{formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span></div>
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
        <p className="mt-3 border-t border-dashed border-ink pt-2 text-center">Bilgi fişidir, mali değeri yoktur.</p>
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
    if (shiftId) void shiftSales(shiftId).then((s) => setData(reportData(meta, s, closed)));
  }, [shiftId, meta, closed]);
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={onBack} className="text-sm underline">← Kasa</button>
        {closed && data && meta.agent && (
          <Button variant="ghost" onClick={() => {
            const sh = meta.lastClosed!;
            void printShift(meta, { deviceName: meta.device!.name, openedByName: data.openedByName, closedByName: data.closedByName, openingCash: sh.openingCash, openedAt: new Date(sh.openedAt), closedAt: new Date(sh.closedAt), countedCash: sh.countedCash, expectedCash: sh.expectedCash, summary: data.summary });
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
  const tabsApi = useTabs(Boolean(restoran), kick);
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
        tableName: meta.catalog.tables?.find((t) => t.id === j.tab.tableId)?.name ?? "?",
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
  const afterSale = useCallback(async (sale: LocalSale) => {
    const m = await loadMeta();
    setMeta(m);
    void sync.current?.kick();
    const cash = sale.payments.some((p) => p.method === "nakit");
    if (m.agent?.autoPrint) void trackPrint(sale.id, printSale(m, sale, cash));
    else if (cash && m.agent?.drawer) void openDrawer(m.agent);
    return { ok: true as const, saleId: sale.id, receiptNo: sale.receiptNo, change: sale.change };
  }, [trackPrint]);

  const onSale: OnSale = useCallback(async (saleId, payments, cart) => {
    const r = await recordSaleLocal(cashier!, cart, payments, saleId);
    return r.ok ? afterSale(r.sale) : r;
  }, [cashier, afterSale]);

  const onTabPay = useCallback(async (tab: TabState, part: PayLine[], saleId: string, payments: Payment[]) => {
    const tableName = meta?.catalog.tables?.find((t) => t.id === tab.tableId)?.name ?? "";
    const r = await recordSaleLocal(cashier!, part, payments, saleId, { tabId: tab.id, tableId: tab.tableId, tableName, paidLines: paidLinesOf(part) });
    if (!r.ok) return r;
    await tabsApi.reload();
    return afterSale(r.sale);
  }, [cashier, afterSale, tabsApi, meta]);

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
  const atHome = view.name === "home" || view.name === "sale";
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
          {!tabsApi.live && <span className="text-xs font-medium text-amber-700">Canlı bağlantı yok</span>}
        </header>
        <KitchenScreen meta={meta} tabs={tabsApi.tabs} now={now} add={tabsApi.add} />
      </>
    );
  }
  if (view.name === "closed") {
    return <>{header}<GunSonu meta={meta} closed onClose={async () => {}} onBack={() => setView({ name: "home" })} /></>;
  }
  if (!cashier) {
    return <>{header}<Center title={d.tenantName} sub={`${d.name} · PIN ile girin`}><PinPad meta={meta} onMeta={setMeta} onOk={setCashier} /></Center></>;
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
      return <TabScreen key={table.id} meta={meta} onMeta={setMeta} table={table} tabs={openTabsByTable(tabsApi.tabs).get(table.id) ?? []} allTabs={tabsApi.tabs} waiter={waiter} canPay={role === "kasa" && Boolean(meta.shift)} add={tabsApi.add} now={now}
        onBill={(tabId) => setView({ name: "bill", tabId })} onBack={() => setView({ name: "home" })} />;
    }
    if (view.name === "bill") {
      const tab = tabsApi.tabs.get(view.tabId);
      if (!tab) return null;
      return <BillScreen tab={tab} tableName={tables.find((t) => t.id === tab.tableId)?.name ?? ""} onPay={(part, id, p) => onTabPay(tab, part, id, p)}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }} onBack={() => setView(tab.closed ? { name: "home" } : { name: "tab", tableId: tab.tableId })} />;
    }
    return <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} now={now} onOpen={(tableId) => setView({ name: "tab", tableId })} />;
  };
  // Masa tanımlı değilse restoran kasası da doğrudan hızlı satışta açılır.
  const hasSalon = restoran && tables.length > 0;
  const salonTabs = hasSalon && role === "kasa" && (
    <nav className="flex gap-1 border-b border-line px-4 py-2 print:hidden" aria-label="Kasa bölümü">
      <button type="button" aria-pressed={view.name !== "sale"} onClick={() => setView({ name: "home" })} className={`rounded-lg px-4 py-1.5 text-sm ${view.name !== "sale" ? "bg-ink text-white" : "border border-line"}`}>Salon</button>
      <button type="button" aria-pressed={view.name === "sale"} onClick={() => setView({ name: "sale" })} className={`rounded-lg px-4 py-1.5 text-sm ${view.name === "sale" ? "bg-ink text-white" : "border border-line"}`}>Hızlı satış</button>
    </nav>
  );
  if (restoran && role === "garson") return <>{header}{salonView() ?? <SalonScreen areas={meta.catalog.areas ?? []} tables={tables} tabs={tabsApi.tabs} now={now} onOpen={(tableId) => setView({ name: "tab", tableId })} />}</>;
  if (!meta.shift) {
    return (
      <>
        {header}
        <Center title="Vardiya kapalı" sub="Satışa başlamak için kasadaki nakdi girip vardiyayı açın.">
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
      />
    </>
  );
}

/** Hazır bildirimi: kısa iki ton (ses izni yoksa sessiz geçer). */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 1320 : 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch { /* ses yok */ }
}
