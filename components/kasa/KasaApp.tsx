"use client";
// Kasa uygulaması (çevrimdışı çalışır). Veri IndexedDB'de; PIN cihazda doğrulanır; satış/vardiya giden kutusuna
// yazılır ve arka planda /api/sync ile eşitlenir. Kasiyer oturumu yalnız bellekte (sayfa yenilenince PIN yeniden).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTL, parseTL } from "@/lib/core/money";
import { PAY_METHODS } from "@/lib/core/payment";
import { summarizeShift } from "@/lib/core/shift";
import { closeShiftLocal, kasaDb, loadMeta, openShiftLocal, recordSaleLocal, shiftSales } from "@/lib/offline/db";
import { createSync, type SyncStatus } from "@/lib/offline/sync";
import type { LocalSale, Meta } from "@/lib/offline/state";
import { Button, Field, Input } from "@/components/ui";
import { ShiftReport, type ShiftReportData } from "@/components/ShiftReport";
import { PinPad, type Cashier } from "./PinPad";
import { RefundScreen } from "./RefundScreen";
import { SaleScreen, type OnSale } from "./SaleScreen";
import { registerKasaSw } from "./sw-register";

type View = { name: "sale" } | { name: "receipt"; sale: LocalSale } | { name: "gun-sonu" } | { name: "closed" } | { name: "iade" };

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

function Receipt({ meta, sale, onBack }: { meta: Meta; sale: LocalSale; onBack: () => void }) {
  const d = meta.device!;
  const at = new Date(sale.at);
  const weighed = (id: string) => meta.catalog.products.find((p) => p.id === id)?.kind === "tartili";
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 0 } @media print { body { background: #fff } }`}</style>
      <div className="flex justify-center gap-3 border-b border-line p-3 print:hidden">
        <Button variant="ghost" onClick={() => window.print()}>Yazdır</Button>
        <button type="button" onClick={onBack} className="inline-flex items-center px-3 text-sm underline">Kasaya dön</button>
      </div>
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
          <div className="flex justify-between"><span>Kasiyer</span><span>{sale.staffName}</span></div>
        </div>
        <div className="mt-1 border-t border-dashed border-ink pt-1">
          {sale.lines.map((l) => (
            <div key={l.productId} className="py-0.5">
              <div>{l.name}</div>
              <div className="flex justify-between pl-2"><span>{qty(l.qtyMilli, weighed(l.productId))} × {formatTL(l.unitPrice)}</span><span>{formatTL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span></div>
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
  const [view, setView] = useState<View>({ name: "sale" });
  const sync = useRef<ReturnType<typeof createSync> | null>(null);
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

  const onSale: OnSale = useCallback(async (saleId, payments, cart) => {
    const r = await recordSaleLocal(cashier!, cart, payments, saleId);
    if (!r.ok) return r;
    setMeta(await loadMeta());
    void sync.current?.kick();
    return { ok: true, saleId, receiptNo: r.sale.receiptNo, change: r.sale.change };
  }, [cashier]);

  if (!meta || !status) return <Center title="Kasa açılıyor…" />;
  if (!meta.device) {
    if (status.syncing || status.lastOkAt === null && status.online) return <Center title="Kasa açılıyor…" />;
    return <Center title="Bağlantı gerekli" sub="Bu cihazın ilk kurulumu için internet bağlantısı gerekir. Bağlanınca kasa kendiliğinden açılır." />;
  }
  if (status.unpaired && status.pending > 0) {
    return <Center title="Cihaz eşlemesi kaldırıldı" sub={`${status.pending} satış buluta gönderilemedi. Yöneticinize başvurun; bu tarayıcıyı kapatmayın.`} />;
  }

  const d = meta.device;
  const header = (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-sm print:hidden">
      <span className="font-semibold">{d.tenantName}</span>
      <span className="text-muted">{d.name}</span>
      {cashier && <span className="font-medium">{cashier.name}</span>}
      <SyncBadge s={status} />
      {status.rejected > 0 && <span className="text-xs font-medium text-red-700">{status.rejected} belge reddedildi</span>}
      <div className="ml-auto flex items-center gap-4">
        {cashier && meta.shift && view.name === "sale" && <button type="button" onClick={() => setView({ name: "iade" })} className="underline">İade</button>}
        {cashier && meta.shift && view.name === "sale" && <button type="button" onClick={() => setView({ name: "gun-sonu" })} className="underline">Gün sonu</button>}
        {cashier && <button type="button" onClick={() => { setCashier(null); setView({ name: "sale" }); }} className="text-muted underline">Kasiyer değiştir</button>}
      </div>
    </header>
  );

  if (view.name === "closed") {
    return <>{header}<GunSonu meta={meta} closed onClose={async () => {}} onBack={() => setView({ name: "sale" })} /></>;
  }
  if (!cashier) {
    return <>{header}<Center title={d.tenantName} sub={`${d.name} · PIN ile girin`}><PinPad meta={meta} onMeta={setMeta} onOk={setCashier} /></Center></>;
  }
  if (view.name === "receipt") return <Receipt meta={meta} sale={view.sale} onBack={() => setView({ name: "sale" })} />;
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
    return <>{header}<RefundScreen meta={meta} cashier={cashier} online={status.online} onMeta={setMeta} onBack={() => setView({ name: "sale" })} onDone={async (sale) => { setMeta(await loadMeta()); void sync.current?.kick(); setView({ name: "receipt", sale }); }} /></>;
  }
  if (view.name === "gun-sonu") {
    return (
      <>
        {header}
        <GunSonu
          meta={meta}
          closed={false}
          onBack={() => setView({ name: "sale" })}
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
  return (
    <>
      {header}
      <SaleScreen
        categories={meta.catalog.categories}
        products={meta.catalog.products}
        market={d.vertical === "market"}
        onPay={onSale}
        onReceipt={async (id) => { const s = await kasaDb().sales.get(id); if (s) setView({ name: "receipt", sale: s }); }}
      />
    </>
  );
}
