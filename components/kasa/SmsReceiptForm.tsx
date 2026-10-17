"use client";
// #38: son satışın fişini SMS ile gönderme (sağlanan satış kimliği için sunucu API'sine gider).
import { useEffect, useId, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { normalizePhone } from "@/lib/core/delivery";

export function SmsReceiptForm({ saleId }: { saleId: string }) {
  const phoneErrorId = useId();
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state === "ok") successRef.current?.focus(); }, [state]);
  const phoneFormatError = phoneTouched && phone.trim() && !normalizePhone(phone)
    ? "Geçerli bir Türkiye telefon numarası girin."
    : null;
  const sendingRef = useRef(false);
  const send = async () => {
    if (sendingRef.current || state === "ok") return;
    if (!normalizePhone(phone)) {
      setError("Geçerli bir Türkiye telefon numarası girin.");
      return;
    }
    sendingRef.current = true;
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/sync/receipt-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saleId, phone }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r.ok && j?.ok) setState("ok");
      else {
        setError(j?.error ?? "Gönderilemedi.");
        setState("idle");
      }
    } catch {
      setError("Sunucuya ulaşılamadı (çevrimdışı?).");
      setState("idle");
    } finally {
      sendingRef.current = false;
    }
  };
  if (state === "ok") return <div ref={successRef} tabIndex={-1} className="pl-7 text-ok outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" role="status" aria-live="polite">Fiş SMS ile gönderildi.</div>;
  return (
    <form
      className="mt-1.5 flex flex-wrap items-end gap-2 pl-7"
      aria-busy={state === "sending"}
      onSubmit={(e) => { e.preventDefault(); if (!sendingRef.current && state !== "sending") void send(); }}
    >
      <div className="w-44"><Field label="Fişi SMS gönder" hint="Türkiye telefon numarası · 05xx…"><Input type="tel" autoComplete="tel" value={phone} onBlur={() => setPhoneTouched(true)} onChange={(e) => { setPhone(e.target.value); setError(null); }} inputMode="tel" placeholder="05321234567" disabled={state === "sending"} required aria-invalid={Boolean(phoneFormatError) || undefined} aria-describedby={phoneFormatError ? phoneErrorId : undefined} /></Field>
        {phoneFormatError && <p id={phoneErrorId} className="mt-1 text-xs text-bad" role="status" aria-live="polite">{phoneFormatError}</p>}
      </div>
      <Button type="submit" variant="secondary" size="sm" className="min-h-12" disabled={state === "sending" || !normalizePhone(phone)}><MessageSquare aria-hidden className="size-4" />{state === "sending" ? "Gönderiliyor…" : "Gönder"}</Button>
      {state === "sending" && <span className="sr-only" role="status" aria-live="polite">Fiş SMS ile gönderiliyor.</span>}
      {error && <span className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</span>}
    </form>
  );
}
