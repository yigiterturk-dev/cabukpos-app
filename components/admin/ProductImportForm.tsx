"use client";
import { importProducts, type ProductImportState } from "@/lib/admin/catalog-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui";

export function ProductImportForm() {
  const { state, pending, onSubmit } = useFormAction(importProducts, {} as ProductImportState);
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-line bg-surface-2 p-4" encType="multipart/form-data">
      <div>
        <h2 className="font-semibold">CSV’den toplu ürün aktar</h2>
        <p className="mt-1 text-sm text-ink-2">Ürün adı ve fiyat zorunlu. Kategori yoksa otomatik oluşturulur; tüm dosya doğrulanmadan hiçbir satır kaydedilmez.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input name="file" type="file" accept=".csv,text/csv" required className="block min-h-11 max-w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Aktarılıyor…" : "Ürünleri aktar"}</Button>
        <a href="/indir/cabukpos-urun-sablonu.csv" download className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm font-medium text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Örnek şablonu indir</a>
      </div>
      {state.error && <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {state.imported != null && <p className="text-sm text-ok" role="status">{state.imported} ürün aktarıldı.</p>}
    </form>
  );
}
