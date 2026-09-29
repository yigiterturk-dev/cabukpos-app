"use client";
import Link from "next/link";
import { useState } from "react";
import { saveCategory, saveProduct, type CatalogState } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { formatQty, type StockUnit } from "@/lib/core/stock";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f }: { s: CatalogState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);

export type ProductInitial = { id: string; name: string; price: number; vatRate: number; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; trackStock: boolean; quick: boolean; stationId?: string | null; optionGroupIds?: string[];
  sellable: boolean; unit: StockUnit; cost: number | null; minStock: number | null; yieldMilli: number | null };
/** Restoran: ürüne bağlanabilecek istasyonlar ve seçenek grupları. */
export type SalonChoices = { stations: Option[]; groups: Option[] };
const FIELDS = ["name", "price", "vatRate", "categoryId", "barcodes", "kind", "plu", "unit", "cost", "minStock", "yieldMilli"];
const tl = (k: number | null | undefined) => (k == null ? "" : formatTL(k).replace(" ₺", ""));
const qty = (q: number | null | undefined, u: StockUnit) => (q == null ? "" : formatQty(q, u).replace(/ (kg|lt)$/, ""));

function Toggle<T extends string>({ name, value, set, items, label }: { name: string; value: T; set: (v: T) => void; items: readonly (readonly [T, string])[]; label: string }) {
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {items.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => set(v)} className={`rounded-lg border px-3 py-2 text-sm ${value === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-white hover:bg-surface-2"}`}>{l}</button>
        ))}
      </div>
    </>
  );
}

