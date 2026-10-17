"use client";
// M8: kasada "Fatura" isteği — alıcı bilgisi. Doğrulama buyerSchema ile (bulutla aynı).
import { useState } from "react";
import { buyerSchema, NIHAI_TUKETICI, validateTaxId, type Buyer } from "@/lib/core/fiscal";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function InvoiceForm({ initial, onSave, onCancel, disabled = false }: { initial: Buyer | null; onSave: (b: Buyer) => void; onCancel: () => void; disabled?: boolean }) {
  const [v, setV] = useState({ taxId: initial?.taxId ?? "", name: initial?.name ?? "", email: initial?.email ?? "", address: initial?.address ?? "" });
  const [touched, setTouched] = useState(false);
  const r = buyerSchema.safeParse(v);
  const err = (k: keyof typeof v) => (touched && !r.success ? r.error.issues.find((i) => i.path[0] === k)?.message : undefined);
  const kind = validateTaxId(v.taxId.trim());
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = () => {
    setTouched(true);
    if (r.success) return onSave(r.data);
    const firstInvalid = r.error.issues[0]?.path[0];
    if (typeof firstInvalid === "string") requestAnimationFrame(() => document.getElementById(`buyer-${firstInvalid}`)?.focus());
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (!disabled) save(); }} className="mt-4 space-y-3 rounded-2xl border border-line bg-surface-2 p-4" aria-labelledby="invoice-form-title" aria-busy={disabled}>
      <fieldset disabled={disabled} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <div className="flex items-center justify-between">
        <h3 id="invoice-form-title" className="text-sm font-semibold">Fatura (e-Arşiv)</h3>
        <button type="button" onClick={() => setV((x) => ({ ...x, taxId: NIHAI_TUKETICI.taxId, name: NIHAI_TUKETICI.name, address: "" }))} className="inline-flex min-h-12 items-center text-sm text-brand underline">Nihai tüketici</button>
      </div>
      {touched && !r.success && <p className="text-sm text-bad" role="alert">Bilgileri kontrol edin. Hatalı alanlar işaretlendi.</p>}
      <Field label="VKN / TCKN" hint={kind === "vkn" ? "Vergi kimlik no (şirket)" : kind === "tckn" ? "T.C. kimlik no" : undefined}>
        <Input id="buyer-taxId" name="buyer-taxId" inputMode="numeric" maxLength={11} value={v.taxId} onChange={set("taxId")} autoComplete="off" autoFocus required aria-invalid={Boolean(err("taxId"))} aria-describedby={err("taxId") ? "buyer-taxId-error" : undefined} />
      </Field>
      {err("taxId") && <p id="buyer-taxId-error" className="text-xs text-bad">{err("taxId")}</p>}
      <Field label={kind === "vkn" ? "Unvan" : "Ad soyad"}><Input id="buyer-name" name="buyer-name" value={v.name} onChange={set("name")} maxLength={200} required aria-invalid={Boolean(err("name"))} aria-describedby={err("name") ? "buyer-name-error" : undefined} /></Field>
      {err("name") && <p id="buyer-name-error" className="text-xs text-bad">{err("name")}</p>}
      <Field label="E-posta" hint="Fatura bağlantısı gönderilir (isteğe bağlı)"><Input id="buyer-email" name="buyer-email" type="email" value={v.email} onChange={set("email")} aria-invalid={Boolean(err("email"))} aria-describedby={err("email") ? "buyer-email-error" : undefined} /></Field>
      {err("email") && <p id="buyer-email-error" className="text-xs text-bad">{err("email")}</p>}
      <Field label={kind === "vkn" ? "Adres (zorunlu)" : "Adres"}><Textarea id="buyer-address" name="buyer-address" rows={2} value={v.address} onChange={set("address")} maxLength={500} required={kind === "vkn"} aria-invalid={Boolean(err("address"))} aria-describedby={err("address") ? "buyer-address-error" : undefined} /></Field>
      {err("address") && <p id="buyer-address-error" className="text-xs text-bad">{err("address")}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="min-h-12 flex-1">Faturasız</Button>
        <Button type="submit" className="min-h-12 flex-1">Fatura bilgisini kaydet</Button>
      </div>
      </fieldset>
    </form>
  );
}
