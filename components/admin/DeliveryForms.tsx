"use client";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { createConnection, pushCatalog, saveCode, saveCustomer, saveZone, sendTestOrder, setConnection, type DeliveryState } from "@/lib/admin/delivery-actions";
import { formatPlain } from "@/lib/core/money";
import { useFormAction } from "@/components/useFormAction";
import { Select, type Option } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f, idPrefix = "delivery" }: { s: DeliveryState; f?: string; idPrefix?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p id={f ? `${idPrefix}-${f}-error` : undefined} className="mt-1 max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: DeliveryState, f: string, idPrefix = "delivery") => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `${idPrefix}-${f}-error` }
  : {};
const Saved = ({ s }: { s: DeliveryState }) => (s.savedAt ? <span className="shrink-0 text-sm text-ok" role="status">{s.info ?? "Kaydedildi."}</span> : null);
const money = (k: number | null | undefined) => (k ? formatPlain(k) : "");
const hm = (m: number | null | undefined) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

export function ZoneForm({ initial, currencyUnit }: { initial?: { id: string; name: string; fee: number; minOrder: number; perKm: number | null; startMin: number | null; endMin: number | null }; currencyUnit: string }) {
  const { state, pending, onSubmit } = useFormAction(saveZone.bind(null, initial?.id ?? null), {} as DeliveryState);
  const idPrefix = `delivery-zone-${useId()}`;
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as DeliveryState) : state;
  const isEditing = Boolean(initial);
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => {
      if (isEditing) saveButtonRef.current?.focus();
      else formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, pending, state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="flex flex-wrap items-end gap-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Bölge adı" hint="1–60 karakter"><Input name="name" maxLength={60} pattern=".*\\S.*" disabled={pending} defaultValue={initial?.name} placeholder="Merkez" className="w-40" required {...errorProps(displayState, "name", idPrefix)} /></Field><Err s={displayState} f="name" idPrefix={idPrefix} /></div>
        <div><Field label={`Paket ücreti (${currencyUnit})`} hint="0–21.474.836,47 · en çok 2 ondalık"><Input name="fee" disabled={pending} inputMode="decimal" maxLength={14} defaultValue={money(initial?.fee)} placeholder="0" className="w-24 text-right" {...errorProps(displayState, "fee", idPrefix)} /></Field><Err s={displayState} f="fee" idPrefix={idPrefix} /></div>
        <div><Field label={`Asgari tutar (${currencyUnit})`} hint="0–21.474.836,47 · en çok 2 ondalık"><Input name="minOrder" disabled={pending} inputMode="decimal" maxLength={14} defaultValue={money(initial?.minOrder)} placeholder="0" className="w-24 text-right" {...errorProps(displayState, "minOrder", idPrefix)} /></Field><Err s={displayState} f="minOrder" idPrefix={idPrefix} /></div>
        <div><Field label={`Km başı (${currencyUnit})`} hint="Boş = sabit · en çok 2 ondalık · üst sınır 21.474.836,47"><Input name="perKm" disabled={pending} inputMode="decimal" maxLength={14} defaultValue={money(initial?.perKm)} placeholder="—" className="w-24 text-right" {...errorProps(displayState, "perKm", idPrefix)} /></Field><Err s={displayState} f="perKm" idPrefix={idPrefix} /></div>
        <div><Field label="Servis başlangıç" hint="Saat aralığı için ikisini de girin; ikisi boş = sınırsız"><Input name="start" type="time" disabled={pending} defaultValue={hm(initial?.startMin)} className="w-32" {...errorProps(displayState, "start", idPrefix)} /></Field><Err s={displayState} f="start" idPrefix={idPrefix} /></div>
        <div><Field label="Servis bitiş" hint="Başlangıçla birlikte girin"><Input name="end" type="time" disabled={pending} defaultValue={hm(initial?.endMin)} className="w-32" {...errorProps(displayState, "end", idPrefix)} /></Field><Err s={displayState} f="end" idPrefix={idPrefix} /></div>
      </div>
      <Button ref={saveButtonRef} type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Bölge ekle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Teslimat bölgesi kaydediliyor.</span>}
      {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}<Err s={displayState} />
    </form>
  );
}

export function CustomerForm({ initial }: { initial: { id: string; name: string; note: string | null; marketingConsent: boolean } }) {
  const { state, pending, onSubmit } = useFormAction(saveCustomer.bind(null, initial.id), {} as DeliveryState);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as DeliveryState) : state;
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="flex flex-wrap items-end gap-3">
      <div><Field label="Ad" hint="1–120 karakter"><Input name="name" maxLength={120} pattern=".*\\S.*" disabled={pending} defaultValue={initial.name} className="w-56" required {...errorProps(displayState, "name")} /></Field><Err s={displayState} f="name" /></div>
      <Field label="Not" hint="İsteğe bağlı · en fazla 300 karakter"><Input name="note" maxLength={300} disabled={pending} defaultValue={initial.note ?? ""} placeholder="ör. zili çalmayın" className="w-72" /></Field>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="marketingConsent" disabled={pending} defaultChecked={initial.marketingConsent} className="size-4 accent-[var(--color-brand)]" />Pazarlama iletişimi için açık izin var</label>
      <Button ref={saveButtonRef} type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Müşteri bilgileri kaydediliyor.</span>}
      {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}<Err s={displayState} />
    </form>
  );
}

