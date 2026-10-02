"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createAgent, saveAgentConfig, type AgentState } from "@/lib/admin/agent-actions";
import { PRINTER_ROLES, TRANSPORTS, type AgentConfig, type LogoConfig, type PrinterConfig } from "@/lib/agent/config";
import { fromBase64 } from "@/lib/core/escpos";
import { pngToLogo } from "@/lib/core/png";
import { useFormAction } from "@/components/useFormAction";
import { Select } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";

function CodeBox({ s }: { s: AgentState }) {
  if (!s.code) return s.error && !s.field ? <p className="mt-2 text-sm text-bad">{s.error}</p> : null;
  return (
    <div className="mt-4 rounded-xl border border-brand bg-brand-soft p-4">
      <div className="text-sm">{s.agentName} için eşleme kodu</div>
      <div data-testid="agent-code" className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-brand">{s.code}</div>
      <p className="mt-2 text-sm text-ink-2">
        Kasadaki bilgisayarda: <code className="rounded bg-white px-1">node cabukpos-agent.cjs pair {s.code}</code>, ardından <code className="rounded bg-white px-1">install</code>.{" "}
        {new Date(s.expiresAt!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })} saatine kadar geçerli.
      </p>
    </div>
  );
}

export function AgentCreateForm() {
  const { state, pending, onSubmit } = useFormAction(createAgent, {} as AgentState);
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-wrap items-start gap-3">
        <div><Field label="Bilgisayar adı"><Input name="name" placeholder="Kasa PC" required /></Field>{state.field === "name" && <p className="mt-1 text-sm text-bad">{state.error}</p>}</div>
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
      <form action={dispatch}><button disabled={pending} className="font-medium text-brand hover:underline">Yeni eşleme kodu</button></form>
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
  return <canvas ref={ref} className="h-24 w-auto border border-line bg-white" style={{ imageRendering: "pixelated" }} aria-label="Logo önizleme" data-testid="logo-preview" />;
}
const Seg = <T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) => (
  <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`rounded-lg border px-3 py-2 text-sm ${value === o.value ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`}>{o.label}</button>
    ))}
  </div>
);

