"use client";
// #50 fiyat listesi formları (bolgeler deseninde).
import { useEffect, useId, useRef, useState } from "react";
import { deletePriceItem, deletePriceList, savePriceItem, savePriceList, togglePriceList, type PriceListState } from "@/lib/admin/pricelist-actions";
import { useFormAction } from "@/components/useFormAction";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { Select, type Option } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f, idPrefix = "price-list" }: { s: PriceListState; f?: string; idPrefix?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p id={f ? `${idPrefix}-${f}-error` : undefined} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: PriceListState, f: string, idPrefix = "price-list") => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `${idPrefix}-${f}-error` }
  : {};
const Saved = ({ s }: { s: PriceListState }) => (s.savedAt ? <span className="text-sm text-ok" role="status">Kaydedildi.</span> : null);
const GUNLER = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function ListFields({ categories, state, pending }: { categories: Option[]; state: PriceListState; pending: boolean }) {
  const [kind, setKind] = useState<"fiyat" | "yuzde">("fiyat");
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div><Field label="Liste adı"><Input name="name" disabled={pending} placeholder="Happy Hour" className="w-44" required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
        <div className="w-48">
          <Field label="Tür"><Select disabled={pending} name="kind" defaultValue="fiyat" onChange={(v) => setKind(v as "fiyat" | "yuzde")} options={[
            { value: "fiyat", label: "Ürün başı fiyat" },
            { value: "yuzde", label: "Yüzde indirim" },
          ]} /></Field>
        </div>
        {kind === "yuzde" && <div><Field label="İndirim %" hint="1–100 arasında tam sayı"><Input name="percent" disabled={pending} inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} placeholder="20" className="w-24 text-right" required {...errorProps(state, "percent")} /></Field><Err s={state} f="percent" /></div>}
        <div>
          <div className="mb-1.5 text-sm font-medium">Günler</div>
          <div className="flex gap-2 pt-1">
            {GUNLER.map((g, i) => (
              <label key={g} className="flex min-h-11 items-center gap-1 text-sm">
                <input type="checkbox" name={`d${i}`} disabled={pending} defaultChecked className="size-4 accent-brand" />{g}
              </label>
            ))}
          </div>
        </div>
        <div><Field label="Başlangıç"><Input name="start" type="time" disabled={pending} defaultValue="17:00" className="w-32" required {...errorProps(state, "start")} /></Field><Err s={state} f="start" /></div>
        <div><Field label="Bitiş"><Input name="end" type="time" disabled={pending} defaultValue="19:00" className="w-32" required {...errorProps(state, "end")} /></Field><Err s={state} f="end" /></div>
      </div>
      {kind === "yuzde" && (
        <div>
          <div className="mb-1.5 text-sm font-medium">Kapsam</div>
          <p className="mb-2 text-xs text-muted">Kategori seçmezsen <b>tüm ürünlere</b> uygulanır.</p>
          {categories.length === 0 ? <p className="text-sm text-muted">Kategori yok — tüm ürünlere uygulanır.</p> : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {categories.map((c) => (
                <label key={c.value} className="flex min-h-11 items-center gap-1.5 text-sm">
                  <input type="checkbox" name="cat" value={c.value} disabled={pending} className="size-4 accent-brand" />{c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function ListForm({ categories }: { categories: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(savePriceList.bind(null, null), {} as PriceListState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <ListFields key={state.savedAt ?? 0} categories={categories} state={state} pending={pending} />
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Ekleniyor…" : "Liste ekle"}</Button><Saved s={state} /></div>
      {pending && <p className="sr-only" role="status" aria-live="polite">Fiyat listesi kaydediliyor.</p>}
      <Err s={state} />
    </form>
  );
}

export function ItemForm({ listId, products }: { listId: string; products: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(savePriceItem.bind(null, listId), {} as PriceListState);
  const idPrefix = `price-item-${useId()}`;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('button[role="combobox"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div className="w-64"><Field label="Ürün"><Select disabled={pending} name="productId" options={products} placeholder="Ürün seçin" {...errorProps(state, "productId", idPrefix)} /></Field><Err s={state} f="productId" idPrefix={idPrefix} /></div>
        <div><Field label="Liste fiyatı (TL)"><Input name="price" disabled={pending} inputMode="decimal" placeholder="0" className="w-28 text-right" required {...errorProps(state, "price", idPrefix)} /></Field><Err s={state} f="price" idPrefix={idPrefix} /></div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Ekleniyor…" : "Fiyat ekle"}</Button>
      <Saved s={state} /><Err s={state} />
      {pending && <span className="sr-only" role="status" aria-live="polite">Ürün fiyatı ekleniyor.</span>}
    </form>
  );
}

export function ListToggles({ id, active }: { id: string; active: boolean }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3">
      {!active && <span className="text-sm text-muted">Pasif</span>}
      <form action={togglePriceList.bind(null, id, !active)}><button className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{active ? "Pasifleştir" : "Aktifleştir"}</button></form>
      <ConfirmActionForm action={deletePriceList.bind(null, id)} label="Sil" prompt="Fiyat listesi ve içindeki tüm ürün fiyatları silinecek. Devam etmek istiyor musunuz?" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-bad outline-none hover:bg-bad-soft hover:underline focus-visible:ring-4 focus-visible:ring-bad/20" />
    </div>
  );
}

export function ItemDelete({ listId, id }: { listId: string; id: string }) {
  return (
    <ConfirmActionForm action={deletePriceItem.bind(null, listId, id)} label="Kaldır" prompt="Bu ürün fiyatı listeden kaldırılacak. Devam etmek istiyor musunuz?" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-bad outline-none hover:bg-bad-soft hover:underline focus-visible:ring-4 focus-visible:ring-bad/20" />
  );
}
