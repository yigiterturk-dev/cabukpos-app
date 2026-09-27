"use client";
import Link from "next/link";
import { useState } from "react";
import { saveCategory, saveProduct, type CatalogState } from "@/lib/admin/catalog-actions";
import { formatTL } from "@/lib/core/money";
import { Select, type Option } from "@/components/Select";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const Err = ({ s, f }: { s: CatalogState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-sm text-red-700">{s.error}</p> : null);

export type ProductInitial = { id: string; name: string; price: number; vatRate: number; categoryId: string | null; barcodes: string[] };

function Fields({ s, initial, categories }: { s: CatalogState; initial?: ProductInitial; categories: Option[] }) {
  const [vat, setVat] = useState(String(initial?.vatRate ?? 10));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Field label="Ürün adı"><Input name="name" defaultValue={initial?.name} required /></Field><Err s={s} f="name" /></div>
      <div><Field label="Fiyat (KDV dahil)" hint="ör. 25,00"><Input name="price" inputMode="decimal" defaultValue={initial ? formatTL(initial.price).replace(" ₺", "") : ""} required /></Field><Err s={s} f="price" /></div>
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
      <div className="sm:col-span-2"><Field label="Barkodlar" hint="Virgül ya da satırla ayırın; boş olabilir"><Textarea name="barcodes" rows={2} defaultValue={initial?.barcodes.join("\n")} /></Field><Err s={s} f="barcodes" /></div>
    </div>
  );
}

export function ProductForm({ initial, categories }: { initial?: ProductInitial; categories: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveProduct.bind(null, initial?.id ?? null), {} as CatalogState);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Fields key={initial ? initial.id : state.savedAt ?? 0} s={state} initial={initial} categories={categories} />
      {state.error && !["name", "price", "vatRate", "categoryId", "barcodes"].includes(state.field ?? "") && <p className="text-sm text-red-700">{state.error}</p>}
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
