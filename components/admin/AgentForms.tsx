"use client";
import { useActionState, useEffect, useId, useRef, useState, type SetStateAction } from "react";
import { createAgent, saveAgentConfig, type AgentState } from "@/lib/admin/agent-actions";
import { PRINTER_ROLES, TRANSPORTS, type AgentConfig, type LogoConfig, type PrinterConfig } from "@/lib/agent/config";
import { fromBase64 } from "@/lib/core/escpos";
import { MAX_LOGO_PNG_BYTES, pngToLogo } from "@/lib/core/png";
import { useFormAction } from "@/components/useFormAction";
import { Select } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

function CodeBox({ s }: { s: AgentState }) {
  const codeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!s.code && !s.error) return;
    const frame = window.requestAnimationFrame(() => (codeRef.current ?? errorRef.current)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [s.code, s.error]);
  if (!s.code) return s.error && !s.field ? <p ref={errorRef} tabIndex={-1} className="mt-2 break-words text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{s.error}</p> : null;
  return (
    <div ref={codeRef} tabIndex={-1} className="mt-4 rounded-xl border border-brand bg-brand-soft p-4 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">
      <div className="text-sm">{s.agentName} için eşleme kodu</div>
      <div data-testid="agent-code" className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-brand">{s.code}</div>
      <p className="mt-2 text-sm text-ink-2">
        Kasadaki bilgisayarda: <code className="rounded bg-surface px-1">node cabukpos-agent.cjs pair {s.code}</code>, ardından <code className="rounded bg-surface px-1">install</code>.{" "}
        {new Date(s.expiresAt!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })} saatine kadar geçerli.
      </p>
    </div>
  );
}

export function AgentCreateForm() {
  const { state, pending, onSubmit } = useFormAction(createAgent, {} as AgentState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}>
      <div className="flex flex-wrap items-start gap-3">
        <div><Field label="Bilgisayar adı" hint="2–40 karakter"><Input key={state.code ?? "agent-name"} name="name" minLength={2} maxLength={40} pattern=".*\\S.*\\S.*" placeholder="Kasa PC" required disabled={pending} aria-invalid={state.field === "name" && !!state.error || undefined} aria-describedby={state.field === "name" && state.error ? "agent-name-error" : undefined} /></Field>{state.field === "name" && <p id="agent-name-error" className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}</div>
        <Button type="submit" disabled={pending} className="mt-6">{pending ? "Ekleniyor…" : "Ajan ekle"}</Button>
      </div>
      <CodeBox s={state} />
    </form>
  );
}

export function AgentPairButton({ action }: { action: () => Promise<AgentState> }) {
  const [state, dispatch, pending] = useActionState(action, {} as AgentState);
  return (
    <div>
      <form action={dispatch} aria-busy={pending}>
        <button disabled={pending} aria-busy={pending || undefined} className="inline-flex min-h-11 items-center rounded-lg px-2.5 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{pending ? "Kod üretiliyor…" : "Yeni eşleme kodu"}</button>
        {pending && <span className="sr-only" role="status" aria-live="polite">Ajan için yeni eşleme kodu üretiliyor.</span>}
      </form>
      <CodeBox s={state} />
    </div>
  );
}

const newPrinter = (n: number): PrinterConfig => ({ id: `p${n}`, name: n === 1 ? "Fiş yazıcısı" : `Yazıcı ${n}`, role: "fis", transport: "ag", address: "", width: 80, codepage: "pc857", brand: "genel", drawer: n === 1 });

