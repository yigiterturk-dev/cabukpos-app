"use client";
// #38: son satışın fişini SMS ile gönderme (sağlanan satış kimliği için sunucu API'sine gider).
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

export function SmsReceiptForm({ saleId }: { saleId: string }) {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
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
    }
  };
  if (state === "ok") return <div className="pl-7 text-ok">Fiş SMS ile gönderildi.</div>;
  return (
    <form
      className="mt-1.5 flex flex-wrap items-end gap-2 pl-7"
      onSubmit={(e) => { e.preventDefault(); if (state !== "sending") void send(); }}
    >
      <div className="w-44"><Field label="Fişi SMS gönder" hint="05xx…"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="05321234567" /></Field></div>
      <Button type="submit" variant="secondary" size="sm" disabled={state === "sending" || phone.trim().length < 10}><MessageSquare aria-hidden className="size-4" />{state === "sending" ? "Gönderiliyor…" : "Gönder"}</Button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </form>
  );
}
