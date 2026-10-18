"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createBrand, saveBrand, setBrandProducts, type BrandState } from "@/lib/admin/brand-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f, idPrefix = "brand" }: { s: BrandState; f?: string; idPrefix?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p id={f ? `${idPrefix}-${f}-error` : undefined} className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: BrandState, f: string, idPrefix = "brand") => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `${idPrefix}-${f}-error` }
  : {};
const Saved = ({ s }: { s: BrandState }) => (s.savedAt ? <span className="text-sm text-ok" role="status">{s.info ?? "Kaydedildi."}</span> : null);

export function BrandForm({ initial }: { initial?: { id: string; name: string; slug: string } }) {
  const { state, pending, onSubmit } = useFormAction((initial ? saveBrand.bind(null, initial.id) : createBrand), {} as BrandState);
  const idPrefix = `brand-${useId()}`;
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as BrandState) : state;
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending} className="flex flex-wrap items-end gap-3">
      <div><Field label="Marka adı" hint="1–80 karakter"><Input name="name" disabled={pending} defaultValue={initial?.name} placeholder="Örn. Pideci İnşaat" maxLength={80} pattern=".*\\S.*" className="w-56" required {...errorProps(displayState, "name", idPrefix)} /></Field><Err s={displayState} f="name" idPrefix={idPrefix} /></div>
      <div><Field label="Adres (slug)" hint="2–40 küçük harf, rakam veya tire; boşsa isimden üretilir"><Input name="slug" disabled={pending} defaultValue={initial?.slug} placeholder="pideci-insaat" minLength={2} maxLength={40} pattern="[a-z0-9][a-z0-9-]{1,39}" autoCapitalize="none" spellCheck={false} className="w-44" {...errorProps(displayState, "slug", idPrefix)} /></Field><Err s={displayState} f="slug" idPrefix={idPrefix} /></div>
      <Button ref={saveButtonRef} type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Marka ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Marka bilgileri kaydediliyor.</span>}
      {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}<Err s={displayState} />
    </form>
  );
}

export function ProductPicker({ brandId, products, selected }: { brandId: string; products: { id: string; name: string; category: string | null }[]; selected: Set<string> }) {
  const { state, pending, onSubmit } = useFormAction(setBrandProducts.bind(null, brandId), {} as BrandState);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as BrandState) : state;
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  const byCat = new Map<string, typeof products>();
  for (const p of products) {
    const k = p.category ?? "Diğer";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }
  return (
    <form onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="mt-2 space-y-3">
      <fieldset disabled={pending} aria-busy={pending} className="space-y-3">
      {[...byCat.entries()].map(([cat, items]) => (
        <div key={cat}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {items.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="product" value={p.id} defaultChecked={selected.has(p.id)} className="size-4 accent-[var(--color-brand)]" />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button ref={saveButtonRef} type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Menüyü kaydet"}</Button>
        {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}<Err s={displayState} />
      </div>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Marka menüsü kaydediliyor.</span>}
    </form>
  );
}
