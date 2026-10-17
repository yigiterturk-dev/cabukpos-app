"use client";

import { useEffect, useRef, useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Select } from "@/components/Select";
import { buttonClass, Field, Input } from "@/components/ui";
import type { CouponCreateState } from "@/lib/admin/loyalty-actions";

function CouponFields({ unit, pending, state }: { unit: string; pending: boolean; state: CouponCreateState }) {
  const [kind, setKind] = useState<"yuzde" | "tutar" | "teslimat">("yuzde");
  const invalid = (name: string) => state.field === name && state.error ? { "aria-invalid": true as const, "aria-describedby": "coupon-create-error" } : {};
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {state.error && <p id="coupon-create-error" className="break-words text-sm text-bad sm:col-span-2 lg:col-span-4" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label="Kod" hint="3–24 harf veya rakam; boşluk ve tireler kayıtta kaldırılır"><Input name="code" placeholder="YAZ20" required className="uppercase" {...invalid("code")} /></Field>
        <Field label="Kupon türü"><Select disabled={pending} name="kind" defaultValue="yuzde" onChange={(value) => setKind(value as typeof kind)} {...invalid("kind")} options={[
          { value: "yuzde", label: "Yüzde indirim" },
          { value: "tutar", label: "Sabit tutar" },
          { value: "teslimat", label: "Teslimat bedava" },
        ]} /></Field>
        <Field label={kind === "yuzde" ? "İndirim yüzdesi" : "İndirim değeri"} hint={kind === "yuzde" ? "1–100%" : kind === "tutar" ? `1,00–50.000,00 ${unit}` : "Teslimat bedava kuponunda değer 0 olarak sabit."}>
          {kind === "teslimat"
            ? <Input name="value" value="0" readOnly className="bg-surface-2 text-muted" />
            : <Input key={kind} name="value" inputMode={kind === "yuzde" ? "numeric" : "decimal"} placeholder={kind === "yuzde" ? "20" : "50,00"} pattern={kind === "yuzde" ? "[0-9]{1,3}" : undefined} maxLength={kind === "yuzde" ? 3 : undefined} required {...invalid("value")} />}
        </Field>
        <Field label={`Alt sınır (${unit})`} hint="Sepet en az bu kadar olmalı"><Input name="minSubtotal" inputMode="decimal" defaultValue="0" {...invalid("minSubtotal")} /></Field>
        {kind === "yuzde" && <Field label={`Üst sınır (${unit})`} hint="Boş = sınırsız"><Input name="maxDiscount" inputMode="decimal" {...invalid("maxDiscount")} /></Field>}
        <Field label="Başlangıç"><Input name="startsAt" type="date" {...invalid("startsAt")} /></Field>
        <Field label="Bitiş"><Input name="endsAt" type="date" {...invalid("endsAt")} /></Field>
        <Field label="Toplam kullanım limiti" hint="Boş = sınırsız"><Input name="usageLimit" type="number" step={1} min={1} {...invalid("usageLimit")} /></Field>
        <Field label="Müşteri başına limit"><Input name="perCustomerLimit" type="number" step={1} min={1} max={2147483647} defaultValue="1" {...invalid("perCustomerLimit")} /></Field>
        <div className="sm:col-span-2"><Field label="Not"><Input name="note" /></Field></div>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} self-end disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kupon oluşturuluyor…" : "Kupon oluştur"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Kupon oluşturuluyor.</span>}
    </>
  );
}

export function CouponCreateForm({ action, unit }: { action: (state: CouponCreateState, formData: FormData) => Promise<CouponCreateState>; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as CouponCreateState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}><CouponFields unit={unit} pending={pending} state={state} /></form>;
}
