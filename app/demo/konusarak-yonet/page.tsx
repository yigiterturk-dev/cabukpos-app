"use client";
// "KONUŞARAK YÖNET" DEMOSU (kama): doğal dille rapor/stok soruları. Yaz ya da mikrofona konuş.
// Gerçek üründe: soru → LLM + gerçek rapor/stok sorguları. Burada deterministik motor + demo verisi.
import { useRef, useState } from "react";
import Link from "next/link";
import { Bot, Mic, Send, Sparkles } from "lucide-react";
import { query, type Answer } from "./engine";

type Msg = { role: "user"; text: string } | { role: "bot"; a: Answer };
type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

const EXAMPLES = ["bugün ciro ne", "dün en çok ne sattım", "kritik stok var mı", "ne bitecek ne sipariş vereyim", "ortalama sepet ne kadar"];

export default function KonusarakYonetPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }, { role: "bot", a: query(text) }]);
    setInput("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const voice = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { alert("Bu tarayıcı ses tanımayı desteklemiyor. Yazabilirsin."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "tr-TR"; rec.interimResults = false;
    rec.onresult = (e) => setInput(String(e.results[0][0].transcript));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
      <header className="mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand"><Sparkles aria-hidden className="size-3.5" />Konuşarak Yönet (demo)</span>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">İşletmeni rakamla yönet, panelde aramadan</h1>
        <p className="mt-1 text-sm text-muted">Ciro, en çok satan, stok, fiş sayısı… sor — cevabı getirsin. Yaz ya da mikrofona konuş.</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface-2/40 p-4">
        {messages.length === 0 && (
          <div className="grid place-items-center gap-3 py-12 text-center text-muted">
            <Bot aria-hidden className="size-8 text-line-strong" />
            <p className="text-sm">Örnek sor:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => ask(e)} className="press rounded-full border border-line bg-surface px-3 py-1.5 text-xs hover:border-line-strong">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand px-3.5 py-2 text-sm text-white shadow-rest">{m.text}</p></div>
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
        <button type="button" onClick={voice} aria-label={listening ? "Dinlemeyi durdur" : "Sesle sor"} className={`press grid size-12 shrink-0 place-items-center rounded-xl border ${listening ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
          <Mic aria-hidden className="size-5" />
        </button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="ör. dün en çok ne sattım" aria-label="Soru" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        <button type="submit" aria-label="Gönder" title="Gönder" disabled={!input.trim()} className="press grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand to-brand-hover text-white shadow-rest ring-1 ring-inset ring-white/15 hover:shadow-glow disabled:opacity-40"><Send aria-hidden className="size-5" /></button>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
        <span>Bu bir demo · gerçek üründe soru LLM ile gerçek rapor/stok sorgularına bağlanır.</span>
        <Link href="/kayit" className="font-semibold text-brand underline underline-offset-4">14 gün ücretsiz dene →</Link>
        <Link href="/demo" className="underline underline-offset-4">Diğer demolar</Link>
      </div>
    </main>
  );
}
