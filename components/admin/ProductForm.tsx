"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveCategory, saveProduct, type CatalogState } from "@/lib/admin/catalog-actions";
import { formatPlain } from "@/lib/core/money";
import { formatQty, type StockUnit } from "@/lib/core/stock";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f }: { s: CatalogState; f: string }) => (s.field === f && s.error ? <p id={`catalog-${f}-error`} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const fieldErrorProps = (s: CatalogState, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `catalog-${f}-error` }
  : {};

export type ProductInitial = { id: string; name: string; price: number; vatRate: number; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; trackStock: boolean; quick: boolean; stationId?: string | null; optionGroupIds?: string[];
  sellable: boolean; unit: StockUnit; cost: number | null; minStock: number | null; yieldMilli: number | null };
/** Restoran: ürüne bağlanabilecek istasyonlar ve seçenek grupları. */
export type SalonChoices = { stations: Option[]; groups: Option[]; storeId: string | null };
const FIELDS = ["name", "price", "vatRate", "categoryId", "barcodes", "kind", "plu", "unit", "cost", "minStock", "yieldMilli"];
const money = (k: number | null | undefined) => (k == null ? "" : formatPlain(k));
const qty = (q: number | null | undefined, u: StockUnit) => (q == null ? "" : formatQty(q, u).replace(/ (kg|lt)$/, ""));

function RadioCards<T extends string>({ name, value, set, items, label, error }: { name: string; value: T; set: (v: T) => void; items: readonly (readonly [T, string])[]; label: string; error?: boolean }) {
  return (
    <fieldset aria-describedby={error ? `catalog-${name}-error` : undefined} className="m-0 border-0 p-0">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {items.map(([v, l]) => (
          <label key={v} className={`press inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${error ? "border-bad bg-bad-soft text-bad" : value === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"}`}>
            <input type="radio" name={name} value={v} required checked={value === v} onChange={() => set(v)} aria-describedby={error ? `catalog-${name}-error` : undefined} className="peer sr-only" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Fields({ s, initial, categories, salon, pending, currencyUnit }: { s: CatalogState; initial?: ProductInitial; categories: Option[]; salon?: SalonChoices; pending: boolean; currencyUnit: string }) {
  const [vat, setVat] = useState(String(initial?.vatRate ?? 10));
  const [kind, setKind] = useState(initial?.kind ?? "adet");
  const [sellable, setSellable] = useState(initial?.sellable ?? true);
  const [unit, setUnit] = useState<StockUnit>(initial?.unit ?? "kg");
  const [price, setPrice] = useState(initial ? formatPlain(initial.price) : "");
  const [yieldMilli, setYieldMilli] = useState(qty(initial?.yieldMilli, initial?.unit ?? "kg"));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [plu, setPlu] = useState(initial?.plu ?? "");
  const [trackStock, setTrackStock] = useState(initial?.trackStock ?? false);
  const [quick, setQuick] = useState(initial?.quick ?? false);
  const [stationId, setStationId] = useState(initial?.stationId ?? "");
  const [optionGroupIds, setOptionGroupIds] = useState(initial?.optionGroupIds ?? []);
  const u: StockUnit = sellable ? (kind === "tartili" ? "kg" : "adet") : unit;
  const uLabel = u === "adet" ? "adet" : u;
  const qtyMaxLength = u === "adet" ? 6 : 10;
  const qtyFormatHint = u === "adet" ? "tam sayı · en fazla 999.999" : `en fazla 999.999,999 ${u} · 3 ondalık hane`;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div><Field label="Ürün adı" hint="2–80 karakter"><Input name="name" defaultValue={initial?.name} minLength={2} maxLength={80} pattern=".*\\S.*\\S.*" required {...fieldErrorProps(s, "name")} /></Field><Err s={s} f="name" /></div>
      <div>
        <RadioCards name="sellable" value={sellable ? "true" : "false"} set={(v) => setSellable(v === "true")} label="Kasada satılır" items={[["true", "Evet"], ["false", "Hayır (hammadde / ara ürün)"]]} />
      </div>
      {!sellable && (
        <>
          <div><RadioCards name="unit" value={unit} set={setUnit} label="Stok birimi" items={[["adet", "Adet"], ["kg", "Kg"], ["lt", "Litre"]]} error={s.field === "unit" && !!s.error} /><Err s={s} f="unit" /></div>
          <div><Field label={`Parti miktarı (${uLabel})`} hint={`Bir üretim partisinin çıktısı · ${qtyFormatHint}`}><Input name="yieldMilli" inputMode={u === "adet" ? "numeric" : "decimal"} maxLength={qtyMaxLength} value={yieldMilli} onChange={(e) => setYieldMilli(e.target.value)} {...fieldErrorProps(s, "yieldMilli")} /></Field><Err s={s} f="yieldMilli" /></div>
        </>
      )}
      <div><Field label={`Maliyet (${uLabel} başına, ${currencyUnit})`} hint="Alış fişi kaydedince kendiliğinden güncellenir · en fazla 100.000,00 · en çok 2 ondalık"><Input name="cost" inputMode="decimal" maxLength={10} defaultValue={money(initial?.cost)} {...fieldErrorProps(s, "cost")} /></Field><Err s={s} f="cost" /></div>
      <div><Field label={`Kritik stok sınırı (${uLabel})`} hint={`Stok bu değere inince uyarı; boş = uyarı yok · ${qtyFormatHint}`}><Input name="minStock" inputMode={u === "adet" ? "numeric" : "decimal"} maxLength={qtyMaxLength} defaultValue={qty(initial?.minStock, u)} {...fieldErrorProps(s, "minStock")} /></Field><Err s={s} f="minStock" /></div>
      {sellable && (<>
      <div>
        <RadioCards name="kind" value={kind} set={setKind} label="Tür" items={[["adet", "Adet"], ["tartili", "Tartılı (kg)"]]} error={s.field === "kind" && !!s.error} />
        <Err s={s} f="kind" />
      </div>
      <div><Field label={kind === "tartili" ? `Kg fiyatı (${currencyUnit}, KDV dahil)` : `Fiyat (${currencyUnit}, KDV dahil)`} hint={`0,01–100.000,00 ${currencyUnit} · en çok 2 ondalık`}><Input name="price" inputMode="decimal" maxLength={10} value={price} onChange={(e) => setPrice(e.target.value)} required {...fieldErrorProps(s, "price")} /></Field><Err s={s} f="price" /></div>
      <div>
        <RadioCards name="vatRate" value={vat} set={setVat} label="KDV" items={[...["1", "10", "20"].map((r) => [r, `%${r}`] as const)]} error={s.field === "vatRate" && !!s.error} />
        <Err s={s} f="vatRate" />
      </div>
      <div><Field label="Kategori"><Select name="categoryId" disabled={pending} options={[{ value: "", label: "Kategorisiz" }, ...categories]} defaultValue={categoryId} onChange={setCategoryId} placeholder="Kategorisiz" {...fieldErrorProps(s, "categoryId")} /></Field><Err s={s} f="categoryId" /></div>
      {kind === "tartili" ? <div><Field label="PLU" hint="Terazideki 5 rakamlı ürün kodu; etiketsiz tartımda boş"><Input name="plu" inputMode="numeric" maxLength={5} pattern="[0-9]{5}" title="PLU 5 rakam olmalı." value={plu} onChange={(e) => setPlu(e.target.value)} {...fieldErrorProps(s, "plu")} /></Field><Err s={s} f="plu" /></div> : <div />}
      <div className="flex flex-col justify-end gap-2 text-sm">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="trackStock" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Stok takibi</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="quick" checked={quick} onChange={(e) => setQuick(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Kasada hızlı tuş</label>
      </div>
      {salon && (
        <>
          <div>
            <Field label="Bu şubenin mutfak istasyonu">
              {salon.storeId
                ? <Select name="stationId" disabled={pending} options={[{ value: "", label: "Kategoriden" }, ...salon.stations]} defaultValue={stationId} onChange={setStationId} placeholder="Kategoriden" />
                : <><input type="hidden" name="stationId" value="" /><p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">İstasyon atamak için önce bir şube oluşturun. <Link href="/yonetim/subeler" className="font-medium text-brand underline">Şube ekle</Link></p></>}
            </Field>
            {salon.storeId && salon.stations.length === 0 && <p className="mt-1 text-xs text-muted">Bu şubede istasyon yok. <Link href="/yonetim/istasyonlar" className="font-medium text-brand underline">İstasyon ekle</Link></p>}
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium">Seçenek grupları</div>
            {salon.groups.length === 0 ? <p className="text-sm text-muted">Seçenekler sayfasından grup ekleyin.</p> : (
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {salon.groups.map((g) => <label key={g.value} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="optionGroups" value={g.value} checked={optionGroupIds.includes(g.value)} onChange={(e) => setOptionGroupIds((current) => e.target.checked ? [...current, g.value] : current.filter((id) => id !== g.value))} className="size-4 accent-[var(--color-brand)]" />{g.label}</label>)}
              </div>
            )}
          </div>
        </>
      )}
      </>)}
      <div className="sm:col-span-2 lg:col-span-1"><Field label="Barkodlar" hint="Her barkod 3–14 rakam olmalı; virgül ya da satırla ayırın. Boş bırakılabilir."><Textarea name="barcodes" rows={2} defaultValue={initial?.barcodes.join("\n")} {...fieldErrorProps(s, "barcodes")} /></Field><Err s={s} f="barcodes" /></div>
    </div>
  );
}

export function ProductForm({ initial, categories, salon, currencyUnit }: { initial?: ProductInitial; categories: Option[]; salon?: SalonChoices; currencyUnit: string }) {
  const { state, pending, onSubmit } = useFormAction(saveProduct.bind(null, initial?.id ?? null), {} as CatalogState);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const isEditing = Boolean(initial);
  const displayState = edited || pending ? {} as CatalogState : state;
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const radio = FIELDS.includes(state.field!) ? formRef.current?.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(state.field!)}"]`) : null;
      (invalid ?? radio)?.focus();
    });
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => {
      if (isEditing) saveButtonRef.current?.focus();
      else formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, pending, state.error, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onClickCapture={(e) => {
      if (e.target instanceof Element && e.target.closest('button[role="combobox"]')) setEdited(true);
    }} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="space-y-4">
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
        <legend className="sr-only">{initial ? "Ürünü düzenle" : "Yeni ürün"}</legend>
        <Fields key={initial ? initial.id : state.savedAt ?? 0} s={displayState} initial={initial} categories={categories} salon={salon} pending={pending} currencyUnit={currencyUnit} />
        {displayState.error && !FIELDS.includes(displayState.field ?? "") && <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button ref={saveButtonRef} type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Ürünü kaydet"}</Button>
        {initial && <Link href="/yonetim/urunler" aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined} onClick={(e) => { if (pending) e.preventDefault(); }} className={`inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-2 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${pending ? "pointer-events-none opacity-50" : ""}`}>Vazgeç</Link>}
        {pending && <span className="sr-only" role="status" aria-live="polite">Ürün kaydediliyor. Lütfen bekleyin.</span>}
        {state.savedAt && !edited && !pending && !state.error && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

export function CategoryForm() {
  const { state, pending, onSubmit } = useFormAction(saveCategory, {} as CatalogState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? {} as CatalogState : state;
  useEffect(() => {
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="categoryName"]')?.focus());
  }, [state.error, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="categoryName" placeholder="Yeni kategori" aria-label="Kategori adı" aria-invalid={displayState.field === "categoryName" && !!displayState.error || undefined} aria-describedby={`catalog-categoryName-hint${displayState.field === "categoryName" && displayState.error ? " catalog-categoryName-error" : ""}`} maxLength={40} minLength={2} pattern=".*\\S.*\\S.*" disabled={pending} required className="w-48 disabled:cursor-wait disabled:opacity-50" /><span id="catalog-categoryName-hint" className="mt-1 block text-xs text-muted">2–40 karakter</span><Err s={displayState} f="categoryName" /></div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Ekleniyor…" : "Kategori ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Kategori ekleniyor. Lütfen bekleyin.</span>}
      {displayState.error && !displayState.field && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      {state.savedAt && !edited && !pending && !state.error && <span className="text-sm text-ok" role="status">Kategori eklendi.</span>}
    </form>
  );
}
