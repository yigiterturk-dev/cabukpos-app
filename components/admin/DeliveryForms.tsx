"use client";
import { useActionState, useTransition } from "react";
import { createConnection, pushCatalog, saveCode, saveCustomer, saveZone, sendTestOrder, setConnection, type DeliveryState } from "@/lib/admin/delivery-actions";
import { formatTL } from "@/lib/core/money";
import { useFormAction } from "@/components/useFormAction";
import { Select, type Option } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

const Err = ({ s, f }: { s: DeliveryState; f?: string }) => (s.error && (f ? s.field === f : !s.field) ? <p className="mt-1 text-sm text-bad">{s.error}</p> : null);
const Saved = ({ s }: { s: DeliveryState }) => (s.savedAt ? <span className="text-sm text-ok">{s.info ?? "Kaydedildi."}</span> : null);
const tl = (k: number | undefined) => (k ? formatTL(k).replace(" ₺", "") : "");
const hm = (m: number | null | undefined) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

export function ZoneForm({ initial }: { initial?: { id: string; name: string; fee: number; minOrder: number; perKm: number | null; startMin: number | null; endMin: number | null } }) {
  const { state, pending, onSubmit } = useFormAction(saveZone.bind(null, initial?.id ?? null), {} as DeliveryState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={initial?.id ?? state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Bölge adı"><Input name="name" defaultValue={initial?.name} placeholder="Merkez" className="w-40" required /></Field><Err s={state} f="name" /></div>
        <div><Field label="Paket ücreti (TL)"><Input name="fee" inputMode="decimal" defaultValue={tl(initial?.fee)} placeholder="0" className="w-24 text-right" /></Field><Err s={state} f="fee" /></div>
        <div><Field label="Asgari tutar (TL)"><Input name="minOrder" inputMode="decimal" defaultValue={tl(initial?.minOrder)} placeholder="0" className="w-24 text-right" /></Field><Err s={state} f="minOrder" /></div>
        <div><Field label="Km başı (TL)" hint="boş = sabit"><Input name="perKm" inputMode="decimal" defaultValue={tl(initial?.perKm ?? undefined)} placeholder="—" className="w-24 text-right" /></Field><Err s={state} f="perKm" /></div>
        <div><Field label="Servis başlangıç" hint="boş = sınırsız"><Input name="start" defaultValue={hm(initial?.startMin)} placeholder="11:00" className="w-24" /></Field><Err s={state} f="start" /></div>
        <div><Field label="Servis bitiş"><Input name="end" defaultValue={hm(initial?.endMin)} placeholder="23:00" className="w-24" /></Field><Err s={state} f="end" /></div>
      </div>
      <Button type="submit" variant={initial ? "ghost" : "primary"} disabled={pending}>{initial ? "Kaydet" : "Bölge ekle"}</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function CustomerForm({ initial }: { initial: { id: string; name: string; note: string | null; marketingConsent: boolean } }) {
  const { state, pending, onSubmit } = useFormAction(saveCustomer.bind(null, initial.id), {} as DeliveryState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div><Field label="Ad"><Input name="name" defaultValue={initial.name} className="w-56" required /></Field><Err s={state} f="name" /></div>
      <Field label="Not"><Input name="note" defaultValue={initial.note ?? ""} placeholder="ör. zili çalmayın" className="w-72" /></Field>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="marketingConsent" defaultChecked={initial.marketingConsent} className="size-4 accent-[var(--color-brand)]" />Pazarlama iletişimi için açık izin var</label>
      <Button type="submit" variant="secondary" disabled={pending}>Kaydet</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function ConnectionForm({ platforms }: { platforms: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(createConnection, {} as DeliveryState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-64"><div className="mb-1.5 text-sm font-medium">Platform</div><Select name="platform" options={platforms} defaultValue={platforms[0]?.value} /><Err s={state} f="platform" /></div>
      <Button type="submit" disabled={pending}>Bağla</Button>
      <Saved s={state} />
    </form>
  );
}

export function ConnectionToggles({ id, autoAccept, active }: { id: string; autoAccept: boolean; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className={`flex flex-wrap gap-4 text-sm ${pending ? "opacity-60" : ""}`}>
      <label className="flex items-center gap-2"><input type="checkbox" checked={autoAccept} onChange={(e) => start(() => setConnection(id, { autoAccept: e.target.checked }))} className="size-4 accent-[var(--color-brand)]" />Otomatik kabul (20 dk hazırlık, doğrudan mutfağa)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => start(() => setConnection(id, { active: e.target.checked }))} className="size-4 accent-[var(--color-brand)]" />Aktif</label>
    </div>
  );
}

export function CodeForm({ connectionId, products }: { connectionId: string; products: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(saveCode.bind(null, connectionId), {} as DeliveryState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div key={state.savedAt ?? 0} className="flex flex-wrap items-end gap-3">
        <div><Field label="Platform ürün kodu"><Input name="code" placeholder="LAH-01" className="w-40" required /></Field><Err s={state} f="code" /></div>
        <div className="w-64"><div className="mb-1.5 text-sm font-medium">Ürün</div><Select name="productId" options={products} placeholder="Ürün seçin" /><Err s={state} f="productId" /></div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>Eşle</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function TestOrderButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(sendTestOrder.bind(null, connectionId), {} as DeliveryState);
  return (
    <form action={dispatch} className="flex items-center gap-3">
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Gönderiliyor…" : "Deneme siparişi gönder"}</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}

export function PushCatalogButton({ connectionId }: { connectionId: string }) {
  const [state, dispatch, pending] = useActionState(pushCatalog.bind(null, connectionId), {} as DeliveryState);
  return (
    <form action={dispatch} className="flex items-center gap-3" data-testid="push-catalog">
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Gönderiliyor…" : "Menü/fiyat/stok gönder"}</Button>
      <Saved s={state} /><Err s={state} />
    </form>
  );
}
