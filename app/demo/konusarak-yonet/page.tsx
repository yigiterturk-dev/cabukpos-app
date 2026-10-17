"use client";
// "KONUŞARAK YÖNET" DEMOSU (kama): doğal dille rapor/stok soruları. Yaz ya da mikrofona konuş.
// Gerçek üründe: soru → LLM + gerçek rapor/stok sorguları. Burada deterministik motor + demo verisi.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Mic, Send, Sparkles } from "lucide-react";
import { query, type Answer } from "./engine";
import { SkipToContent } from "@/components/SkipToContent";

type Msg = { role: "user"; text: string } | { role: "bot"; a: Answer };
type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

const EXAMPLES = ["bugün ciro ne", "dün en çok ne sattım", "kritik stok var mı", "ne bitecek ne sipariş vereyim", "ortalama sepet ne kadar"];

export default function KonusarakYonetPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const manualStopRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    if (!recRef.current) return;
    const rec = recRef.current;
    rec.onresult = () => {};
    rec.onend = () => {};
    rec.onerror = () => {};
    try { rec.stop(); } catch { /* tanıma zaten durmuş olabilir */ }
    recRef.current = null;
  }, []);

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }, { role: "bot", a: query(text) }]);
    setInput("");
    setVoiceNotice("");
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      inputRef.current?.focus();
    });
  };

  const voice = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setVoiceNotice("Bu tarayıcı ses tanımayı desteklemiyor. Sorunu yazarak gönderebilirsin."); return; }
    if (listening) {
      manualStopRef.current = true;
      try { recRef.current?.stop(); setVoiceNotice("Dinleme durduruldu."); }
      catch { recRef.current = null; setListening(false); manualStopRef.current = false; setVoiceNotice("Dinleme durdurulamadı. Sorunu yazarak gönderebilirsin."); }
      return;
    }
    const rec = new Ctor();
    rec.lang = "tr-TR"; rec.interimResults = false;
    let receivedTranscript = false;
    let failed = false;
    manualStopRef.current = false;
    rec.onresult = (e) => {
      const transcript = String(e.results[0][0].transcript).trim();
      if (!transcript) { setVoiceNotice("Konuşma anlaşılamadı. Tekrar dene veya yaz."); return; }
      receivedTranscript = true;
      setInput(transcript);
      setVoiceNotice("Soru algılandı. Göndermek için Gönder düğmesine bas.");
    };
    rec.onend = () => {
      setListening(false);
      if (recRef.current === rec) recRef.current = null;
      if (!receivedTranscript && !manualStopRef.current && !failed) setVoiceNotice("Ses alınamadı. Tekrar dene veya sorunu yaz.");
      manualStopRef.current = false;
    };
    rec.onerror = () => { failed = true; setListening(false); setVoiceNotice("Ses alınamadı. İzinleri kontrol et veya sorunu yazarak gönder."); };
    recRef.current = rec;
    setListening(true);
    setVoiceNotice("Dinliyor… Sorunu söyle.");
    try { rec.start(); }
    catch {
      recRef.current = null;
      setListening(false);
      setVoiceNotice("Mikrofon başlatılamadı. İzinleri kontrol et veya sorunu yazarak gönder.");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
      <SkipToContent />
      <header className="mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand"><Sparkles aria-hidden className="size-3.5" />Konuşarak Yönet (demo)</span>
        <h1 id="main-content" tabIndex={-1} className="mt-2 rounded-sm font-display text-2xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Demo verilerine konuşarak soru sor</h1>
        <p className="mt-1 text-sm text-muted">Demo ciro, satış ve stok verileriyle soru sor. Yazabilir veya mikrofona konuşabilirsin.</p>
      </header>

      <div role="log" aria-label="Soru ve yanıtlar" aria-live="polite" aria-relevant="additions" tabIndex={0} className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface-2/40 p-4 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/50">
        {messages.length === 0 && (
          <div className="grid place-items-center gap-3 py-12 text-center text-muted">
            <Bot aria-hidden className="size-8 text-line-strong" />
            <p className="text-sm">Örnek sor:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => ask(e)} className="press min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-action px-3.5 py-2 text-sm text-white shadow-rest">{m.text}</p></div>
        ) : (
          <div key={i} className="flex justify-start">
            <div className="w-full max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface p-3 shadow-rest">
              <p className="text-sm font-medium">{m.a.answer}{m.a.period && <span className="ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-normal text-muted">{m.a.period}</span>}</p>
              {m.a.rows && (
                <ul className="mt-2 divide-y divide-line">
                  {m.a.rows.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="text-ink-2">{r.label}</span>
                      <span className="tabular font-medium">{r.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-3 flex items-center gap-2">
        <button type="button" onClick={voice} aria-label={listening ? "Dinlemeyi durdur" : "Sesle sor"} aria-pressed={listening} className={`press grid size-12 shrink-0 place-items-center rounded-xl border outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${listening ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
          <Mic aria-hidden className="size-5" />
        </button>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="ör. dün en çok ne sattım" aria-label="Soru" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        <button type="submit" aria-label="Gönder" title="Gönder" disabled={!input.trim()} className="press grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand-action to-brand-action-hover text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:shadow-glow focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40"><Send aria-hidden className="size-5" /></button>
      </form>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-center text-xs text-muted">{voiceNotice}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
        <span>Simülasyon · yanıtlar örnek veriden üretilir; gerçek rapor veya stok verisi kullanılmaz.</span>
        <Link href="/kayit" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">14 gün ücretsiz dene →</Link>
        <Link href="/demo" className="inline-flex min-h-11 items-center underline underline-offset-4">Diğer demolar</Link>
      </div>
    </main>
  );
}
