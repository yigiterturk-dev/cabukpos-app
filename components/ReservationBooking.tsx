"use client";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
export function ReservationBooking({ token, day, guests, slots }: { token: string; day: string; guests: number; slots: string[] }) {
  const [time, setTime] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  if (done) return <div role="status" className="space-y-4 rounded-2xl bg-ok-soft p-6 text-ok"><h2 className="text-xl font-bold">Rezervasyon talebiniz alındı.</h2><p>{day} · {time} · {guests} kişi. İşletmenin onayını bekliyor. Referans: {id.slice(0, 8)}</p><Button onClick={() => { setDone(false); setId(crypto.randomUUID()); setTime(""); }}>Yeni rezervasyon</Button></div>;
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError(""); const f = new FormData(e.currentTarget);
    try { const r = await fetch(`/api/reservations/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, day, guests, time, name: String(f.get("name")), phone: String(f.get("phone")), note: String(f.get("note") ?? ""), website: String(f.get("website") ?? "") }) }); const body = await r.json(); if (!r.ok) throw new Error(body.error ?? "Talep gönderilemedi."); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Talep gönderilemedi."); } finally { setBusy(false); }
  }}>
    <p className="text-sm text-muted sm:col-span-2">{day} · {guests} kişi · Müsait saatlerden birini seçin.</p>
    <div className="sm:col-span-2"><Field label="Uygun saat"><select className="min-h-12 w-full rounded-xl border border-line bg-surface px-3" name="time" value={time} onChange={e => setTime(e.target.value)} disabled={busy || !slots.length} required><option value="">{slots.length ? "Saat seçin" : "Bu gün uygun saat yok"}</option>{slots.map(s => <option key={s} value={s}>{s}</option>)}</select></Field><a href={`?day=${day}&guests=${guests}`} className="mt-2 inline-flex min-h-11 items-center text-sm text-brand underline">Saatleri yenile</a></div>
    <Field label="Ad soyad"><Input name="name" required maxLength={120} autoComplete="name" disabled={busy} /></Field><Field label="Telefon"><Input name="phone" type="tel" required maxLength={24} autoComplete="tel" disabled={busy} /></Field>
    <div className="sm:col-span-2"><Field label="Not (isteğe bağlı)"><Input name="note" maxLength={300} disabled={busy} /></Field></div><div aria-hidden="true" className="absolute -left-[9999px]"><input name="website" tabIndex={-1} autoComplete="off" /></div>
    {error && <p role="alert" className="text-sm text-bad sm:col-span-2">{error}</p>}<Button type="submit" disabled={busy || !time} className="sm:col-span-2">{busy ? "Gönderiliyor…" : "Rezervasyon talebi gönder"}</Button><p className="text-xs text-muted sm:col-span-2">Saatler Türkiye saatidir. Bu form ödeme almaz. Rezervasyon işletmenin onayından sonra kesinleşir.</p>
  </form>;
}
