"use client";
import Link from "next/link";
import { useState } from "react";
import { addSupplierPayment, savePurchase, saveSupplier, type PurchaseState } from "@/lib/admin/purchase-actions";
import { formatTL, parseTL } from "@/lib/core/money";
import { parseQty, type StockUnit } from "@/lib/core/stock";
import { purchaseLineTotal } from "@/lib/core/purchase";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: PurchaseState; f: string }) => (s.field === f && s.error ? <p className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);

export function PurchaseForm({ products, suppliers, today }: { products: (Option & { unit: StockUnit })[]; suppliers: Option[]; today: string }) {
  const { state, pending, onSubmit } = useFormAction(savePurchase, {} as PurchaseState);
  return <PurchaseFields key={state.savedAt ?? 0} state={state} pending={pending} onSubmit={onSubmit} products={products} suppliers={suppliers} today={today} />;
}

function PurchaseFields({ state, pending, onSubmit, products, suppliers, today }: { state: PurchaseState; pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; products: (Option & { unit: StockUnit })[]; suppliers: Option[]; today: string }) {
  const unitOf = new Map(products.map((p) => [p.value, p.unit]));
  const [rows, setRows] = useState([{ k: 0, pid: "", qty: "", price: "" }]);
  const [next, setNext] = useState(1);
  const set = (k: number, patch: Partial<{ pid: string; qty: string; price: string }>) => setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const lineTotal = (r: (typeof rows)[number]) => {
    const u = unitOf.get(r.pid);
    const q = u ? parseQty(r.qty, u) : null, c = parseTL(r.price);
    return q !== null && c !== null ? purchaseLineTotal({ qtyMilli: q, unitCost: c }) : null;
  };
  const total = rows.reduce((s, r) => s + (lineTotal(r) ?? 0), 0);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><div className="mb-1.5 text-sm font-medium">Tedarikçi</div><Select ariaLabel="Tedarikçi" name="supplierId" options={[{ value: "", label: "Tedarikçisiz" }, ...suppliers]} defaultValue="" placeholder="Tedarikçisiz" /><Err s={state} f="supplierId" /></div>
        <div><Field label="Belge no" hint="fatura / irsaliye"><Input name="docNo" /></Field></div>
        <div><Field label="Tarih"><Input name="date" type="date" defaultValue={today} max={today} required /></Field><Err s={state} f="date" /></div>
      </div>
      <div className="space-y-2">
        <div className="hidden gap-2 text-xs text-muted lg:grid lg:grid-cols-[minmax(12rem,1fr)_6rem_7rem_3.5rem_6rem_auto]"><span>Ürün</span><span>Miktar</span><span>Birim fiyat (KDV dahil)</span><span>Birim</span><span className="text-right">Toplam</span><span /></div>
        {rows.map((r) => {
          const u = unitOf.get(r.pid), t = lineTotal(r);
          return (
            <div key={r.k} className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[minmax(12rem,1fr)_6rem_7rem_3.5rem_6rem_auto] lg:items-center" data-testid="purchase-row">
              <div className="min-w-0"><Select ariaLabel="Ürün" name="pid" options={products} defaultValue="" placeholder="Ürün seçin" onChange={(v) => set(r.k, { pid: v })} /></div>
              <Input name="qty" inputMode="decimal" value={r.qty} onChange={(e) => set(r.k, { qty: e.target.value })} aria-label="Miktar" className="w-full" />
              <Input name="price" inputMode="decimal" value={r.price} onChange={(e) => set(r.k, { price: e.target.value })} aria-label="Birim fiyat" className="w-full" />
              <span className="text-sm text-muted">{u ? `₺/${u}` : ""}</span>
              <span className="tabular text-right text-sm">{t !== null ? formatTL(t) : ""}</span>
              {rows.length > 1 && <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.k !== r.k))} className="grid size-11 place-items-center rounded-lg text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60" aria-label="Kalemi sil">×</button>}
            </div>
          );
        })}
        <Button type="button" variant="secondary" onClick={() => { setRows((rs) => [...rs, { k: next, pid: "", qty: "", price: "" }]); setNext(next + 1); }}>+ Kalem</Button>
        <Err s={state} f="lines" />
      </div>
      <Field label="Not"><Input name="note" /></Field>
      {state.error && !["supplierId", "date", "lines"].includes(state.field ?? "") && <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Alışı kaydet"}</Button>
        <span className="text-sm">Toplam <b className="tabular" data-testid="purchase-total">{formatTL(total)}</b></span>
        {state.savedAt && <span className="text-sm text-ok" role="status">Kaydedildi; stok ve maliyet güncellendi.</span>}
      </div>
    </form>
  );
}

export type SupplierInitial = { id: string; name: string; phone: string | null; taxNo: string | null; note: string | null };

export function SupplierForm({ initial }: { initial?: SupplierInitial }) {
  const { state, pending, onSubmit } = useFormAction(saveSupplier.bind(null, initial?.id ?? null), {} as PurchaseState);
  return (
    <form onSubmit={onSubmit} key={initial ? initial.id : state.savedAt ?? 0} className="grid gap-4 sm:grid-cols-2">
      <div><Field label="Ad"><Input name="name" defaultValue={initial?.name} required /></Field><Err s={state} f="name" /></div>
      <div><Field label="Telefon"><Input name="phone" inputMode="tel" defaultValue={initial?.phone ?? ""} /></Field></div>
      <div><Field label="Vergi / TC no"><Input name="taxNo" inputMode="numeric" defaultValue={initial?.taxNo ?? ""} /></Field><Err s={state} f="taxNo" /></div>
      <div><Field label="Not"><Input name="note" defaultValue={initial?.note ?? ""} /></Field></div>
      {state.error && !["name", "taxNo"].includes(state.field ?? "") && <p className="max-w-full break-words text-sm text-bad sm:col-span-2" role="alert" aria-live="assertive">{state.error}</p>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Tedarikçiyi kaydet"}</Button>
        {initial && <Link href={`/yonetim/tedarikciler?id=${initial.id}`} className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-2 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Vazgeç</Link>}
        {state.savedAt && !initial && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

const METHODS = [["nakit", "Nakit"], ["havale", "Havale"], ["kart", "Kart"]] as const;

export function PaymentForm({ supplierId, today }: { supplierId: string; today: string }) {
  const { state, pending, onSubmit } = useFormAction(addSupplierPayment.bind(null, supplierId), {} as PurchaseState);
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>("havale");
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-36"><Field label="Tutar"><Input key={`a${state.savedAt ?? 0}`} name="amount" inputMode="decimal" required /></Field></div>
      <div>
        <input type="hidden" name="method" value={method} />
        <div className="flex gap-1" role="group" aria-label="Ödeme şekli">
          {METHODS.map(([v, l]) => <button key={v} type="button" aria-pressed={method === v} onClick={() => setMethod(v)} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${method === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{l}</button>)}
        </div>
      </div>
      <div className="w-40"><Field label="Tarih"><Input name="date" type="date" defaultValue={today} max={today} required /></Field></div>
      <div className="min-w-40 flex-1"><Field label="Not"><Input key={`n${state.savedAt ?? 0}`} name="note" /></Field></div>
      <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Ödeme ekle"}</Button>
      <div className="basis-full text-sm" aria-live="polite">{state.error ? <span className="max-w-full break-words text-bad" role="alert" aria-live="assertive">{state.error}</span> : state.savedAt ? <span className="text-ok" role="status">Ödeme eklendi.</span> : null}</div>
    </form>
  );
}
