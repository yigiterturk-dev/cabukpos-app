"use client";
import Link from "next/link";
import { useState } from "react";
import { saveCategory, saveProduct, type CatalogState } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f }: { s: CatalogState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-red-700">{s.error}</p> : null);

export type ProductInitial = { id: string; name: string; price: number; vatRate: number; categoryId: string | null; barcodes: string[]; kind: "adet" | "tartili"; plu: string | null; trackStock: boolean; quick: boolean; stationId?: string | null; optionGroupIds?: string[] };
/** Restoran: ürüne bağlanabilecek istasyonlar ve seçenek grupları. */
export type SalonChoices = { stations: Option[]; groups: Option[] };
const FIELDS = ["name", "price", "vatRate", "categoryId", "barcodes", "kind", "plu"];

function Fields({ s, initial, categories, salon }: { s: CatalogState; initial?: ProductInitial; categories: Option[]; salon?: SalonChoices }) {
  const [vat, setVat] = useState(String(initial?.vatRate ?? 10));
  const [kind, setKind] = useState(initial?.kind ?? "adet");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Field label="Ürün adı"><Input name="name" defaultValue={initial?.name} required /></Field><Err s={s} f="name" /></div>
      <div>
        <div className="mb-1.5 text-sm font-medium">Tür</div>
        <input type="hidden" name="kind" value={kind} />
        <div className="flex gap-1" role="group" aria-label="Ürün türü">
          {([["adet", "Adet"], ["tartili", "Tartılı (kg)"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`rounded-lg border px-3 py-2 text-sm ${kind === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>{l}</button>
          ))}
        </div>
        <Err s={s} f="kind" />
      </div>
      <div><Field label={kind === "tartili" ? "Kg fiyatı (KDV dahil)" : "Fiyat (KDV dahil)"} hint="ör. 25,00"><Input name="price" inputMode="decimal" defaultValue={initial ? formatTL(initial.price).replace(" ₺", "") : ""} required /></Field><Err s={s} f="price" /></div>
      <div>
        <div className="mb-1.5 text-sm font-medium">KDV</div>
        <input type="hidden" name="vatRate" value={vat} />
        <div className="flex gap-1" role="group" aria-label="KDV oranı">
          {["1", "10", "20"].map((r) => (
            <button key={r} type="button" aria-pressed={vat === r} onClick={() => setVat(r)} className={`rounded-lg border px-3 py-2 text-sm ${vat === r ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`}>%{r}</button>
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
      <div className="sm:col-span-2"><Field label="Barkodlar" hint="Virgül ya da satırla ayırın; boş olabilir"><Textarea name="barcodes" rows={2} defaultValue={initial?.barcodes.join("\n")} /></Field><Err s={s} f="barcodes" /></div>
    </div>
  );
}

export function ProductForm({ initial, categories, salon }: { initial?: ProductInitial; categories: Option[]; salon?: SalonChoices }) {
  const { state, pending, onSubmit } = useFormAction(saveProduct.bind(null, initial?.id ?? null), {} as CatalogState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Fields key={initial ? initial.id : state.savedAt ?? 0} s={state} initial={initial} categories={categories} salon={salon} />
      {state.error && !FIELDS.includes(state.field ?? "") && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Ürünü kaydet"}</Button>
        {initial && <Link href="/yonetim/urunler" className="text-sm text-muted underline">Vazgeç</Link>}
        {state.savedAt && !initial && <span className="text-sm text-emerald-700">Kaydedildi.</span>}
      </div>
    </form>
  );
}

export function CategoryForm() {
  const { state, pending, onSubmit } = useFormAction(saveCategory, {} as CatalogState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div><Input key={state.savedAt ?? 0} name="categoryName" placeholder="Yeni kategori" aria-label="Kategori adı" className="w-48" /><Err s={state} f="categoryName" /></div>
      <Button type="submit" variant="ghost" disabled={pending}>Kategori ekle</Button>
    </form>
  );
}