function Fields({ s, initial, categories, salon }: { s: CatalogState; initial?: ProductInitial; categories: Option[]; salon?: SalonChoices }) {
  const [vat, setVat] = useState(String(initial?.vatRate ?? 10));
  const [kind, setKind] = useState(initial?.kind ?? "adet");
  const [sellable, setSellable] = useState(initial?.sellable ?? true);
  const [unit, setUnit] = useState<StockUnit>(initial?.unit ?? "kg");
  const u: StockUnit = sellable ? (kind === "tartili" ? "kg" : "adet") : unit;
  const uLabel = u === "adet" ? "adet" : u;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div><Field label="Ürün adı"><Input name="name" defaultValue={initial?.name} required /></Field><Err s={s} f="name" /></div>
      <div>
        <div className="mb-1.5 text-sm font-medium">Kasada satılır</div>
        <Toggle name="sellable" value={sellable ? "true" : "false"} set={(v) => setSellable(v === "true")} label="Kasada satılır" items={[["true", "Evet"], ["false", "Hayır (hammadde / ara ürün)"]]} />
      </div>
      {!sellable && (
        <>
          <div><div className="mb-1.5 text-sm font-medium">Stok birimi</div><Toggle name="unit" value={unit} set={setUnit} label="Stok birimi" items={[["adet", "Adet"], ["kg", "Kg"], ["lt", "Litre"]]} /><Err s={s} f="unit" /></div>
          <div><Field label={`Parti miktarı (${uLabel})`} hint="Yalnız ara ürün: bir üretim partisi ne kadar çıkar"><Input name="yieldMilli" inputMode="decimal" defaultValue={qty(initial?.yieldMilli, u)} /></Field><Err s={s} f="yieldMilli" /></div>
        </>
      )}
      <div><Field label={`Maliyet (${uLabel} başına, TL)`} hint="Alış fişi kaydedince kendiliğinden güncellenir"><Input name="cost" inputMode="decimal" defaultValue={tl(initial?.cost)} /></Field><Err s={s} f="cost" /></div>
      <div><Field label={`Kritik stok sınırı (${uLabel})`} hint="Stok bu değere inince uyarı; boş = uyarı yok"><Input name="minStock" inputMode="decimal" defaultValue={qty(initial?.minStock, u)} /></Field><Err s={s} f="minStock" /></div>
      {sellable && (<>
      <div>
        <div className="mb-1.5 text-sm font-medium">Tür</div>
        <input type="hidden" name="kind" value={kind} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ürün türü">
          {([["adet", "Adet"], ["tartili", "Tartılı (kg)"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`rounded-lg border px-3 py-2 text-sm ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-white hover:bg-surface-2"}`}>{l}</button>
          ))}
        </div>
        <Err s={s} f="kind" />
      </div>
      <div><Field label={kind === "tartili" ? "Kg fiyatı (KDV dahil)" : "Fiyat (KDV dahil)"} hint="ör. 25,00"><Input name="price" inputMode="decimal" defaultValue={initial ? formatTL(initial.price).replace(" ₺", "") : ""} required /></Field><Err s={s} f="price" /></div>
      <div>
        <div className="mb-1.5 text-sm font-medium">KDV</div>
        <input type="hidden" name="vatRate" value={vat} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="KDV oranı">
          {["1", "10", "20"].map((r) => (
            <button key={r} type="button" aria-pressed={vat === r} onClick={() => setVat(r)} className={`rounded-lg border px-3 py-2 text-sm ${vat === r ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-white hover:bg-surface-2"}`}>%{r}</button>
          ))}
        </div>
        <Err s={s} f="vatRate" />
      </div>
      <div><div className="mb-1.5 text-sm font-medium">Kategori</div><Select name="categoryId" options={[{ value: "", label: "Kategorisiz" }, ...categories]} defaultValue={initial?.categoryId ?? ""} placeholder="Kategorisiz" /><Err s={s} f="categoryId" /></div>
      {kind === "tartili" ? <div><Field label="PLU" hint="Terazideki 5 haneli ürün kodu; etiketsiz tartımda boş"><Input name="plu" inputMode="numeric" maxLength={5} defaultValue={initial?.plu ?? ""} /></Field><Err s={s} f="plu" /></div> : <div />}
      <div className="flex flex-col justify-end gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="trackStock" defaultChecked={initial?.trackStock} className="size-4 accent-[var(--color-brand)]" />Stok takibi</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="quick" defaultChecked={initial?.quick} className="size-4 accent-[var(--color-brand)]" />Kasada hızlı tuş</label>
      </div>
      {salon && (
        <>
          <div><div className="mb-1.5 text-sm font-medium">Mutfak istasyonu</div><Select name="stationId" options={[{ value: "", label: "Kategoriden" }, ...salon.stations]} defaultValue={initial?.stationId ?? ""} placeholder="Kategoriden" /></div>
          <div>
            <div className="mb-1.5 text-sm font-medium">Seçenek grupları</div>
            {salon.groups.length === 0 ? <p className="text-sm text-muted">Seçenekler sayfasından grup ekleyin.</p> : (
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {salon.groups.map((g) => <label key={g.value} className="flex items-center gap-2"><input type="checkbox" name="optionGroups" value={g.value} defaultChecked={initial?.optionGroupIds?.includes(g.value)} className="size-4 accent-[var(--color-brand)]" />{g.label}</label>)}
              </div>
            )}
          </div>
        </>
      )}
      </>)}
      <div className="sm:col-span-2 lg:col-span-1"><Field label="Barkodlar" hint="Virgül ya da satırla ayırın; boş olabilir"><Textarea name="barcodes" rows={2} defaultValue={initial?.barcodes.join("\n")} /></Field><Err s={s} f="barcodes" /></div>
    </div>
  );
}

export function ProductForm({ initial, categories, salon }: { initial?: ProductInitial; categories: Option[]; salon?: SalonChoices }) {
  const { state, pending, onSubmit } = useFormAction(saveProduct.bind(null, initial?.id ?? null), {} as CatalogState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Fields key={initial ? initial.id : state.savedAt ?? 0} s={state} initial={initial} categories={categories} salon={salon} />
      {state.error && !FIELDS.includes(state.field ?? "") && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Ürünü kaydet"}</Button>
        {initial && <Link href="/yonetim/urunler" className="text-sm text-muted hover:text-ink hover:underline">Vazgeç</Link>}
        {state.savedAt && !initial && <span className="text-sm text-ok">Kaydedildi.</span>}
      </div>
    </form>
  );
}

export function CategoryForm() {
  const { state, pending, onSubmit } = useFormAction(saveCategory, {} as CatalogState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="categoryName" placeholder="Yeni kategori" aria-label="Kategori adı" className="w-48" /><Err s={state} f="categoryName" /></div>
      <Button type="submit" variant="secondary" disabled={pending}>Kategori ekle</Button>
    </form>
  );
}
