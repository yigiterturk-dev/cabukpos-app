"use client";
// AI SİPARİŞ DEMOSU (kama): doğal Türkçe (yazı ya da ses) → sipariş satırları → "mutfağa düşen" bilet.
// Gerçek üründe: telefon/WhatsApp kanalı bu akışa bağlanır; metin çözümleme LLM'e devredilir. Burada ağ yok, deterministik.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mic, MessageCircle, PhoneCall, PhoneIncoming, Send, Sparkles, Utensils, ArrowRight } from "lucide-react";
import { kasaFmt } from "@/components/kasa/kasa-format";
import { parseOrder, type OrderProduct, type ParsedLine } from "./parser";
import { SkipToContent } from "@/components/SkipToContent";

const MENU: OrderProduct[] = [
  { id: "p1", name: "Adana Kebap", price: 32000, kind: "adet" },
  { id: "p2", name: "Mercimek Çorba", price: 8500, kind: "adet" },
  { id: "p3", name: "Karışık Pide", price: 26000, kind: "adet" },
  { id: "p4", name: "Künefe", price: 14000, kind: "adet" },
  { id: "p5", name: "Ayran", price: 2500, kind: "adet" },
  { id: "p6", name: "Şalgam", price: 3000, kind: "adet" },
  { id: "p7", name: "Baklava", price: 48000, kind: "tartili" },
  { id: "p8", name: "Çoban Salata", price: 11000, kind: "adet" },
  { id: "p9", name: "Kola", price: 4000, kind: "adet" },
  { id: "p10", name: "Su", price: 1500, kind: "adet" },
];
const EXAMPLES = ["2 adana bir ayran, bi de künefe", "bir pide iki kola", "yarım kilo baklava ve bir çorba"];
const CALL_SCRIPT = "Alo, iyi günler. İki adana kebap, bir ayran olur mu? Bir de künefe ekleyin lütfen.";

type Msg =
  | { role: "user"; text: string }
  | { role: "bot"; lines: ParsedLine[]; unmatched: string[]; total: number; sent: boolean; kitchenState: "yeni" | "hazirlaniyor" | "hazir" };

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