function LogoPreview({ logo }: { logo: LogoConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    cv.width = logo.w; cv.height = logo.h;
    const bytes = fromBase64(logo.data), stride = logo.w / 8;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#000";
    for (let y = 0; y < logo.h; y++) for (let x = 0; x < logo.w; x++) if (bytes[y * stride + (x >> 3)] & (0x80 >> (x & 7))) ctx.fillRect(x, y, 1, 1);
  }, [logo]);
  return <canvas ref={ref} className="h-24 w-auto border border-line bg-surface" style={{ imageRendering: "pixelated" }} aria-label="Logo önizleme" data-testid="logo-preview" />;
}
function Seg<T extends string | number>({ value, options, onChange, label, disabled = false }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="m-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <label key={String(o.value)} className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${value === o.value ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AgentConfigForm({ agentId, initial }: { agentId: string; initial: AgentConfig }) {
  const { state, pending, onSubmit } = useFormAction(saveAgentConfig.bind(null, agentId), {} as AgentState);
  const [c, setConfig] = useState<AgentConfig>(initial);
  const [edited, setEdited] = useState(false);
  const setC = (next: SetStateAction<AgentConfig>) => { setEdited(true); setConfig(next); };
  const setP = (i: number, patch: Partial<PrinterConfig>) => setC({ ...c, printers: c.printers.map((p, j) => (j === i ? { ...p, ...patch } : patch.drawer ? { ...p, drawer: false } : p)) });
  const nextN = () => { let n = 1; while (c.printers.some((p) => p.id === `p${n}`)) n++; return n; };
  const sc = c.scale;
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const addPrinterRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pending || logoBusy || !state.savedAt || state.error) return;
    const frame = window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending, logoBusy, state.error, state.savedAt]);
  const onLogo = async (f: File | undefined) => {
    setEdited(true);
    setLogoErr(null);
    if (!f) return;
    if (f.size > MAX_LOGO_PNG_BYTES) { setLogoErr("PNG dosyası en fazla 20 MB olabilir."); return; }
    setLogoBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const width = c.printers.find((p) => p.role === "fis")?.width ?? 80;
      const logo = await pngToLogo(bytes, width);
      setC((current) => ({ ...current, logo }));
    } catch (e) { setLogoErr(e instanceof Error ? e.message : "Logo okunamadı."); }
    finally { setLogoBusy(false); }
  };
  return (
    <form ref={formRef} onSubmit={(e) => { setEdited(false); onSubmit(e); }} className="space-y-5" data-testid={`agent-config-${agentId}`}>
      <input type="hidden" name="config" value={JSON.stringify(c)} />
      <p className="sr-only" role="status" aria-live="polite">{logoBusy ? "Logo hazırlanıyor." : pending ? "Donanım ayarları kaydediliyor." : ""}</p>
      <fieldset disabled={pending || logoBusy} aria-busy={pending || logoBusy} className="space-y-5">
      <div className="space-y-4">
        {c.printers.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-line p-4" data-testid={`printer-${p.id}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Yazıcı adı" hint="1–40 karakter"><Input maxLength={40} pattern=".*\S.*" required value={p.name} onChange={(e) => setP(i, { name: e.target.value })} /></Field>
              <div><div className="mb-1.5 text-sm font-medium">Görev</div><Seg label="Görev" value={p.role} options={PRINTER_ROLES} onChange={(v) => setP(i, { role: v })} disabled={pending || logoBusy} /></div>
              <Field label="Bağlantı"><Select disabled={pending || logoBusy} options={TRANSPORTS.map((t) => ({ value: t.value, label: t.label }))} defaultValue={p.transport} onChange={(v) => setP(i, { transport: v as PrinterConfig["transport"] })} /></Field>
              <Field label="Yazıcı adresi" hint={`${TRANSPORTS.find((t) => t.value === p.transport)?.hint ?? ""} · en fazla 200 karakter`}><Input maxLength={200} pattern=".*\S.*" value={p.address} onChange={(e) => setP(i, { address: e.target.value })} required /></Field>
              <div><div className="mb-1.5 text-sm font-medium">Kâğıt</div><Seg label="Kâğıt" value={p.width} options={[{ value: 80, label: "80 mm" }, { value: 58, label: "58 mm" }] as const} onChange={(v) => setP(i, { width: v })} disabled={pending || logoBusy} /></div>
              <div><div className="mb-1.5 text-sm font-medium">Türkçe karakter</div><Seg label="Kod sayfası" value={p.codepage} options={[{ value: "pc857", label: "PC857" }, { value: "ascii", label: "Türkçesiz (ç→c)" }] as const} onChange={(v) => setP(i, { codepage: v })} disabled={pending || logoBusy} /></div>
              <div><div className="mb-1.5 text-sm font-medium">Marka</div><Seg label="Marka" value={p.brand} options={[{ value: "genel", label: "Genel" }, { value: "xprinter", label: "XPrinter" }, { value: "epson", label: "Epson" }] as const} onChange={(v) => setP(i, { brand: v })} disabled={pending || logoBusy} /></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.drawer} onChange={(e) => setP(i, { drawer: e.target.checked })} /> Para çekmecesi bu yazıcıya bağlı</label>
              <button type="button" aria-label={`${p.name || "Yazıcı"} yazıcısını kaldır`} disabled={pending || logoBusy} className="ml-auto inline-flex min-h-11 items-center rounded-lg px-2.5 text-bad underline outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" onClick={() => { setC((current) => ({ ...current, printers: current.printers.filter((printer) => printer.id !== p.id) })); requestAnimationFrame(() => { const controls = formRef.current?.querySelectorAll<HTMLElement>('[data-testid^="printer-"] [role="combobox"]'); (controls?.[Math.min(i, controls.length - 1)] ?? addPrinterRef.current)?.focus(); }); }}>Yazıcıyı kaldır</button>
            </div>
          </div>
        ))}
        {c.printers.length < 8 && <button ref={addPrinterRef} type="button" disabled={pending || logoBusy} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60" onClick={() => { setC((current) => ({ ...current, printers: [...current.printers, newPrinter(nextN())] })); requestAnimationFrame(() => { const rows = formRef.current?.querySelectorAll<HTMLElement>('[data-testid^="printer-"]'); rows?.[rows.length - 1]?.querySelector<HTMLInputElement>("input")?.focus(); }); }}>+ Yazıcı ekle</button>}
      </div>

      <div className="rounded-xl border border-line p-4" data-testid="agent-logo">
        <div className="mb-1.5 text-sm font-medium">Fiş logosu</div>
        <p className="mb-3 text-sm text-muted">PNG dosyası (en fazla 20 MB ve 2 megapiksel); kağıt genişliğine sığdırılır, siyah-beyaza çevrilir. Fişin üstünde işletme adından önce basılır.</p>
        <div className="flex flex-wrap items-center gap-4" aria-busy={logoBusy}>
          {c.logo && <LogoPreview logo={c.logo} />}
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            {logoBusy ? "Logo hazırlanıyor…" : c.logo ? "Değiştir…" : "PNG yükle"}
            <input type="file" accept="image/png" className="sr-only" disabled={pending || logoBusy} onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {c.logo && <button type="button" disabled={pending || logoBusy} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-bad underline outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" onClick={() => setC({ ...c, logo: null })}>Logoyu kaldır</button>}
          {c.logo && <span className="text-sm text-muted">{c.logo.w}×{c.logo.h} nokta</span>}
        </div>
        {logoErr && <p className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{logoErr}</p>}
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="mb-1.5 text-sm font-medium">Terazi</div>
        <Seg label="Terazi" value={sc.kind} options={[{ value: "yok", label: "Yok" }, { value: "seri", label: "Seri port (COM)" }, { value: "tcp", label: "Ağ (IP)" }] as const} disabled={pending || logoBusy}
          onChange={(k) => setC({ ...c, scale: k === "yok" ? { kind: "yok" } : k === "seri" ? { kind: "seri", port: "COM1", baud: 9600, request: "enq" } : { kind: "tcp", host: "", port: 4001, request: "enq" } })} />
        {sc.kind === "seri" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Terazi portu" hint="COM3 ya da /dev/ttyUSB0"><Input value={sc.port} onChange={(e) => setC({ ...c, scale: { ...sc, port: e.target.value } })} /></Field>
            <Field label="Hız"><Select disabled={pending || logoBusy} options={[2400, 4800, 9600, 19200].map((b) => ({ value: String(b), label: `${b} baud` }))} defaultValue={String(sc.baud)} onChange={(v) => setC({ ...c, scale: { ...sc, baud: Number(v) } })} /></Field>
          </div>
        )}
        {sc.kind === "tcp" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Terazi IP / ana makine" hint="IP adresi ya da ağ adı · en fazla 100 karakter"><Input maxLength={100} pattern=".*\S.*" required value={sc.host} onChange={(e) => setC({ ...c, scale: { ...sc, host: e.target.value } })} /></Field>
            <Field label="Terazi port" hint="1–65.535"><Input type="number" inputMode="numeric" min={1} max={65535} step={1} value={String(sc.port)} onChange={(e) => setC({ ...c, scale: { ...sc, port: Number(e.target.value) || 0 } })} /></Field>
          </div>
        )}
        {sc.kind !== "yok" && (
          <div className="mt-3"><div className="mb-1.5 text-sm font-medium">Okuma isteği</div><Seg label="Okuma isteği" value={sc.request} options={[{ value: "enq", label: "ENQ (çoğu terazi)" }, { value: "w", label: "W komutu" }, { value: "yok", label: "Sürekli gönderir" }] as const} onChange={(v) => setC({ ...c, scale: { ...sc, request: v } })} disabled={pending || logoBusy} /></div>
        )}
      </div>

      <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={c.autoPrint} onChange={(e) => setC({ ...c, autoPrint: e.target.checked })} /> Satıştan sonra fişi kendiliğinden yazdır</label>
      <div className="flex flex-wrap items-center gap-3">
        <Button ref={saveButtonRef} type="submit" disabled={pending || logoBusy}>{pending ? "Kaydediliyor…" : logoBusy ? "Logo hazırlanıyor…" : "Donanımı kaydet"}</Button>
        {state.savedAt && !edited && !pending && !state.error && <span className="min-w-0 max-w-full text-sm text-ok" role="status">Kaydedildi; ajan bir dakika içinde alır.</span>}
        {state.error && !edited && !pending && <span className="min-w-0 max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span>}
      </div>
      </fieldset>
    </form>
  );
}
