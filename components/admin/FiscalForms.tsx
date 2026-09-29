"use client";
import { useState, useTransition } from "react";
import { resendFiscalMail, retryFiscal, saveFiscalSettings, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { Channel, ChannelModes, DocMode } from "@/lib/core/fiscal";

const CH_LABEL: Record<Channel, string> = { kasa: "Kasa (hızlı satış)", masa: "Masa", paket: "Paket servis", platform: "Platform siparişi" };
const Err = ({ s, f }: { s: FiscalState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-xs text-bad">{s.error}</p> : null);

export function FiscalSettingsForm({ initial, channels, fake }: {
  initial: { taxId: string; taxOffice: string; address: string; series: string; modes: ChannelModes; fakeFail: boolean };
  channels: readonly Channel[]; fake: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(saveFiscalSettings, {} as FiscalState);
  const [modes, setModes] = useState(initial.modes);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Field label="İşletme vergi no" hint="10 hane VKN ya da 11 hane TCKN (şahıs)"><Input name="taxId" inputMode="numeric" maxLength={11} defaultValue={initial.taxId} /></Field><Err s={state} f="taxId" /></div>
        <div><Field label="Vergi dairesi"><Input name="taxOffice" maxLength={80} defaultValue={initial.taxOffice} /></Field><Err s={state} f="taxOffice" /></div>
      </div>
      <div><Field label="İşletme adresi (faturada satıcı adresi)"><Textarea name="address" rows={2} maxLength={500} defaultValue={initial.address} /></Field><Err s={state} f="address" /></div>
      <div className="w-40"><Field label="Fatura serisi" hint="3 karakter, ör. CBP"><Input name="series" maxLength={3} defaultValue={initial.series} className="font-mono uppercase" /></Field><Err s={state} f="series" /></div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Kanal başına belge</h3>
        <p className="mb-3 text-sm text-muted">Bilgi fişi seçili kanalda da kasiyer satışta &quot;Fatura&quot; derse o satış e-Arşiv kesilir.</p>
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c} className="flex flex-wrap items-center gap-3">
              <span className="w-40 text-sm">{CH_LABEL[c]}</span>
              <input type="hidden" name={`mode-${c}`} value={modes[c]} />
              <div className="flex gap-1" role="group" aria-label={CH_LABEL[c]}>
                {([["info", "Bilgi fişi"], ["earsiv", "e-Arşiv"]] as [DocMode, string][]).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={modes[c] === v} onClick={() => setModes((m) => ({ ...m, [c]: v }))} className={`rounded-lg border px-3 py-2 text-sm ${modes[c] === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {fake && (
        <div className="rounded-lg border border-amber-300 bg-warn-soft p-3 text-sm">
          <p className="font-medium">TEST sağlayıcısı: kesilen belgelerin mali değeri yoktur.</p>
          <p className="mt-1 text-muted">Gerçek entegratör (Paraşüt/Uyumsoft/İzibiz) anahtarı gelince bağlanacak.</p>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="fakeFail" defaultChecked={initial.fakeFail} className="size-4 accent-[var(--color-brand)]" />Hata simülasyonu (her kesim hata verir)</label>
        </div>
      )}
      {state.error && !state.field && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
        {state.savedAt && !state.error && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
    </form>
  );
}

export function FiscalRowActions({ id, status, canMail, url }: { id: string; status: string; canMail: boolean; url: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FiscalState | null>(null);
  const run = (fn: () => Promise<FiscalState>) => start(async () => setMsg(await fn()));
  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs ${pending ? "opacity-60" : ""}`}>
      {(status === "pending" || status === "error") && <button type="button" disabled={pending} onClick={() => run(() => retryFiscal(id))} className="font-medium text-brand hover:underline">Yeniden dene</button>}
      {status === "issued" && canMail && <button type="button" disabled={pending} onClick={() => run(() => resendFiscalMail(id))} className="font-medium text-brand hover:underline">E-postayı gönder</button>}
      <a href={url} target="_blank" rel="noreferrer" className="underline">Sayfayı aç</a>
      {msg && <span role="status" className={msg.error ? "text-bad" : "text-ok"}>{msg.error ?? msg.info}</span>}
    </div>
  );
}