export default function AiSiparisPage() {
  const { TL } = kasaFmt(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [call, setCall] = useState<"ringing" | "talking" | null>(null);
  const [channel, setChannel] = useState<"telefon" | "whatsapp">("telefon");
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<SpeechRec | null>(null);
  const manualStopRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const kitchenFocusRef = useRef<number | null>(null);
  const callTimer = useRef<number | null>(null);
  const callStartTimer = useRef<number | null>(null);
  const callEndTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (recRef.current) {
      const rec = recRef.current;
      rec.onresult = () => {};
      rec.onend = () => {};
      rec.onerror = () => {};
      try { rec.stop(); } catch { /* tanıma zaten durmuş olabilir */ }
      recRef.current = null;
    }
    if (callTimer.current) clearInterval(callTimer.current);
    if (callStartTimer.current) clearTimeout(callStartTimer.current);
    if (callEndTimer.current) clearTimeout(callEndTimer.current);
  }, []);

  useEffect(() => {
    if (kitchenFocusRef.current === null) return;
    const index = kitchenFocusRef.current;
    kitchenFocusRef.current = null;
    requestAnimationFrame(() => {
      const ticket = document.querySelector(`[data-kitchen-ticket="${index}"]`);
      const target = ticket?.querySelector<HTMLButtonElement>("button") ?? ticket?.querySelector<HTMLElement>("[data-kitchen-ready]");
      target?.focus();
    });
  }, [messages]);

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const r = parseOrder(text, MENU);
    setMessages((m) => [...m, { role: "user", text }, { role: "bot", lines: r.lines, unmatched: r.unmatched, total: r.total, sent: false, kitchenState: "yeni" }]);
    setInput("");
    setVoiceNotice("");
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      inputRef.current?.focus();
    });
  };

  const sendToKitchen = (idx: number) => {
    kitchenFocusRef.current = idx;
    setMessages((m) => m.map((x, i) => (i === idx && x.role === "bot" ? { ...x, sent: true } : x)));
  };

  const advanceKitchen = (idx: number) => {
    kitchenFocusRef.current = idx;
    setMessages((m) => m.map((x, i) => i !== idx || x.role !== "bot" ? x : {
      ...x,
      kitchenState: x.kitchenState === "yeni" ? "hazirlaniyor" : "hazir",
    }));
  };

  const voice = () => {
    if (call) return;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setVoiceNotice("Bu tarayıcı ses tanımayı desteklemiyor. Siparişi yazarak gönderebilirsin."); return; }
    if (listening) {
      manualStopRef.current = true;
      try { recRef.current?.stop(); setVoiceNotice("Dinleme durduruldu."); }
      catch {
        recRef.current = null;
        setListening(false);
        manualStopRef.current = false;
        setVoiceNotice("Ses durdurulamadı. Siparişi yazarak gönderebilirsin.");
      }
      return;
    }
    const rec = new Ctor();
    rec.lang = "tr-TR"; rec.interimResults = false;
    let receivedTranscript = false;
    let failed = false;
    manualStopRef.current = false;
    rec.onresult = (e) => {
      const value = String(e.results[0][0].transcript).trim();
      if (!value) { setVoiceNotice("Konuşma anlaşılamadı. Tekrar dene veya siparişi yaz."); return; }
      receivedTranscript = true;
      setInput(value);
      setVoiceNotice("Sipariş algılandı. Kontrol edip Gönder'e basabilirsin.");
    };
    rec.onend = () => {
      setListening(false);
      if (recRef.current === rec) recRef.current = null;
      if (!receivedTranscript && !manualStopRef.current && !failed) setVoiceNotice("Ses alınamadı. Tekrar dene veya siparişi yaz.");
      manualStopRef.current = false;
    };
    rec.onerror = () => { failed = true; setListening(false); setVoiceNotice("Ses alınamadı. İzinleri kontrol et veya siparişi yazarak gönder."); };
    recRef.current = rec;
    setListening(true);
    setVoiceNotice("Dinliyor… Siparişi söyle.");
    try { rec.start(); }
    catch {
      recRef.current = null;
      setListening(false);
      setVoiceNotice("Mikrofon başlatılamadı. İzinleri kontrol et veya siparişi yazarak gönder.");
    }
  };

  const hint = useMemo(() => MENU.slice(0, 4).map((p) => p.name).join(" · "), []);

  const simulateCall = () => {
    if (call || listening) return;
    setCall("ringing");
    setTranscript("");
    setVoiceNotice("");
    callStartTimer.current = window.setTimeout(() => {
      callStartTimer.current = null;
      setCall("talking");
      let i = 0;
      callTimer.current = window.setInterval(() => {
        i++;
        setTranscript(CALL_SCRIPT.slice(0, i));
        if (i >= CALL_SCRIPT.length) {
          if (callTimer.current) clearInterval(callTimer.current);
          callTimer.current = null;
          callEndTimer.current = window.setTimeout(() => {
            callEndTimer.current = null;
            setCall(null);
            setTranscript("");
            submit(CALL_SCRIPT);
          }, 700);
        }
      }, 28);
    }, channel === "whatsapp" ? 300 : 900);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6">
      <SkipToContent />
      <header className="mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand"><Sparkles aria-hidden className="size-3.5" />AI Sipariş (demo)</span>
        <h1 id="main-content" tabIndex={-1} className="mt-2 rounded-sm font-display text-2xl font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sipariş akışını demo menüsüyle dene</h1>
        <p className="mt-1 text-sm text-muted">Örnek siparişi yaz veya mikrofona söyle; eşleşen ürünleri inceleyip demo mutfak fişine gönderebilirsin.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Kanal">
            {([["telefon", "Telefon", PhoneCall], ["whatsapp", "WhatsApp", MessageCircle]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" aria-pressed={channel === k} disabled={!!call} onClick={() => setChannel(k)} className={`press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 ${channel === k ? "bg-brand-action text-white shadow-rest" : "text-ink-2 hover:text-ink"}`}>
                <Icon aria-hidden className="size-4" />{label}
              </button>
            ))}
          </div>
          <button type="button" onClick={simulateCall} disabled={!!call || listening} className="press inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2 text-sm font-semibold text-brand outline-none hover:border-brand focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-50">
            {channel === "whatsapp" ? <MessageCircle aria-hidden className="size-4" /> : <PhoneCall aria-hidden className="size-4" />}
            {call ? "Sürüyor…" : channel === "whatsapp" ? "WhatsApp mesajını simüle et" : "Telefon aramasını simüle et"}
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {call === "ringing" ? channel === "whatsapp" ? "Yeni WhatsApp mesajı geliyor." : "Gelen telefon araması." : call === "talking" ? channel === "whatsapp" ? "WhatsApp mesajı yazılıyor." : "Telefon görüşmesi sürüyor. Sipariş konuşması çözümleniyor." : ""}
      </p>
      <div role="log" aria-label="Sipariş konuşması" aria-live="polite" aria-relevant="additions" tabIndex={0} className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface-2/40 p-4 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/50">
        {call && (() => {
          const wa = channel === "whatsapp";
          return (
            <div aria-hidden="true" className="flex justify-start">
              <div className={`w-full max-w-[85%] rounded-2xl rounded-bl-sm border p-3 shadow-rest ${wa ? "border-[#25D366]/40 bg-[#dcf8c6]/70" : "border-brand/40 bg-brand-soft"}`}>
                <div className={`flex items-center gap-2 text-sm font-semibold ${wa ? "text-[#128C4A]" : "text-brand"}`}>
                  {wa ? <MessageCircle aria-hidden className="size-4" /> : <PhoneIncoming aria-hidden className="size-4" />}
                  {wa ? (call === "ringing" ? "Yeni WhatsApp mesajı…" : "Yazıyor…") : (call === "ringing" ? "Gelen arama…" : "Konuşuyor…")}
                  <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${wa ? "text-[#128C4A]" : "text-brand"}`}>
                    <span className="relative flex size-2"><span className={`absolute inline-flex size-full motion-safe:animate-ping rounded-full ${wa ? "bg-[#25D366]/60" : "bg-brand-action/60"}`} /><span className={`relative inline-flex size-2 rounded-full ${wa ? "bg-[#25D366]" : "bg-brand-action"}`} /></span>
                    canlı
                  </span>
                </div>
                <p className="mt-2 min-h-6 text-sm text-ink-2">{transcript}<span className="motion-safe:animate-pulse">|</span></p>
              </div>
            </div>
          );
        })()}
        {messages.length === 0 && !call && (
          <div className="grid place-items-center gap-3 py-12 text-center text-muted">
            <Utensils aria-hidden className="size-8 text-line-strong" />
            <p className="text-sm">Menüden örnek: <span className="text-ink-2">{hint}</span></p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => submit(e)} className="press min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-sm hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-action px-3.5 py-2 text-sm text-white shadow-rest">{m.text}</p></div>
        ) : (
          <div key={i} className="flex justify-start">
            <div className="w-full max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface p-3 shadow-rest">
              {m.lines.length ? (
                <>
                  <ul className="divide-y divide-line">
                    {m.lines.map((l) => (
                      <li key={l.productId} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="tabular w-12 font-semibold">{l.kind === "tartili" ? `${(l.qtyMilli / 1000).toLocaleString("tr-TR")} kg` : `${l.qtyMilli / 1000}×`}</span>
                        <span className="flex-1">{l.name}</span>
                        <span className="tabular text-ink-2">{TL(Math.round((l.unitPrice * l.qtyMilli) / 1000))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">Toplam</span>
                    <span className="tabular font-display text-xl font-extrabold">{TL(m.total)}</span>
                  </div>
                  {m.unmatched.length > 0 && <p className="mt-2 text-xs text-warn">Anlaşılamadı: {m.unmatched.join(", ")}</p>}
                  {m.sent ? (
                    <div className="mt-3 space-y-2" data-testid="kitchen-ticket" data-kitchen-ticket={i}>
                      <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-sm font-medium text-ok"><Utensils aria-hidden className="size-4" />Mutfağa gönderildi</p>
                      <div className="overflow-hidden rounded-xl border-2 border-warn bg-surface shadow-rest">
                        <div className="flex items-baseline gap-2 bg-warn-soft px-3 py-2" role="status" aria-live="polite">
                          <span className="font-display text-base font-bold tracking-tight">Mutfak · {m.kitchenState === "yeni" ? "Yeni sipariş" : m.kitchenState === "hazirlaniyor" ? "Hazırlanıyor" : "Hazır"}</span>
                          <span className="ml-auto text-xs text-muted">şimdi</span>
                        </div>
                        <ul className="space-y-1 px-3 py-2">
                          {m.lines.map((l) => (
                            <li key={l.productId} className="text-sm font-semibold">{l.kind === "tartili" ? `${(l.qtyMilli / 1000).toLocaleString("tr-TR")} kg` : `${l.qtyMilli / 1000}`} × {l.name}</li>
                          ))}
                        </ul>
                        {m.kitchenState === "hazir" ? (
                          <p className="mx-3 mb-3 rounded-lg bg-ok-soft px-3 py-2 text-center text-sm font-semibold text-ok" role="status" tabIndex={-1} data-kitchen-ready>Sipariş hazır</p>
                        ) : (
                          <button type="button" onClick={() => advanceKitchen(i)} className="mx-3 mb-3 min-h-11 w-[calc(100%-1.5rem)] rounded-lg bg-espresso px-3 py-2 text-center text-sm font-semibold text-white outline-none hover:bg-espresso/90 focus-visible:ring-4 focus-visible:ring-brand-ring/60">
                            {m.kitchenState === "yeni" ? "Hazırlanmaya al" : "Hazır olarak işaretle"}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => sendToKitchen(i)} className="press mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-action to-brand-action-hover px-4 py-2.5 font-semibold text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:shadow-glow focus-visible:ring-4 focus-visible:ring-brand-ring/60">Mutfağa gönder<ArrowRight aria-hidden className="size-4" /></button>
                  )}
                </>
              ) : (
                <div className="space-y-1 text-sm text-warn">
                  <p>Sipariş anlaşılamadı. Menüdeki ürün adlarını kullanıp tekrar deneyebilirsin.</p>
                  {m.unmatched.length > 0 && <p className="break-words">Eşleşmeyen ifade: <span className="font-medium">{m.unmatched.join(", ")}</span></p>}
                  <p className="text-xs text-muted">Örnek: “2 adana bir ayran”.</p>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="mt-3 flex items-center gap-2">
        <button type="button" onClick={voice} disabled={!!call} aria-label={listening ? "Dinlemeyi durdur" : "Sesle söyle"} aria-pressed={listening} className={`press grid size-12 shrink-0 place-items-center rounded-xl border outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-50 ${listening ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>
          <Mic aria-hidden className="size-5" />
        </button>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="ör. 2 adana bir ayran, bi de künefe" aria-label="Sipariş" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-ring/50" />
        <button type="submit" aria-label="Gönder" title="Gönder" disabled={!input.trim()} className="press grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand-action to-brand-action-hover text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:shadow-glow focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40"><Send aria-hidden className="size-5" /></button>
      </form>
      <p role="status" aria-live="polite" className="mt-1 min-h-5 text-center text-xs text-muted">{voiceNotice}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
        <span>Simülasyon · siparişler örnek menüyle eşleşir; telefon ve WhatsApp entegrasyonu yok.</span>
        <Link href="/kayit" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">14 gün ücretsiz dene →</Link>
        <Link href="/demo" className="inline-flex min-h-11 items-center underline underline-offset-4">Diğer demolar</Link>
      </div>
    </main>
  );
}
