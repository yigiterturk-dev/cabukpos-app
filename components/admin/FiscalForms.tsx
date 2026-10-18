"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { resendFiscalMail, retryFiscal, saveFiscalSettings, takeZReport, type FiscalState } from "@/lib/admin/fiscal-actions";
import { useFormAction } from "@/components/useFormAction";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { Select } from "@/components/Select";
import type { Channel, ChannelModes, DocMode } from "@/lib/core/fiscal";
import { OKC_PROVIDERS } from "@/lib/core/okc";

const CH_LABEL: Record<Channel, string> = { kasa: "Kasa (hızlı satış)", masa: "Masa", paket: "Paket servis", platform: "Platform siparişi" };
const Err = ({ s, f }: { s: FiscalState; f: string }) => (s.field === f && s.error ? <p id={`fiscal-${f}-error`} className="mt-1 break-words text-xs text-bad" role="alert" aria-live="assertive">{s.error}</p> : null);
const errorProps = (s: FiscalState, f: string) => s.field === f && s.error
  ? { "aria-invalid": true as const, "aria-describedby": `fiscal-${f}-error` }
  : {};

export function FiscalSettingsForm({ initial, channels, fake, blockEarsiv, okc }: {
  initial: { taxId: string; taxOffice: string; address: string; series: string; modes: ChannelModes; fakeFail: boolean };
  channels: readonly Channel[]; fake: boolean; blockEarsiv: boolean;
  okc?: { provider: string; serial: string; hasKey?: boolean; apiUrl?: string | null } | null;
}) {
  const { state, pending, onSubmit } = useFormAction(saveFiscalSettings, {} as FiscalState);
  const formRef = useRef<HTMLFormElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [edited, setEdited] = useState(false);
  const displayState = edited || pending ? ({} as FiscalState) : state;
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  useEffect(() => {
    if (pending || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.error, state.savedAt]);
  const [modes, setModes] = useState<ChannelModes>(() => blockEarsiv
    ? Object.fromEntries(channels.map((c) => [c, "info"])) as ChannelModes
    : initial.modes);
  const [okcOn, setOkcOn] = useState(!!okc);
  const [okcProvider, setOkcProvider] = useState(okc?.provider ?? OKC_PROVIDERS[0].value);
  const okcCloud = OKC_PROVIDERS.find((p) => p.value === okcProvider)?.cloud ?? false;
  return (
    <form ref={formRef} onChangeCapture={() => setEdited(true)} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Field label="İşletme vergi no" hint="10 hane VKN ya da 11 hane TCKN (şahıs)"><Input name="taxId" disabled={pending} inputMode="numeric" maxLength={11} pattern="([0-9]{10}|[0-9]{11})" defaultValue={initial.taxId} {...errorProps(displayState, "taxId")} /></Field><Err s={displayState} f="taxId" /></div>
        <div><Field label="Vergi dairesi" hint="e-Arşiv için gerekli · en fazla 80 karakter"><Input name="taxOffice" disabled={pending} maxLength={80} defaultValue={initial.taxOffice} {...errorProps(displayState, "taxOffice")} /></Field><Err s={displayState} f="taxOffice" /></div>
      </div>
      <div><Field label="İşletme adresi (faturada satıcı adresi)" hint="En fazla 500 karakter"><Textarea name="address" disabled={pending} rows={2} maxLength={500} defaultValue={initial.address} {...errorProps(displayState, "address")} /></Field><Err s={displayState} f="address" /></div>
      <div className="w-40"><Field label="Fatura serisi" hint="Tam 3 harf veya rakam, ör. CBP"><Input name="series" disabled={pending} maxLength={3} minLength={3} pattern="[A-Za-z0-9]{3}" defaultValue={initial.series} required className="font-mono uppercase" {...errorProps(displayState, "series")} /></Field><Err s={displayState} f="series" /></div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Kanal başına belge</h3>
        <p className="mb-3 text-sm text-muted">Bilgi fişi seçili kanalda da kasiyer satışta &quot;Fatura&quot; derse o satış e-Arşiv kesilir.</p>
        <div className="space-y-2">
          {channels.map((c) => (
            <fieldset key={c} className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-[10rem_auto] sm:items-center">
              <legend className="text-sm">{CH_LABEL[c]}</legend>
              <div className="flex gap-1">
                {([["info", "Bilgi fişi"], ["earsiv", "e-Arşiv"]] as [DocMode, string][]).map(([v, l]) => (
                  <label key={v} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${modes[c] === v ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"} ${v === "earsiv" && blockEarsiv ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                    <input type="radio" name={`mode-${c}`} value={v} checked={modes[c] === v} required disabled={pending || (v === "earsiv" && blockEarsiv)} onChange={() => { setEdited(true); setModes((m) => ({ ...m, [c]: v })); }} className="peer sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      {fake && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
          <p className="font-medium">TEST sağlayıcısı: kesilen belgelerin mali değeri yoktur.</p>
          <p className="mt-1 text-muted">Gerçek entegratör (Paraşüt/Uyumsoft/İzibiz) bağlanmadan e-Arşiv kullanılamaz; bilgi fişi satışa devam eder.</p>
          <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" name="fakeFail" disabled={pending} defaultChecked={initial.fakeFail} className="size-4 accent-brand" />Hata simülasyonu (her kesim hata verir)</label>
        </div>
      )}
      <div className="rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold">ÖKC / mali cihaz</h3>
        <p className="mt-1 text-sm text-muted">Kasa fişi ancak ÖKC imzasıyla yasal mali belge olur. Açıkken eşitlenen her satış mali fiş no ile künyelenir.</p>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="okcOn" disabled={pending} checked={okcOn} onChange={(e) => setOkcOn(e.target.checked)} className="size-4 accent-brand" />ÖKC bağlantısı açık</label>
        {okcOn && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="ÖKC sağlayıcısı">
                <Select disabled={pending} name="okcProvider" defaultValue={okcProvider} onChange={(value) => { setEdited(true); setOkcProvider(value); }} options={OKC_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} {...errorProps(displayState, "okcProvider")} />
              </Field>
              <Err s={displayState} f="okcProvider" />
            </div>
            <div>
              <Field label="Cihaz seri no" hint="ÖKC üzerine yazılı seri no, ör. TRA123456">
                  <Input name="okcSerial" disabled={pending} defaultValue={okc?.serial ?? ""} maxLength={20} minLength={okcOn ? 3 : undefined} pattern={okcOn ? "[A-Za-z0-9-]{3,20}" : undefined} className="font-mono uppercase" {...errorProps(displayState, "okcSerial")} />
              </Field>
              <Err s={displayState} f="okcSerial" />
            </div>
            {okcCloud && (
              <>
                <div className="sm:col-span-2">
                  <Field label="Çözücü API adresi (BYOK)" hint="Kiracının kendi hesabı; sandbox ya da canlı kök adres · en fazla 2.048 karakter">
                    <Input name="okcApiUrl" disabled={pending} defaultValue={okc?.apiUrl ?? ""} placeholder="https://..." inputMode="url" maxLength={2048} required {...errorProps(displayState, "okcApiUrl")} />
                  </Field>
                  <Err s={displayState} f="okcApiUrl" />
                </div>
                <div className="sm:col-span-2">
                  <Field label="API anahtarı" hint={okc?.hasKey ? "Kayıtlı (şifreli); değiştirmek için yenisini yazın" : "Çözücü hesabının API anahtarı, şifreli saklanır"}>
                    <PasswordInput name="okcApiKey" disabled={pending} autoComplete="off" minLength={8} placeholder={okc?.hasKey ? "••••••••" : ""} {...errorProps(displayState, "okcApiKey")} />
                  </Field>
                  <Err s={displayState} f="okcApiKey" />
                </div>
              </>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="okcFakeFail" disabled={pending} defaultChecked={false} className="size-4 accent-brand" />Hata simülasyonu (sandbox)</label>
          </div>
        )}
      </div>
      {displayState.error && !displayState.field && <p className="break-words text-sm text-bad" role="alert" aria-live="assertive">{displayState.error}</p>}
      <div className="flex items-center gap-3">
        <Button ref={saveButtonRef} type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
        {state.savedAt && !edited && !pending && !state.error && <span className="text-sm text-ok" role="status">Kaydedildi.</span>}
      </div>
      {pending && <p className="sr-only" role="status" aria-live="polite">Mali belge ve ÖKC ayarları kaydediliyor.</p>}
    </form>
  );
}

export function FiscalRowActions({ id, status, canMail, url }: { id: string; status: string; canMail: boolean; url: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FiscalState | null>(null);
  const msgRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (pending || !msg) return;
    const frame = window.requestAnimationFrame(() => msgRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [msg, pending]);
  const run = (fn: () => Promise<FiscalState>) => start(async () => {
    setMsg(null);
    try { setMsg(await fn()); }
    catch { setMsg({ error: "İşlem tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin." }); }
  });
  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      {(status === "pending" || status === "error") && <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => retryFiscal(id))} className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{pending ? "Deneniyor…" : "Yeniden dene"}</button>}
      {status === "issued" && canMail && <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => resendFiscalMail(id))} className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{pending ? "Gönderiliyor…" : "E-postayı gönder"}</button>}
      {pending && <span className="sr-only" role="status" aria-live="polite">{status === "issued" ? "Mali belge e-postası gönderiliyor." : "Mali belge yeniden kesiliyor."}</span>}
      <a href={url} target="_blank" rel="noreferrer" className="rounded px-1 underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sayfayı aç</a>
      {msg && <span ref={msgRef} tabIndex={-1} role={msg.error ? "alert" : "status"} aria-live={msg.error ? "assertive" : "polite"} className={`break-words outline-none focus-visible:ring-4 ${msg.error ? "text-bad focus-visible:ring-bad/30" : "text-ok focus-visible:ring-ok/30"}`}>{msg.error ?? msg.info}</span>}
    </div>
  );
}

export function OkcZReportForm() {
  const { state, pending, onSubmit } = useFormAction(takeZReport, {} as FiscalState);
  const infoRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (pending || !state.info) return;
    const frame = window.requestAnimationFrame(() => infoRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, state.info]);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <div>
        <h3 className="text-sm font-semibold">Gün sonu Z raporu</h3>
        <p className="mt-1 text-sm text-muted">Çözücüde mali günü kapatır; günün fiş toplamı Z no ile mühürlenir.</p>
      </div>
      <div className="ml-auto">
        <Button type="submit" disabled={pending}>{pending ? "Alınıyor…" : "Z raporu al"}</Button>
      </div>
      {pending && <p className="sr-only" role="status" aria-live="polite">Mali gün sonu Z raporu alınıyor.</p>}
      {state.error && <p className="w-full break-words text-sm text-bad" role="alert">{state.error}</p>}
      {state.info && <p ref={infoRef} tabIndex={-1} className="w-full text-sm text-ok outline-none focus-visible:ring-4 focus-visible:ring-ok/30" role="status" aria-live="polite">{state.info}</p>}
    </form>
  );
}
