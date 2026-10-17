"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addSupplierPayment, savePurchase, saveSupplier, type PurchaseState } from "@/lib/admin/purchase-actions";
import { currencySymbol, formatMoney, parseTL, type Currency } from "@/lib/core/money";
import { parseQty, type StockUnit } from "@/lib/core/stock";
import { purchaseLineTotal } from "@/lib/core/purchase";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: PurchaseState; f: string }) => (s.field === f && s.error ? <p id={`purchase-${f}-error`} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: PurchaseState, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `purchase-${f}-error` }
  : {};

export function PurchaseForm({ products, suppliers, today, currency = "TRY" }: { products: (Option & { unit: StockUnit })[]; suppliers: Option[]; today: string; currency?: Currency }) {
  const { state, pending, onSubmit } = useFormAction(savePurchase, {} as PurchaseState);
  return <PurchaseFields key={state.savedAt ?? 0} state={state} pending={pending} onSubmit={onSubmit} products={products} suppliers={suppliers} today={today} currency={currency} />;
}

function PurchaseFields({ state, pending, onSubmit, products, suppliers, today, currency = "TRY" }: { state: PurchaseState; pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; products: (Option & { unit: StockUnit })[]; suppliers: Option[]; today: string; currency?: Currency }) {
  const formRef = useRef<HTMLFormElement>(null);
  const addRowRef = useRef<HTMLButtonElement>(null);
  const unitOf = new Map(products.map((p) => [p.value, p.unit]));
  const [rows, setRows] = useState([{ k: 0, pid: "", qty: "", price: "" }]);
  const [next, setNext] = useState(1);
  const [announcedTotal, setAnnouncedTotal] = useState("");
  const totalMounted = useRef(false);
  const set = (k: number, patch: Partial<{ pid: string; qty: string; price: string }>) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const lineTotal = (r: (typeof rows)[number]) => {
    const u = unitOf.get(r.pid);
    const q = u ? parseQty(r.qty, u) : null, c = parseTL(r.price);
    return q !== null && c !== null ? purchaseLineTotal({ qtyMilli: q, unitCost: c }) : null;
  };
  const hasIncompleteLine = rows.some((r) => Boolean(r.pid || r.qty.trim() || r.price.trim()) && lineTotal(r) === null);
  const total = hasIncompleteLine ? null : rows.reduce((s, r) => s + (lineTotal(r) ?? 0), 0);
  useEffect(() => {
    if (!totalMounted.current) {
      totalMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => setAnnouncedTotal(total === null ? "Alış toplamı henüz hesaplanamıyor; ürün, miktar ve fiyatı tamamlayın." : `Alış toplamı ${formatMoney(total, currency)}.`), 600);
    return () => window.clearTimeout(timer);
  }, [currency, total]);
  useEffect(() => {
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus());
  }, [state.error, state.savedAt]);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Field label="Tedarikçi"><Select name="supplierId" disabled={pending} options={[{ value: "", label: "Tedarikçisiz" }, ...suppliers]} defaultValue="" placeholder="Tedarikçisiz" {...errorProps(state, "supplierId")} /></Field><Err s={state} f="supplierId" /></div>
        <div><Field label="Belge no" hint="fatura / irsaliye"><Input name="docNo" disabled={pending} className="disabled:cursor-wait disabled:opacity-50" /></Field></div>
        <div><Field label="Tarih"><Input name="date" type="date" defaultValue={today} max={today} disabled={pending} required className="disabled:cursor-wait disabled:opacity-50" {...errorProps(state, "date")} /></Field><Err s={state} f="date" /></div>
      </div>
      <div className="space-y-2">
        <div className="hidden gap-2 text-xs text-muted lg:grid lg:grid-cols-[minmax(12rem,1fr)_6rem_7rem_3.5rem_6rem_auto]"><span>Ürün</span><span>Miktar</span><span>Birim fiyat (KDV dahil)</span><span>Birim</span><span className="text-right">Toplam</span><span /></div>
        {rows.map((r, rowIndex) => {
          const u = unitOf.get(r.pid), t = lineTotal(r);
          return (
            <div key={r.k} role="group" aria-label={`Alış kalemi ${rowIndex + 1}`} className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(12rem,1fr)_6rem_7rem_3.5rem_6rem_auto] lg:items-center" data-testid="purchase-row">
              <div className="col-span-2 min-w-0 lg:col-span-1"><span aria-hidden="true" className="mb-1 block text-xs text-muted lg:hidden">Ürün</span><Select ariaLabel={`Kalem ${rowIndex + 1}: ürün`} name="pid" disabled={pending} options={products} defaultValue="" placeholder="Ürün seçin" onChange={(v) => set(r.k, { pid: v })} aria-invalid={state.field === "lines" && !!state.error || undefined} aria-describedby={state.field === "lines" && state.error ? "purchase-lines-error" : undefined} /></div>
              <div className="min-w-0"><span aria-hidden="true" className="mb-1 block text-xs text-muted lg:hidden">Miktar</span><Input name="qty" inputMode={u === "adet" ? "numeric" : "decimal"} value={r.qty} onChange={(e) => set(r.k, { qty: e.target.value })} aria-label={`Kalem ${rowIndex + 1}: miktar`} disabled={pending} className="w-full disabled:cursor-wait disabled:opacity-50" aria-invalid={state.field === "lines" && !!state.error || undefined} aria-describedby={state.field === "lines" && state.error ? "purchase-lines-error" : undefined} /></div>
              <div className="min-w-0"><span aria-hidden="true" className="mb-1 block text-xs text-muted lg:hidden">Birim fiyat (KDV dahil)</span><Input name="price" inputMode="decimal" value={r.price} onChange={(e) => set(r.k, { price: e.target.value })} aria-label={`Kalem ${rowIndex + 1}: birim fiyat, KDV dahil`} disabled={pending} className="w-full disabled:cursor-wait disabled:opacity-50" aria-invalid={state.field === "lines" && !!state.error || undefined} aria-describedby={state.field === "lines" && state.error ? "purchase-lines-error" : undefined} />{u && <span aria-hidden="true" className="mt-1 block text-xs text-muted lg:hidden">{currencySymbol(currency)}/{u}</span>}</div>
              <span className="hidden text-sm text-muted lg:block">{u ? `${currencySymbol(currency)}/${u}` : ""}</span>
              <div className={`flex min-h-11 items-center justify-between gap-2 text-sm lg:block lg:text-right ${rows.length === 1 ? "col-span-2 lg:col-span-1" : ""}`}><span aria-hidden="true" className="text-xs text-muted lg:hidden">Toplam</span><span className="tabular">{t !== null ? formatMoney(t, currency) : "—"}</span></div>
              {rows.length > 1 && <button type="button" disabled={pending} onClick={() => { setRows((rs) => rs.filter((x) => x.k !== r.k)); requestAnimationFrame(() => addRowRef.current?.focus()); }} className="ml-auto grid size-11 place-items-center rounded-lg text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50 lg:ml-0" aria-label={`${rowIndex + 1}. alış kalemini sil`}>×</button>}
            </div>
          );
        })}
        <Button ref={addRowRef} type="button" variant="secondary" disabled={pending} onClick={() => { setRows((rs) => [...rs, { k: next, pid: "", qty: "", price: "" }]); setNext(next + 1); }}>+ Kalem</Button>
        <Err s={state} f="lines" />
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcedTotal}</span>
      </div>
      <Field label="Not"><Input name="note" disabled={pending} className="disabled:cursor-wait disabled:opacity-50" /></Field>
      {state.error && !["supplierId", "date", "lines"].includes(state.field ?? "") && <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {pending && <p className="sr-only" role="status" aria-live="polite">Alış kaydı oluşturuluyor. Lütfen bekleyin.</p>}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Alışı kaydet"}</Button>
        <span className="text-sm">Toplam <b className="tabular" data-testid="purchase-total">{total === null ? "Kalemleri tamamlayın" : formatMoney(total, currency)}</b></span>
        {state.savedAt && <span className="text-sm text-ok" role="status">Kaydedildi; stok ve maliyet güncellendi.</span>}
      </div>
    </form>
  );
}