export function AgentConfigForm({ agentId, initial }: { agentId: string; initial: AgentConfig }) {
  const { state, pending, onSubmit } = useFormAction(saveAgentConfig.bind(null, agentId), {} as AgentState);
  const [c, setC] = useState<AgentConfig>(initial);
  const setP = (i: number, patch: Partial<PrinterConfig>) => setC({ ...c, printers: c.printers.map((p, j) => (j === i ? { ...p, ...patch } : patch.drawer ? { ...p, drawer: false } : p)) });
  const nextN = () => { let n = 1; while (c.printers.some((p) => p.id === `p${n}`)) n++; return n; };
  const sc = c.scale;
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const onLogo = async (f: File | undefined) => {
    setLogoErr(null);
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const width = c.printers.find((p) => p.role === "fis")?.width ?? 80;
      setC({ ...c, logo: await pngToLogo(bytes, width) });
    } catch (e) { setLogoErr(e instanceof Error ? e.message : "Logo okunamadı."); }
  };
  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid={`agent-config-${agentId}`}>
      <input type="hidden" name="config" value={JSON.stringify(c)} />
      <div className="space-y-4">
        {c.printers.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-line p-4" data-testid={`printer-${p.id}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ad"><Input value={p.name} onChange={(e) => setP(i, { name: e.target.value })} aria-label="Yazıcı adı" /></Field>
              <div><div className="mb-1.5 text-sm font-medium">Görev</div><Seg label="Görev" value={p.role} options={PRINTER_ROLES} onChange={(v) => setP(i, { role: v })} /></div>
              <div><div className="mb-1.5 text-sm font-medium">Bağlantı</div><Select options={TRANSPORTS.map((t) => ({ value: t.value, label: t.label }))} defaultValue={p.transport} onChange={(v) => setP(i, { transport: v as PrinterConfig["transport"] })} /></div>
              <Field label="Adres" hint={TRANSPORTS.find((t) => t.value === p.transport)?.hint}><Input value={p.address} onChange={(e) => setP(i, { address: e.target.value })} aria-label="Yazıcı adresi" required /></Field>
              <div><div className="mb-1.5 text-sm font-medium">Kâğıt</div><Seg label="Kâğıt" value={p.width} options={[{ value: 80, label: "80 mm" }, { value: 58, label: "58 mm" }] as const} onChange={(v) => setP(i, { width: v })} /></div>
              <div><div className="mb-1.5 text-sm font-medium">Türkçe karakter</div><Seg label="Kod sayfası" value={p.codepage} options={[{ value: "pc857", label: "PC857" }, { value: "ascii", label: "Türkçesiz (ç→c)" }] as const} onChange={(v) => setP(i, { codepage: v })} /></div>
              <div><div className="mb-1.5 text-sm font-medium">Marka</div><Seg label="Marka" value={p.brand} options={[{ value: "genel", label: "Genel" }, { value: "xprinter", label: "XPrinter" }, { value: "epson", label: "Epson" }] as const} onChange={(v) => setP(i, { brand: v })} /></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={p.drawer} onChange={(e) => setP(i, { drawer: e.target.checked })} /> Para çekmecesi bu yazıcıya bağlı</label>
              <button type="button" className="ml-auto text-bad underline" onClick={() => setC({ ...c, printers: c.printers.filter((_, j) => j !== i) })}>Yazıcıyı kaldır</button>
            </div>
          </div>
        ))}
        {c.printers.length < 8 && <button type="button" className="text-sm text-brand underline" onClick={() => setC({ ...c, printers: [...c.printers, newPrinter(nextN())] })}>+ Yazıcı ekle</button>}
      </div>

      <div className="rounded-xl border border-line p-4" data-testid="agent-logo">
        <div className="mb-1.5 text-sm font-medium">Fiş logosu</div>
        <p className="mb-3 text-sm text-muted">PNG dosyası; kağıt genişliğine sığdırılır, siyah-beyaza çevrilir. Fişin üstünde işletme adından önce basılır.</p>
        <div className="flex flex-wrap items-center gap-4">
          {c.logo && <LogoPreview logo={c.logo} />}
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            {c.logo ? "Değiştir…" : "PNG yükle"}
            <input type="file" accept="image/png" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {c.logo && <button type="button" className="text-bad underline" onClick={() => setC({ ...c, logo: null })}>Logoyu kaldır</button>}
          {c.logo && <span className="text-sm text-muted">{c.logo.w}×{c.logo.h} nokta</span>}
        </div>
        {logoErr && <p className="mt-2 text-sm text-bad">{logoErr}</p>}
      </div>

      <div className="rounded-xl border border-line p-4">
        <div className="mb-1.5 text-sm font-medium">Terazi</div>
        <Seg label="Terazi" value={sc.kind} options={[{ value: "yok", label: "Yok" }, { value: "seri", label: "Seri port (COM)" }, { value: "tcp", label: "Ağ (IP)" }] as const}
          onChange={(k) => setC({ ...c, scale: k === "yok" ? { kind: "yok" } : k === "seri" ? { kind: "seri", port: "COM1", baud: 9600, request: "enq" } : { kind: "tcp", host: "", port: 4001, request: "enq" } })} />
        {sc.kind === "seri" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Port" hint="COM3 ya da /dev/ttyUSB0"><Input value={sc.port} onChange={(e) => setC({ ...c, scale: { ...sc, port: e.target.value } })} aria-label="Terazi portu" /></Field>
            <div><div className="mb-1.5 text-sm font-medium">Hız</div><Select options={[2400, 4800, 9600, 19200].map((b) => ({ value: String(b), label: `${b} baud` }))} defaultValue={String(sc.baud)} onChange={(v) => setC({ ...c, scale: { ...sc, baud: Number(v) } })} /></div>
          </div>
        )}
        {sc.kind === "tcp" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="IP"><Input value={sc.host} onChange={(e) => setC({ ...c, scale: { ...sc, host: e.target.value } })} aria-label="Terazi IP" /></Field>
            <Field label="Port"><Input inputMode="numeric" value={String(sc.port)} onChange={(e) => setC({ ...c, scale: { ...sc, port: Number(e.target.value.replace(/\D/g, "")) || 0 } })} aria-label="Terazi port" /></Field>
          </div>
        )}
        {sc.kind !== "yok" && (
          <div className="mt-3"><div className="mb-1.5 text-sm font-medium">Okuma isteği</div><Seg label="Okuma isteği" value={sc.request} options={[{ value: "enq", label: "ENQ (çoğu terazi)" }, { value: "w", label: "W komutu" }, { value: "yok", label: "Sürekli gönderir" }] as const} onChange={(v) => setC({ ...c, scale: { ...sc, request: v } })} /></div>
        )}
      </div>

      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={c.autoPrint} onChange={(e) => setC({ ...c, autoPrint: e.target.checked })} /> Satıştan sonra fişi kendiliğinden yazdır</label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : "Donanımı kaydet"}</Button>
        {state.savedAt && <span className="text-sm text-ok">Kaydedildi; ajan bir dakika içinde alır.</span>}
        {state.error && <span className="text-sm text-bad">{state.error}</span>}
      </div>
    </form>
  );
}
