"use client";

import { useEffect, useRef, useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Select } from "@/components/Select";
import { buttonClass, Field, Input } from "@/components/ui";
import type { CouponCreateState } from "@/lib/admin/loyalty-actions";

function CouponFields({ unit, pending, state }: { unit: string; pending: boolean; state: CouponCreateState }) {
  const [kind, setKind] = useState<"yuzde" | "tutar" | "teslimat">("yuzde");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const invalid = (name: string) => state.field === name && state.error ? { "aria-invalid": true as const, "aria-describedby": "coupon-create-error" } : {};
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {state.error && <p id="coupon-create-error" className="break-words text-sm text-bad sm:col-span-2 lg:col-span-4" role="alert" aria-live="assertive">{state.error}</p>}
        <Field label="Kod" hint="Boşluk ve tireler kaldırıldıktan sonra 3–24 harf veya rakam · en çok 48 karakter girilebilir"><Input name="code" placeholder="YAZ20" minLength={3} maxLength={48} pattern="[- ]*[A-Za-z0-9]([- ]*[A-Za-z0-9]){2,23}[- ]*" required className="uppercase" {...invalid("code")} /></Field>
        <Field label="Kupon türü"><Select disabled={pending} name="kind" defaultValue="yuzde" onChange={(value) => setKind(value as typeof kind)} {...invalid("kind")} options={[
          { value: "yuzde", label: "Yüzde indirim" },
          { value: "tutar", label: "Sabit tutar" },
          { value: "teslimat", label: "Teslimat bedava" },
        ]} /></Field>
        <Field label={kind === "yuzde" ? "İndirim yüzdesi" : "İndirim değeri"} hint={kind === "yuzde" ? "1–100%" : kind === "tutar" ? `1,00–50.000,00 ${unit} · en çok 2 ondalık` : "Teslimat bedava kuponunda değer 0 olarak sabit."}>
          {kind === "teslimat"
            ? <Input name="value" value="0" readOnly className="bg-surface-2 text-muted" />
            : <Input key={kind} name="value" inputMode={kind === "yuzde" ? "numeric" : "decimal"} placeholder={kind === "yuzde" ? "20" : "50,00"} pattern={kind === "yuzde" ? "[0-9]{1,3}" : undefined} maxLength={kind === "yuzde" ? 3 : 9} required {...invalid("value")} />}
        </Field>
        <Field label={`Alt sınır (${unit})`} hint="0–21.474.836,47 · en çok 2 ondalık"><Input name="minSubtotal" inputMode="decimal" maxLength={13} defaultValue="0" {...invalid("minSubtotal")} /></Field>
        {kind === "yuzde" && <Field label={`Üst sınır (${unit})`} hint="Boş = sınırsız · en çok 21.474.836,47 · en çok 2 ondalık"><Input name="maxDiscount" inputMode="decimal" maxLength={13} {...invalid("maxDiscount")} /></Field>}
        <Field label="Başlangıç" hint="İsteğe bağlı"><Input name="startsAt" type="date" value={startsAt} onChange={(e) => { const next = e.target.value; setStartsAt(next); if (endsAt && next && endsAt < next) setEndsAt(""); }} {...invalid("startsAt")} /></Field>
        <Field label="Bitiş" hint="Seçilen gün sonuna kadar geçerli; başlangıçtan önce olamaz"><Input name="endsAt" type="date" min={startsAt || undefined} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} {...invalid("endsAt")} /></Field>
        <Field label="Toplam kullanım limiti" hint="1–2.147.483.647 · boş = sınırsız"><Input name="usageLimit" type="number" step={1} min={1} max={2147483647} {...invalid("usageLimit")} /></Field>
        <Field label="Müşteri başına limit" hint="Boş = 1 · en çok 2.147.483.647"><Input name="perCustomerLimit" type="number" step={1} min={1} max={2147483647} defaultValue="1" {...invalid("perCustomerLimit")} /></Field>
        <div className="sm:col-span-2"><Field label="Not" hint="İsteğe bağlı · en fazla 200 karakter"><Input name="note" maxLength={200} /></Field></div>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} self-end disabled:cursor-wait disabled:opacity-60`}>{pending ? "Kupon oluşturuluyor…" : "Kupon oluştur"}</button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Kupon oluşturuluyor.</span>}
    </>
  );
}

export function CouponCreateForm({ action, unit }: { action: (state: CouponCreateState, formData: FormData) => Promise<CouponCreateState>; unit: string }) {
  const { state, pending, onSubmit } = useFormAction(action, {} as CouponCreateState);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as CouponCreateState) : state;
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} aria-busy={pending}><CouponFields unit={unit} pending={pending} state={displayState} /></form>;
}
