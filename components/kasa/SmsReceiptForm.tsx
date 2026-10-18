"use client";
// #38: son satışın fişini SMS ile gönderme (sağlanan satış kimliği için sunucu API'sine gider).
import { useEffect, useId, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { normalizePhone } from "@/lib/core/delivery";

export function SmsReceiptForm({ saleId }: { saleId: string }) {
  const phoneErrorId = useId();
  const phoneInputId = useId();
  const sendButtonId = useId();
  const retryCheckButtonId = useId();
  const changeRecipientButtonId = useId();
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const uncertainPhoneRef = useRef<string | null>(null);
  useEffect(() => { if (state === "ok") successRef.current?.focus(); }, [state]);
  useEffect(() => {
    if (!error || state !== "idle") return;
    const targetId = uncertain && !retryAcknowledged ? retryCheckButtonId : normalizePhone(phone) ? sendButtonId : phoneInputId;
    const frame = window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [error, phone, phoneInputId, retryAcknowledged, retryCheckButtonId, sendButtonId, state, uncertain]);
  const phoneFormatError = phoneTouched && phone.trim() && !normalizePhone(phone)
    ? "Geçerli bir Türkiye telefon numarası girin."
    : null;
  const sendingRef = useRef(false);
  const send = async () => {
    if (sendingRef.current || state === "ok") return;
    if (!normalizePhone(phone)) {
      setPhoneTouched(true);
      setError("Geçerli bir Türkiye telefon numarası girin.");
      return;
    }
    sendingRef.current = true;
    const sentTo = normalizePhone(phone)!;
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/sync/receipt-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saleId, phone }),
        signal: AbortSignal.timeout(12_000),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r.ok && j?.ok) setState("ok");
      else {
        const deliveryUncertain = uncertain || r.status >= 500;
        if (deliveryUncertain) {
          setUncertain(true);
          uncertainPhoneRef.current = sentTo;
          setRetryAcknowledged(false);
        }
        const reason = j?.error ?? "Gönderilemedi.";
        setError(deliveryUncertain ? `${reason} Önceki SMS müşteriye ulaşmış olabilir; tekrar göndermeden önce teslimatı kontrol edin.` : reason);
        setState("idle");
      }
    } catch (cause) {
      setUncertain(true);
      uncertainPhoneRef.current = sentTo;
      setRetryAcknowledged(false);
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "SMS yanıtı zaman aşımına uğradı; mesaj müşteriye ulaşmış olabilir. Tekrar göndermeden önce kontrol edin."
        : "Sunucuya ulaşılamadı; önceki SMS müşteriye ulaşmış olabilir. Tekrar göndermeden önce teslimatı kontrol edin.");
      setState("idle");
    } finally {
      sendingRef.current = false;
    }
  };
  if (state === "ok") return <div ref={successRef} tabIndex={-1} className="pl-7 text-ok outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">{deliveryNotice ? `${deliveryNotice} Yeni alıcıya fiş SMS’i gönderildi.` : "Fiş SMS ile gönderildi."}</div>;
  return (
    <form
      className="mt-1.5 flex flex-wrap items-end gap-2 pl-7"
      aria-busy={state === "sending"}
      onSubmit={(e) => { e.preventDefault(); if (!sendingRef.current && state !== "sending") void send(); }}
    >
      <div className="w-44"><Field label="Fişi SMS gönder" hint="Türkiye telefon numarası · 05xx…"><Input id={phoneInputId} type="tel" autoComplete="tel" value={phone} onBlur={() => setPhoneTouched(true)} onChange={(e) => { setPhone(e.target.value); setError(null); }} inputMode="tel" maxLength={24} placeholder="05321234567" disabled={state === "sending" || uncertain} required aria-invalid={Boolean(phoneFormatError) || undefined} aria-describedby={phoneFormatError ? phoneErrorId : undefined} /></Field>
        {phoneFormatError && <p id={phoneErrorId} className="mt-1 text-xs text-bad" role="status" aria-live="polite">{phoneFormatError}</p>}
      </div>
      {uncertain && !retryAcknowledged && <Button id={retryCheckButtonId} type="button" variant="secondary" size="sm" className="min-h-12" disabled={state === "sending"} onClick={() => { setRetryAcknowledged(true); setError("Fişin telefona ulaşmadığını kontrol ettiyseniz yeniden gönderebilirsiniz."); }}>Kontrol ettim, yeniden gönder</Button>}
      {uncertain && <Button id={changeRecipientButtonId} type="button" variant="secondary" size="sm" className="min-h-12" disabled={state === "sending"} onClick={() => { setDeliveryNotice("Önceki SMS eski numaraya ulaşmış olabilir."); setUncertain(false); setRetryAcknowledged(false); uncertainPhoneRef.current = null; setError(null); requestAnimationFrame(() => document.getElementById(phoneInputId)?.focus()); }}>Alıcı numarasını değiştir</Button>}
      <Button id={sendButtonId} type="submit" variant="secondary" size="sm" className="min-h-12" disabled={state === "sending" || !normalizePhone(phone) || (uncertain && !retryAcknowledged)}><MessageSquare aria-hidden className="size-4" />{state === "sending" ? "Gönderiliyor…" : uncertain ? "Tekrar gönder" : "Gönder"}</Button>
      {state === "sending" && <span className="sr-only" role="status" aria-live="polite">Fiş SMS ile gönderiliyor.</span>}
      {deliveryNotice && <span className="break-words text-sm text-warn" role="status" aria-live="polite">{deliveryNotice}</span>}
      {error && <span className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</span>}
    </form>
  );
}