export function ConnectionForm({ platforms }: { platforms: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(createConnection, {} as DeliveryState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as DeliveryState) : state;
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('button[role="combobox"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="flex flex-wrap items-end gap-3">
      <div className="w-64"><Field label="Platform"><Select key={`${state.savedAt ?? 0}-${platforms.map((p) => p.value).join(",")}`} disabled={pending} name="platform" options={platforms} defaultValue={platforms[0]?.value} onChange={() => setEdited(true)} {...errorProps(displayState, "platform")} /></Field><Err s={displayState} f="platform" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Bağlanıyor…" : "Bağla"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform bağlantısı kaydediliyor.</span>}
      {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}
    </form>
  );
}

export function ConnectionToggles({ id, autoAccept, active }: { id: string; autoAccept: boolean; active: boolean }) {
  const [pending, start] = useTransition();
  const [values, setValues] = useState({ autoAccept, active });
  const [result, setResult] = useState<"saved" | "error" | null>(null);
  const changedControlRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (pending || !result) return;
    const frame = window.requestAnimationFrame(() => {
      const control = changedControlRef.current;
      if (control?.isConnected && !control.disabled) control.focus();
      else if (result === "error") errorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pending, result]);
  function update(patch: { autoAccept?: boolean; active?: boolean }, control: HTMLInputElement) {
    changedControlRef.current = control;
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
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={values.autoAccept} disabled={pending} onChange={(e) => update({ autoAccept: e.target.checked }, e.currentTarget)} className="size-4 accent-[var(--color-brand)]" />Otomatik kabul (20 dk hazırlık, doğrudan mutfağa)</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={values.active} disabled={pending} onChange={(e) => update({ active: e.target.checked }, e.currentTarget)} className="size-4 accent-[var(--color-brand)]" />Aktif</label>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform ayarları kaydediliyor.</span>}
      {!pending && result === "saved" && <span className="text-ok" role="status">Platform ayarları kaydedildi.</span>}
      {!pending && result === "error" && <span ref={errorRef} tabIndex={-1} className="text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">Ayarlar kaydedilemedi. Bağlantını kontrol edip tekrar dene.</span>}
    </div>
  );
}

export function CodeForm({ connectionId, products }: { connectionId: string; products: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveCode.bind(null, connectionId), {} as DeliveryState);
  const formRef = useRef<HTMLFormElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as DeliveryState) : state;
  useEffect(() => {
    if (state.error && state.field) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!state.savedAt || state.error) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input[name="code"]')?.focus());
  }, [state.error, state.field, state.savedAt]);
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="flex flex-wrap items-end gap-3">
      <div key={state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Platform ürün kodu" hint="1–60 karakter"><Input name="code" maxLength={60} disabled={pending} placeholder="LAH-01" className="w-40" required {...errorProps(displayState, "code")} /></Field><Err s={displayState} f="code" /></div>
        <div className="w-64"><Field label="Ürün"><Select disabled={pending} name="productId" options={products} placeholder="Ürün seçin" onChange={() => setEdited(true)} aria-required {...errorProps(displayState, "productId")} /></Field><Err s={displayState} f="productId" /></div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Eşleştiriliyor…" : "Eşle"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platform ürünü eşleştiriliyor.</span>}
      {state.savedAt && !edited && !pending && !state.error && <Saved s={state} />}<Err s={displayState} />
    </form>
  );
}

export function TestOrderButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(sendTestOrder.bind(null, connectionId), {} as DeliveryState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pending || (!state.savedAt && !state.error)) return;
    const frame = window.requestAnimationFrame(() => buttonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.savedAt, state.error]);
  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-3">
      <Button ref={buttonRef} type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>{pending ? "Gönderiliyor…" : "Deneme siparişi gönder"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Platforma deneme siparişi gönderiliyor.</span>}
      {!pending && <><Saved s={state} /><Err s={state} /></>}
    </form>
  );
}

export function PushCatalogButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(pushCatalog.bind(null, connectionId), {} as DeliveryState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pending || (!state.savedAt && !state.error)) return;
    const frame = window.requestAnimationFrame(() => buttonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.savedAt, state.error]);
  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-3" data-testid="push-catalog">
      <Button ref={buttonRef} type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined}>{pending ? "Gönderiliyor…" : "Menü/fiyat/stok gönder"}</Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Menü, fiyat ve stok bilgileri platforma gönderiliyor.</span>}
      {!pending && <><Saved s={state} /><Err s={state} /></>}
    </form>
  );
}
