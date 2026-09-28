"use client";
// M8: kasada "Fatura" isteği — alıcı bilgisi. Doğrulama buyerSchema ile (bulutla aynı).
import { useState } from "react";
import { buyerSchema, NIHAI_TUKETICI, validateTaxId, type Buyer } from "@/lib/core/fiscal";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function InvoiceForm({ initial, onSave, onCancel }: { initial: Buyer | null; onSave: (b: Buyer) => void; onCancel: () => void }) {
  const [v, setV] = useState({ taxId: initial?.taxId ?? "", name: initial?.name ?? "", email: initial?.email ?? "", address: initial?.address ?? "" });
  const [touched, setTouched] = useState(false);
  const r = buyerSchema.safeParse(v);
  const err = (k: keyof typeof v) => (touched && !r.success ? r.error.issues.find((i) => i.path[0] === k)?.message : undefined);
  const kind = validateTaxId(v.taxId.trim());
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = () => { setTouched(true); if (r.success) onSave(r.data); };
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line p-3" aria-label="Fatura bilgisi">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fatura (e-Arşiv)</h3>
        <button type="button" onClick={() => setV((x) => ({ ...x, taxId: NIHAI_TUKETICI.taxId, name: NIHAI_TUKETICI.name, address: "" }))} className="text-sm text-brand underline">Nihai tüketici</button>
      </div>
      <Field label="VKN / TCKN" hint={kind === "vkn" ? "Vergi kimlik no (şirket)" : kind === "tckn" ? "T.C. kimlik no" : undefined}>
        <Input name="buyer-taxId" inputMode="numeric" maxLength={11} value={v.taxId} onChange={set("taxId")} autoComplete="off" />
      </Field>
      {err("taxId") && <p className="text-xs text-red-700">{err("taxId")}</p>}
      <Field label={kind === "vkn" ? "Unvan" : "Ad soyad"}><Input name="buyer-name" value={v.name} onChange={set("name")} maxLength={200} /></Field>
      {err("name") && <p className="text-xs text-red-700">{err("name")}</p>}
      <Field label="E-posta" hint="Fatura bağlantısı gönderilir (isteğe bağlı)"><Input name="buyer-email" type="email" value={v.email} onChange={set("email")} /></Field>
      {err("email") && <p className="text-xs text-red-700">{err("email")}</p>}
      <Field label={kind === "vkn" ? "Adres (zorunlu)" : "Adres"}><Textarea name="buyer-address" rows={2} value={v.address} onChange={set("address")} maxLength={500} /></Field>
      {err("address") && <p className="text-xs text-red-700">{err("address")}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">Faturasız</Button>
        <Button type="button" onClick={save} className="flex-1">Fatura bilgisini kaydet</Button>
      </div>
    </div>
  );
}
