"use client";
// #50 fiyat listesi formları (bolgeler deseninde).
import { deletePriceItem, deletePriceList, savePriceItem, savePriceList, togglePriceList, type PriceListState } from "@/lib/admin/pricelist-actions";
import { useFormAction } from "@/components/useFormAction";
import { Select, type Option } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: PriceListState; f?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);
const Saved = ({ s }: { s: PriceListState }) => (s.savedAt ? <span className="text-sm text-ok">Kaydedildi.</span> : null);
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const GUNLER = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export function ListForm({ initial }: { initial?: { id: string; name: string; days: number[]; startMin: number; endMin: number } }) {
  const { state, pending, onSubmit } = useFormAction(savePriceList.bind(null, initial?.id ?? null), {} as PriceListState);
  const days = initial?.days ?? [];
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Liste adı"><Input name="name" defaultValue={initial?.name} placeholder="Happy Hour" className="w-44" required /></Field><Err s={state} f="name" /></div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Günler</div>
          <div className="flex gap-2 pt-1">
            {GUNLER.map((g, i) => (
              <label key={g} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name={`d${i}`} defaultChecked={days.length === 0 || days.includes(i)} className="size-4 accent-[var(--color-brand)]" />{g}
              </label>
            ))}
          </div>
        </div>
        <div><Field label="Başlangıç"><Input name="start" defaultValue={initial ? hm(initial.startMin) : "17:00"} placeholder="17:00" className="w-24" required /></Field><Err s={state} f="start" /></div>
        <div><Field label="Bitiş"><Input name="end" defaultValue={initial ? hm(initial.endMin) : "19:00"} placeholder="19:00" className="w-24" required /></Field><Err s={state} f="end" /></div>
      </div>
      <Button type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Liste ekle"}</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function ItemForm({ listId, products }: { listId: string; products: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(savePriceItem.bind(null, listId), {} as PriceListState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div className="w-64"><div className="mb-1.5 text-sm font-medium">Ürün</div><Select name="productId" options={products} placeholder="Ürün seçin" /><Err s={state} f="productId" /></div>
        <div><Field label="Liste fiyatı (TL)"><Input name="price" inputMode="decimal" placeholder="0" className="w-28 text-right" required /></Field><Err s={state} f="price" /></div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>Fiyat ekle</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function ListToggles({ id, active }: { id: string; active: boolean }) {
  return (
    <div className="ml-auto flex items-center gap-3">
      {!active && <span className="text-sm text-muted">Pasif</span>}
      <form action={togglePriceList.bind(null, id, !active)}><button className="text-sm text-muted hover:text-ink hover:underline">{active ? "Pasifleştir" : "Aktifleştir"}</button></form>
      <form action={deletePriceList.bind(null, id)}><button className="text-sm text-bad hover:underline">Sil</button></form>
    </div>
  );
}

export function ItemDelete({ listId, id }: { listId: string; id: string }) {
  return (
    <form action={deletePriceItem.bind(null, listId, id)}>
      <button className="text-sm text-bad hover:underline">Kaldır</button>
    </form>
  );
}
