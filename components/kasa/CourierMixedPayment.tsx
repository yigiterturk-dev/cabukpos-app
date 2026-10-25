"use client";
import { useState } from "react";
import { settle, type Payment } from "@/lib/core/payment";
import { kasaFmt } from "./kasa-format";
import type { Meta } from "@/lib/offline/state";

export function CourierMixedPayment({ total, meta, busy, onPay }: { total: number; meta: Meta; busy: boolean; onPay: (payments: Payment[]) => void }) {
  const { TL, parse, bare } = kasaFmt(meta);
  const [cash, setCash] = useState(""), [card, setCard] = useState("");
  const c = parse(cash), k = parse(card);
  const payments: Payment[] = [{ method: "nakit", amount: c ?? 0 }, { method: "kart", amount: k ?? 0 }].filter(p => p.amount > 0) as Payment[];
  const invalid = (cash.trim() !== "" && c === null) || (card.trim() !== "" && k === null);
  const result = settle(total, payments);
  return <form onSubmit={e => { e.preventDefault(); if (!invalid && result.ok && !busy) onPay(result.payments); }} className="mt-4 space-y-3 rounded-xl border border-line bg-surface-2 p-3">
    <h3 className="font-semibold">Nakit + kart · Kapıda parçalı ödeme</h3>
    <div className="grid grid-cols-2 gap-3"><label className="grid min-w-0 gap-1 text-sm">Alınan nakit<input aria-label="Kapıda alınan nakit" inputMode="decimal" value={cash} onChange={e => setCash(e.target.value)} disabled={busy} className="min-h-12 min-w-0 rounded-xl border border-line bg-surface px-3" /></label><label className="grid min-w-0 gap-1 text-sm">Kart tutarı<input aria-label="Kapıda kart tutarı" inputMode="decimal" value={card} onChange={e => setCard(e.target.value)} disabled={busy} className="min-h-12 min-w-0 rounded-xl border border-line bg-surface px-3" /></label></div>
    <button type="button" disabled={busy || invalid} onClick={() => setCard(bare(Math.max(0, total - (c ?? 0))))} className="min-h-11 text-sm font-medium text-brand underline">Kalanı kartla tamamla</button>
    {invalid ? <p role="alert" className="text-sm text-bad">Geçerli tutar girin.</p> : result.ok ? <p className="text-sm">Para üstü: <b>{TL(result.change)}</b></p> : <p className="text-sm text-muted">{result.error}</p>}
    <button type="submit" disabled={busy || invalid || !result.ok} className="press min-h-12 w-full rounded-xl bg-espresso px-4 font-semibold text-white disabled:opacity-40">{busy ? "Kaydediliyor…" : "Tahsil et ve teslimi tamamla"}</button>
  </form>;
}
