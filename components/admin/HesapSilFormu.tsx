"use client";
// components/admin/HesapSilFormu.tsx — tehlikeli işlem: hesabı ve tüm veriyi kalıcı silme.
// Onay: işletme adı harfi harfine + hesap şifresi. Sunucu da aynı iki kontrolü yapar.

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { hesapSilAction, type VeriSilState } from "@/lib/core/veri-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function HesapSilFormu({ isletmeAdi }: { isletmeAdi: string }) {
  const { state, pending, onSubmit } = useFormAction(hesapSilAction, {} as VeriSilState);
  const [acik, setAcik] = useState(false);
  const [edited, setEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const displayState = edited || pending ? ({} as VeriSilState) : state;

  if (!acik) {
    return (
      <div className="mt-5 rounded-[14px] border border-bad/30 bg-bad-soft/40 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle aria-hidden className="size-4" />Hesabı ve tüm verileri sil</h2>
        <p className="mt-1 text-sm text-ink-2">İşletme, şubeler, personel, ürünler, satışlar, müşteriler ve e-Arşiv belgeleri kalıcı olarak silinir. <b>Geri alınamaz.</b> Önce veri kopyanızı indirin.</p>
        <Button type="button" variant="danger" className="mt-4" onClick={() => setAcik(true)}>Hesabı silmek istiyorum</Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onChangeCapture={() => setEdited(true)}
      onSubmit={(e) => { setEdited(false); onSubmit(e); }}
      aria-busy={pending}
      className="mt-5 space-y-3 rounded-[14px] border border-bad/40 bg-bad-soft/40 p-5"
    >
      <h2 className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle aria-hidden className="size-4" />Son onay</h2>
      <p className="text-sm text-ink-2">Devam ederseniz bu işlem geri alınamaz. Onaylamak için işletme adını (<b>{isletmeAdi}</b>) yazın ve hesap şifrenizi girin.</p>
      <Field label="İşletme adı">
        <Input name="onay" placeholder={isletmeAdi} autoComplete="off" disabled={pending} required aria-invalid={displayState.field === "onay" || undefined} />
      </Field>
      <Field label="Hesap şifreniz" hint="Hassas işlem — şifrenizi yeniden girin">
        <PasswordInput name="sifre" autoComplete="current-password" disabled={pending} required aria-invalid={displayState.field === "sifre" || undefined} />
      </Field>
      {displayState.error && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Siliniyor…" : "Kalıcı olarak sil"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => { setAcik(false); setEdited(false); }}>Vazgeç</Button>
      </div>
    </form>
  );
}
