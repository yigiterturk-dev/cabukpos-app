"use client";
import { useEffect, useRef, useState } from "react";
import { importProducts, type ProductImportState } from "@/lib/admin/catalog-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button } from "@/components/ui";

export function ProductImportForm() {
  const { state, pending, onSubmit } = useFormAction(importProducts, {} as ProductImportState);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileChanged, setFileChanged] = useState(false);
  useEffect(() => {
    if (state.imported == null || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[type="file"]')?.focus());
  }, [state.error, state.imported]);
  return (
    <form ref={formRef} onSubmit={(e) => { setFileChanged(false); onSubmit(e); }} aria-busy={pending} className="space-y-3 rounded-xl border border-line bg-surface-2 p-4" encType="multipart/form-data">
      <div>
        <h2 className="font-semibold">CSV’den toplu ürün aktar</h2>
        <p id="product-import-hint" className="mt-1 text-sm text-ink-2">En fazla 1 MB ve 500 ürün. Ürün adı ve fiyat zorunlu. Kategori yoksa otomatik oluşturulur; tüm dosya doğrulanmadan hiçbir satır kaydedilmez.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="product-csv" className="text-sm font-medium">CSV dosyası</label>
        <input key={state.savedAt ?? 0} id="product-csv" name="file" type="file" accept=".csv,text/csv" aria-describedby={`product-import-hint${fileError ? " product-file-error" : ""}`} aria-invalid={fileError ? true : undefined} disabled={pending} required onChange={(event) => {
          setFileChanged(true);
          const file = event.currentTarget.files?.[0];
          setFileError(file && file.size > 1_000_000 ? "CSV dosyası en fazla 1 MB olabilir." : null);
        }} className="block min-h-11 max-w-full rounded-lg border border-line bg-surface px-3 py-2 text-base disabled:cursor-wait disabled:opacity-50 lg:text-sm" />
        <Button type="submit" variant="secondary" disabled={pending || Boolean(fileError)}>{pending ? "Aktarılıyor…" : "Ürünleri aktar"}</Button>
        <a href="/indir/cabukpos-urun-sablonu.csv" download className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">Örnek şablonu indir</a>
      </div>
      {fileError && <p id="product-file-error" className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{fileError}</p>}
      {state.error && !fileChanged && !pending && <p className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
      {pending && <p className="sr-only" role="status" aria-live="polite">Ürün dosyası aktarılıyor. Lütfen bekleyin.</p>}
      {state.imported != null && !fileChanged && !pending && <p className="text-sm text-ok" role="status">{state.imported} ürün aktarıldı.</p>}
    </form>
  );
}
