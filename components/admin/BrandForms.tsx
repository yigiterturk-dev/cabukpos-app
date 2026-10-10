"use client";
import { createBrand, saveBrand, setBrandProducts, type BrandState } from "@/lib/admin/brand-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: BrandState; f?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);
const Saved = ({ s }: { s: BrandState }) => (s.savedAt ? <span className="text-sm text-ok">{s.info ?? "Kaydedildi."}</span> : null);

export function BrandForm({ initial }: { initial?: { id: string; name: string; slug: string } }) {
  const { state, pending, onSubmit } = useFormAction((initial ? saveBrand.bind(null, initial.id) : createBrand), {} as BrandState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><Field label="Marka adı"><Input name="name" defaultValue={initial?.name} placeholder="Örn. Pideci İnşaat" className="w-56" required /></Field><Err s={state} f="name" /></div>
      <div><Field label="Adres (slug)" hint="boşsa isimden üretilir"><Input name="slug" defaultValue={initial?.slug} placeholder="pideci-insaat" className="w-44" /></Field><Err s={state} f="slug" /></div>
      <Button type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Marka ekle"}</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function ProductPicker({ brandId, products, selected }: { brandId: string; products: { id: string; name: string; category: string | null }[]; selected: Set<string> }) {
  const { state, pending, onSubmit } = useFormAction(setBrandProducts.bind(null, brandId), {} as BrandState);
  const byCat = new Map<string, typeof products>();
  for (const p of products) {
    const k = p.category ?? "Diğer";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }
  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-3">
      {[...byCat.entries()].map(([cat, items]) => (
        <div key={cat}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {items.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="product" value={p.id} defaultChecked={selected.has(p.id)} className="size-4 accent-[var(--color-brand)]" />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Menüyü kaydet</Button>
        <Saved s={state} /><Err s={state} />
      </div>
    </form>
  );
}
