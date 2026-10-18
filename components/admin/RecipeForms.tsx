"use client";
import { useEffect, useId, useRef, useState } from "react";
import { produce, saveRecipe, type RecipeState } from "@/lib/admin/recipe-actions";
import { formatMoney, type Currency } from "@/lib/core/money";
import type { StockUnit } from "@/lib/core/stock";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

/** Malzeme seçeneği: stok birimi ve birim maliyeti (kuruş / adet|kg|lt). */
export type IngredientOption = Option & { unit: StockUnit; cost: number | null };
/** Reçete sahibi: satılan ürün (fiyat, KDV → marj), ara ürün (parti), seçenek (fiyat farkı). */
export type RecipeOwner = { productId?: string; optionId?: string; name: string; price?: number; vatRate?: number; yieldMilli?: number | null; unit?: StockUnit };

const inputUnit = (u: StockUnit) => (u === "kg" ? "g" : u === "lt" ? "ml" : "adet");
const shown = (qtyMilli: number, u: StockUnit) => (u === "adet" ? String(qtyMilli / 1000).replace(".", ",") : String(qtyMilli));
const toMilli = (s: string, u: StockUnit) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? (u === "adet" ? n * 1000 : n) : 0;
};

export function RecipeForm({ owner, ingredients, initial, currency = "TRY" }: { owner: RecipeOwner; ingredients: IngredientOption[]; initial: { ingredientId: string; qtyMilli: number }[]; currency?: Currency }) {
  const { state, pending, onSubmit } = useFormAction(saveRecipe.bind(null, { productId: owner.productId, optionId: owner.optionId }), {} as RecipeState);
  const idPrefix = useId();
  const addIngredientRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  const byId = new Map(ingredients.map((i) => [i.value, i]));
  const [rows, setRows] = useState(() => (initial.length ? initial : [{ ingredientId: "", qtyMilli: 0 }]).map((r, k) => ({ k, id: r.ingredientId, qty: r.qtyMilli ? shown(r.qtyMilli, byId.get(r.ingredientId)?.unit ?? "adet") : "" })));
  const [next, setNext] = useState(rows.length);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} as RecipeState : state;
  const itemsInvalid = displayState.field === "items" && !!displayState.error;
  const set = (k: number, patch: Partial<{ id: string; qty: string }>) => { setEdited(true); setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...patch } : r))); };

  let total = 0, missing = false;
  for (const r of rows) {
    const ing = byId.get(r.id);
    if (!ing) continue;
    if (ing.cost == null) missing = true;
    else total += (ing.cost * toMilli(r.qty, ing.unit)) / 1000;
  }
  const perUnit = owner.yieldMilli ? (total * 1000) / owner.yieldMilli : total;
  const net = owner.price != null && owner.vatRate != null ? (owner.price * 100) / (100 + owner.vatRate) : null;
  const margin = net && !missing ? ((net - perUnit) / net) * 100 : null;

  return (
    <form ref={formRef} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="space-y-3">
      <p className="text-sm text-muted">
        {owner.yieldMilli ? `Miktarlar bir parti (${owner.unit === "adet" ? owner.yieldMilli / 1000 + " adet" : `${owner.yieldMilli / 1000} ${owner.unit}`}) için.` : owner.optionId ? "Miktarlar seçenek bir kez seçildiğinde eklenen malzeme." : "Miktarlar 1 porsiyon (tartılı üründe 1 kg) için."}
      </p>
      <fieldset disabled={pending} aria-busy={pending} className="space-y-3">
      {rows.map((r, rowIndex) => {
        const ing = byId.get(r.id);
        const qtyInputUnit = ing ? inputUnit(ing.unit) : "birim";
        const qtyHint = ing ? ing.unit === "adet" ? "En çok 9.999,999 adet · en çok 3 ondalık" : `Tam sayı · en çok 999.999 ${qtyInputUnit}` : "Önce malzeme seçin.";
        const qtyHintId = `${idPrefix}-qty-hint-${r.k}`;
        return (
          <div key={r.k} className="grid min-w-0 grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,16rem)_7rem_auto_minmax(6rem,auto)_2.75rem]" data-testid="recipe-row">
            <div className="min-w-0"><Select disabled={pending} ariaLabel={`Malzeme satırı ${rowIndex + 1}`} name="ing" options={ingredients} defaultValue={r.id} placeholder="Malzeme seçin" onChange={(v) => set(r.k, { id: v })} aria-invalid={itemsInvalid || undefined} aria-describedby={itemsInvalid ? "recipe-items-error" : undefined} /></div>
            <div className="min-w-0"><Input name="qty" inputMode={ing && ing.unit !== "adet" ? "numeric" : "decimal"} maxLength={ing ? ing.unit === "adet" ? 8 : 6 : undefined} value={r.qty} onChange={(e) => set(r.k, { qty: e.target.value })} aria-label={`Malzeme satırı ${rowIndex + 1}, ${ing?.label ?? "malzeme seçilmedi"}: miktar (${qtyInputUnit})`} aria-invalid={itemsInvalid || undefined} aria-describedby={`${qtyHintId}${itemsInvalid ? " recipe-items-error" : ""}`} className="w-full" /><span id={qtyHintId} className="mt-1 block text-[10px] leading-4 text-muted">{qtyHint}</span></div>
            <span className="text-sm text-muted">{ing ? inputUnit(ing.unit) : ""}</span>
            <span className="tabular text-left text-sm text-muted lg:text-right">{ing?.cost != null ? formatMoney(Math.round((ing.cost * toMilli(r.qty, ing.unit)) / 1000), currency) : ing ? "maliyet yok" : ""}</span>
            <button type="button" disabled={pending} onClick={() => { setEdited(true); setRows((rs) => rs.filter((x) => x.k !== r.k)); requestAnimationFrame(() => addIngredientRef.current?.focus()); }} className="inline-flex size-11 items-center justify-center rounded-lg text-lg text-muted outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50" aria-label={`Malzeme satırı ${rowIndex + 1}${ing ? `, ${ing.label}` : ""} sil`}>×</button>
          </div>
        );
      })}
      <Button ref={addIngredientRef} type="button" variant="secondary" disabled={pending} onClick={() => { setEdited(true); setRows((rs) => [...rs, { k: next, id: "", qty: "" }]); setNext(next + 1); }}>+ Malzeme</Button>
      <div className="rounded-lg bg-surface-2 p-3 text-sm" data-testid="recipe-cost">
        {owner.yieldMilli ? <>Parti maliyeti <b className="tabular">{formatMoney(Math.round(total), currency)}</b> · {owner.unit} başına <b className="tabular">{formatMoney(Math.round(perUnit), currency)}</b></> : <>Maliyet <b className="tabular">{formatMoney(Math.round(total), currency)}</b></>}
        {missing && <span className="ml-2 text-warn">(maliyeti olmayan malzeme var)</span>}
        {margin !== null && <> · KDV hariç fiyat {formatMoney(Math.round(net!), currency)} · marj <b className="tabular">%{margin.toFixed(1)}</b></>}
      </div>
      {displayState.error && <p id={displayState.field === "items" ? "recipe-items-error" : undefined} className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      <div className="flex items-center gap-3">
        <Button ref={saveButtonRef} type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Reçeteyi kaydet"}</Button>
        {state.savedAt && !edited && !pending && !state.error && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Reçete kaydediliyor.</span>}
    </form>
  );
}