export type SupplierInitial = { id: string; name: string; phone: string | null; taxNo: string | null; note: string | null };

export function SupplierForm({ initial }: { initial?: SupplierInitial }) {
  const { state, pending, onSubmit } = useFormAction(saveSupplier.bind(null, initial?.id ?? null), {} as PurchaseState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} key={initial ? initial.id : state.savedAt ?? 0} aria-busy={pending} className="grid gap-4 sm:grid-cols-2">
      <div><Field label="Ad"><Input name="name" defaultValue={initial?.name} disabled={pending} required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
      <div><Field label="Telefon"><Input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={initial?.phone ?? ""} disabled={pending} /></Field></div>
      <div><Field label="Vergi / TC no" hint="İsteğe bağlı; yalnızca 10 haneli VKN veya 11 haneli TCKN"><Input name="taxNo" inputMode="numeric" maxLength={11} pattern="[0-9]{10,11}" defaultValue={initial?.taxNo ?? ""} disabled={pending} {...errorProps(state, "taxNo")} /></Field><Err s={state} f="taxNo" /></div>
      <div><Field label="Not"><Input name="note" defaultValue={initial?.note ?? ""} disabled={pending} /></Field></div>
      {state.error && !["name", "taxNo"].includes(state.field ?? "") && <p className="max-w-full break-words text-sm text-bad sm:col-span-2" role="alert" aria-live="assertive">{state.error}</p>}
      <div className="flex items-center gap-3 sm:col-span-2">
        {pending && <span className="sr-only" role="status" aria-live="polite">Tedarikçi kaydediliyor. Lütfen bekleyin.</span>}
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Tedarikçiyi kaydet"}</Button>
        {initial && <Link href={`/yonetim/tedarikciler?id=${initial.id}`} aria-disabled={pending} tabIndex={pending ? -1 : undefined} onClick={(e) => { if (pending) e.preventDefault(); }} className={`inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-2 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${pending ? "pointer-events-none opacity-50" : ""}`}>Vazgeç</Link>}
        {state.savedAt && !initial && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

const METHODS = [["nakit", "Nakit"], ["havale", "Havale"], ["kart", "Kart"]] as const;

export function PaymentForm({ supplierId, today }: { supplierId: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(addSupplierPayment.bind(null, supplierId), {} as PurchaseState);
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("havale");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="flex flex-wrap items-end gap-3">
      <div className="w-36"><Field label="Tutar"><Input key={`a${state.savedAt ?? 0}`} name="amount" inputMode="decimal" disabled={pending} required className="disabled:cursor-wait disabled:opacity-50" {...errorProps(state, "amount")} /></Field></div>
      <div>
        <fieldset disabled={pending} aria-describedby={state.field === "method" && state.error ? "purchase-method-error" : undefined} className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-sm font-medium">Ödeme şekli</legend>
          <div className="flex gap-1">
            {METHODS.map(([v, l]) => (
              <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${method === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>
                <input type="radio" name="method" value={v} required checked={method === v} onChange={() => setMethod(v)} aria-invalid={state.field === "method" && !!state.error || undefined} aria-describedby={state.field === "method" && state.error ? "purchase-method-error" : undefined} className="peer sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="w-40"><Field label="Tarih"><Input name="date" type="date" defaultValue={today} max={today} disabled={pending} required className="disabled:cursor-wait disabled:opacity-50" {...errorProps(state, "date")} /></Field></div>
      <div className="min-w-40 flex-1"><Field label="Not"><Input key={`n${state.savedAt ?? 0}`} name="note" disabled={pending} className="disabled:cursor-wait disabled:opacity-50" /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Ödeme ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Tedarikçi ödemesi kaydediliyor. Lütfen bekleyin.</span>}
      <div className="basis-full text-sm">{state.error ? <span id={state.field ? `purchase-${state.field}-error` : undefined} className="max-w-full break-words text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt ? <span className="text-ok" role="status">Ödeme eklendi.</span> : null}</div>
    </form>
  );
}
