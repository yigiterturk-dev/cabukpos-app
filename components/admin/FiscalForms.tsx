"use client";
import { useState, useTransition } from "react";
import { resendFiscalMail, retryFiscal, saveFiscalSettings, takeZReport, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Select } from "@/components/Select";
import type { Channel, ChannelModes, DocMode } from "@/lib/core/fiscal";
import { OKC_PROVIDERS } from "@/lib/core/okc";

const CH_LABEL: Record<Channel, string> = { kasa: "Kasa (hızlı satış)", masa: "Masa", paket: "Paket servis", platform: "Platform siparişi" };
const Err = ({ s, f }: { s: FiscalState; f: string }) => (s.field === f && s.error ? <p className="mt-1 text-xs text-bad">{s.error}</p> : null);

export function FiscalSettingsForm({ initial, channels, fake, blockEarsiv, okc }: {
  initial: { taxId: string; taxOffice: string; address: string; series: string; modes: ChannelModes; fakeFail: boolean };
  channels: readonly Channel[]; fake: boolean; blockEarsiv: boolean;
  okc?: { provider: string; serial: string; hasKey?: boolean; apiUrl?: string | null } | null;
}) {
  const { state, pending, onSubmit } = useFormAction(saveFiscalSettings, {} as FiscalState);
  const [modes, setModes] = useState<ChannelModes>(() => blockEarsiv
    ? Object.fromEntries(channels.map((c) => [c, "info"])) as ChannelModes
    : initial.modes);
  const [okcOn, setOkcOn] = useState(!!okc);
  const [okcProvider, setOkcProvider] = useState(okc?.provider ?? OKC_PROVIDERS[0].value);
  const okcCloud = OKC_PROVIDERS.find((p) => p.value === okcProvider)?.cloud ?? false;
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
                  <button key={v} type="button" aria-pressed={modes[c] === v} disabled={v === "earsiv" && blockEarsiv} onClick={() => setModes((m) => ({ ...m, [c]: v }))} className={`rounded-lg border px-3 py-2 text-sm ${modes[c] === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"} ${v === "earsiv" && blockEarsiv ? "cursor-not-allowed opacity-50" : ""}`}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {fake && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
          <p className="font-medium">TEST sağlayıcısı: kesilen belgelerin mali değeri yoktur.</p>
          <p className="mt-1 text-muted">Gerçek entegratör (Paraşüt/Uyumsoft/İzibiz) bağlanmadan e-Arşiv kullanılamaz; bilgi fişi satışa devam eder.</p>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="fakeFail" defaultChecked={initial.fakeFail} className="size-4 accent-brand" />Hata simülasyonu (her kesim hata verir)</label>
        </div>
      )}
      <div className="rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold">ÖKC / mali cihaz</h3>
        <p className="mt-1 text-sm text-muted">Kasa fişi ancak ÖKC imzasıyla yasal mali belge olur. Açıkken eşitlenen her satış mali fiş no ile künyelenir.</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="okcOn" checked={okcOn} onChange={(e) => setOkcOn(e.target.checked)} className="size-4 accent-brand" />ÖKC bağlantısı açık</label>
        {okcOn && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="Sağlayıcı">
                <Select name="okcProvider" defaultValue={okcProvider} onChange={setOkcProvider} options={OKC_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} />
              </Field>
              <Err s={state} f="okcProvider" />
            </div>
            <div>
              <Field label="Cihaz seri no" hint="ÖKC üzerine yazılı seri no, ör. TRA123456">
                <Input name="okcSerial" defaultValue={okc?.serial ?? ""} maxLength={20} className="font-mono uppercase" />
              </Field>
              <Err s={state} f="okcSerial" />
            </div>
            {okcCloud && (
              <>
                <div className="sm:col-span-2">
                  <Field label="Çözücü API adresi (BYOK)" hint="Kiracının kendi hesabı; sandbox ya da canlı kök adres">
                    <Input name="okcApiUrl" defaultValue={okc?.apiUrl ?? ""} placeholder="https://..." inputMode="url" />
                  </Field>
                  <Err s={state} f="okcApiUrl" />
                </div>
                <div className="sm:col-span-2">
                  <Field label="API anahtarı" hint={okc?.hasKey ? "Kayıtlı (şifreli); değiştirmek için yenisini yazın" : "Çözücü hesabının API anahtarı, şifreli saklanır"}>
                    <Input name="okcApiKey" type="password" autoComplete="off" placeholder={okc?.hasKey ? "••••••••" : ""} />
                  </Field>
                  <Err s={state} f="okcApiKey" />
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="okcFakeFail" defaultChecked={false} className="size-4 accent-brand" />Hata simülasyonu (sandbox)</label>
          </div>
        )}
      </div>
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

export function OkcZReportForm() {
  const { state, pending, onSubmit } = useFormAction(takeZReport, {} as FiscalState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <div>
        <h3 className="text-sm font-semibold">Gün sonu Z raporu</h3>
        <p className="mt-1 text-sm text-muted">Çözücüde mali günü kapatır; günün fiş toplamı Z no ile mühürlenir.</p>
      </div>
      <div className="ml-auto">
        <Button type="submit" disabled={pending}>{pending ? "Alınıyor…" : "Z raporu al"}</Button>
      </div>
      {state.error && <p className="w-full text-sm text-bad" role="alert">{state.error}</p>}
      {state.info && <p className="w-full text-sm text-ok" role="status">{state.info}</p>}
    </form>
  );
}
