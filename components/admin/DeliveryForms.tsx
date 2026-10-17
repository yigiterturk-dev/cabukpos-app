"use client";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { createConnection, pushCatalog, saveCode, saveCustomer, saveZone, sendTestOrder, setConnection, type DeliveryState } from "@/lib/admin/delivery-actions";
import { formatTL } from "@/lib/core/money";
import { useFormAction } from "@/components/useFormAction";
import { Select, type Option } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f, idPrefix = "delivery" }: { s: DeliveryState; f?: string; idPrefix?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p id={f ? `${idPrefix}-${f}-error` : undefined} className="mt-1 max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: DeliveryState, f: string, idPrefix = "delivery") => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `${idPrefix}-${f}-error` }
  : {};
const Saved = ({ s }: { s: DeliveryState }) => (s.savedAt ? <span className="shrink-0 text-sm text-ok" role="status">{s.info ?? "Kaydedildi."}</span> : null);
const tl = (k: number | undefined) => (k ? formatTL(k).replace(" ₺", "") : "");
const hm = (m: number | null | undefined) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

export function ZoneForm({ initial }: { initial?: { id: string; name: string; fee: number; minOrder: number; perKm: number | null; startMin: number | null; endMin: number | null } }) {
  const { state, pending, onSubmit } = useFormAction(saveZone.bind(null, initial?.id ?? null), {} as DeliveryState);
  const idPrefix = `delivery-zone-${useId()}`;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error || initial) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus());
  }, [initial, state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Bölge adı"><Input name="name" disabled={pending} defaultValue={initial?.name} placeholder="Merkez" className="w-40" required {...errorProps(state, "name", idPrefix)} /></Field><Err s={state} f="name" idPrefix={idPrefix} /></div>
        <div><Field label="Paket ücreti (TL)"><Input name="fee" disabled={pending} inputMode="decimal" defaultValue={tl(initial?.fee)} placeholder="0" className="w-24 text-right" {...errorProps(state, "fee", idPrefix)} /></Field><Err s={state} f="fee" idPrefix={idPrefix} /></div>
        <div><Field label="Asgari tutar (TL)"><Input name="minOrder" disabled={pending} inputMode="decimal" defaultValue={tl(initial?.minOrder)} placeholder="0" className="w-24 text-right" {...errorProps(state, "minOrder", idPrefix)} /></Field><Err s={state} f="minOrder" idPrefix={idPrefix} /></div>
        <div><Field label="Km başı (TL)" hint="boş = sabit"><Input name="perKm" disabled={pending} inputMode="decimal" defaultValue={tl(initial?.perKm ?? undefined)} placeholder="—" className="w-24 text-right" {...errorProps(state, "perKm", idPrefix)} /></Field><Err s={state} f="perKm" idPrefix={idPrefix} /></div>
        <div><Field label="Servis başlangıç" hint="boş = sınırsız"><Input name="start" type="time" disabled={pending} defaultValue={hm(initial?.startMin)} className="w-32" {...errorProps(state, "start", idPrefix)} /></Field><Err s={state} f="start" idPrefix={idPrefix} /></div>
        <div><Field label="Servis bitiş"><Input name="end" type="time" disabled={pending} defaultValue={hm(initial?.endMin)} className="w-32" {...errorProps(state, "end", idPrefix)} /></Field><Err s={state} f="end" idPrefix={idPrefix} /></div>
      </div>
      <Button type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Bölge ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Teslimat bölgesi kaydediliyor.</span>}
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function CustomerForm({ initial }: { initial: { id: string; name: string; note: string | null; marketingConsent: boolean } }) {
  const { state, pending, onSubmit } = useFormAction(saveCustomer.bind(null, initial.id), {} as DeliveryState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><Field label="Ad"><Input name="name" disabled={pending} defaultValue={initial.name} className="w-56" required {...errorProps(state, "name")} /></Field><Err s={state} f="name" /></div>
      <Field label="Not"><Input name="note" disabled={pending} defaultValue={initial.note ?? ""} placeholder="ör. zili çalmayın" className="w-72" /></Field>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="marketingConsent" disabled={pending} defaultChecked={initial.marketingConsent} className="size-4 accent-[var(--color-brand)]" />Pazarlama iletişimi için açık izin var</label>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Müşteri bilgileri kaydediliyor.</span>}
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function ConnectionForm({ platforms }: { platforms: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(createConnection, {} as DeliveryState);
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
      <div className="w-64"><Field label="Platform"><Select key={`${state.savedAt ?? 0}-${platforms.map((p) => p.value).join(",")}`} disabled={pending} name="platform" options={platforms} defaultValue={platforms[0]?.value} {...errorProps(state, "platform")} /></Field><Err s={state} f="platform" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Bağlanıyor…" : "Bağla"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform bağlantısı kaydediliyor.</span>}
      <Saved s={state} />
    </form>
  );
}

export function ConnectionToggles({ id, autoAccept, active }: { id: string; autoAccept: boolean; active: boolean }) {
  const [pending, start] = useTransition();
  const [values, setValues] = useState({ autoAccept, active });
  const [result, setResult] = useState<"saved" | "error" | null>(null);
  function update(patch: { autoAccept?: boolean; active?: boolean }) {
    const previous = values;
    setValues({ ...previous, ...patch });
    setResult(null);
    start(async () => {
      try {
        await setConnection(id, patch);
        setResult("saved");
      } catch {
        setValues(previous);
        setResult("error");
      }
    });
  }

  return (
    <div className={`flex flex-wrap gap-4 text-sm ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={values.autoAccept} disabled={pending} onChange={(e) => update({ autoAccept: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />Otomatik kabul (20 dk hazırlık, doğrudan mutfağa)</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={values.active} disabled={pending} onChange={(e) => update({ active: e.target.checked })} className="size-4 accent-[var(--color-brand)]" />Aktif</label>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform ayarları kaydediliyor.</span>}
      {!pending && result === "saved" && <span className="text-ok" role="status">Platform ayarları kaydedildi.</span>}
      {!pending && result === "error" && <span className="text-bad" role="alert" aria-live="assertive">Ayarlar kaydedilemedi. Bağlantını kontrol edip tekrar dene.</span>}
    </div>
  );
}

export function CodeForm({ connectionId, products }: { connectionId: string; products: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveCode.bind(null, connectionId), {} as DeliveryState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="code"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Platform ürün kodu"><Input name="code" disabled={pending} placeholder="LAH-01" className="w-40" required {...errorProps(state, "code")} /></Field><Err s={state} f="code" /></div>
        <div className="w-64"><Field label="Ürün"><Select disabled={pending} name="productId" options={products} placeholder="Ürün seçin" {...errorProps(state, "productId")} /></Field><Err s={state} f="productId" /></div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Eşleştiriliyor…" : "Eşle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform ürünü eşleştiriliyor.</span>}
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function TestOrderButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(sendTestOrder.bind(null, connectionId), {} as DeliveryState);
  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>{pending ? "Gönderiliyor…" : "Deneme siparişi gönder"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platforma deneme siparişi gönderiliyor.</span>}
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function PushCatalogButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(pushCatalog.bind(null, connectionId), {} as DeliveryState);
  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-3" data-testid="push-catalog">
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>{pending ? "Gönderiliyor…" : "Menü/fiyat/stok gönder"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Menü, fiyat ve stok bilgileri platforma gönderiliyor.</span>}
      <Saved s={state} /><Err s={state} />
    </form>
  );
}