function ProductionFields({ products, state, displayState, pending, showSaved }: { products: (Option & { yieldLabel: string })[]; state: RecipeState; displayState: RecipeState; pending: boolean; showSaved: boolean }) {
  const [pid, setPid] = useState("");
  const y = products.find((p) => p.value === pid)?.yieldLabel;
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="contents">
      <div><Field label="Ara ürün"><Select key={state.savedAt ?? 0} disabled={pending} name="productId" options={products} defaultValue="" placeholder="Seçin" onChange={setPid} aria-invalid={displayState.field === "productId" && !!displayState.error || undefined} aria-describedby={displayState.field === "productId" && displayState.error ? "production-product-error" : undefined} /></Field>{displayState.field === "productId" && <p id="production-product-error" className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}</div>
      <div><Field label="Parti sayısı" hint={`0'dan büyük · en çok 9.999,999 · en çok 3 ondalık${y ? ` · 1 parti = ${y}` : " · ör. 2 ya da 0,5"}`}><Input key={state.savedAt ?? 0} name="batches" inputMode="decimal" maxLength={8} pattern="[0-9]{1,4}([.,][0-9]{1,3})?" defaultValue="1" required aria-invalid={displayState.field === "batches" && !!displayState.error || undefined} aria-describedby={displayState.field === "batches" && displayState.error ? "production-batches-error" : undefined} /></Field>{displayState.field === "batches" && <p id="production-batches-error" className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}</div>
      <div><Field label="Not" hint="İsteğe bağlı · en fazla 200 karakter"><Input key={state.savedAt ?? 0} name="note" maxLength={200} /></Field></div>
      {displayState.error && !displayState.field && <p className="break-words text-sm text-bad sm:col-span-3" role="alert" aria-live="assertive">{displayState.error}</p>}
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Üretimi kaydet"}</Button>
        {state.savedAt && showSaved && <span className="text-sm text-ok" role="status">Kaydedildi; stok ve maliyet güncellendi.</span>}
      </div>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Üretim ve stok güncellemesi kaydediliyor.</span>}
    </>
  );
}

export function ProductionForm({ products }: { products: (Option & { yieldLabel: string })[] }) {
  const { state, pending, onSubmit } = useFormAction(produce, {} as RecipeState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} as RecipeState : state;
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('button[role="combobox"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onClickCapture={(e) => {
      if (e.target instanceof Element && e.target.closest('button[role="combobox"]')) setEdited(true);
    }} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="grid gap-4 sm:grid-cols-3">
      <ProductionFields key={state.savedAt ?? 0} products={products} state={state} displayState={displayState} pending={pending} showSaved={!edited && !pending && !state.error} />
    </form>
  );
}
