"use client";
import { useEffect, useState } from "react";
import { verifyPin } from "@/lib/auth/pin";
import { kasaDb, loadMeta } from "@/lib/offline/db";
import { PIN_LOCK_MS, PIN_MAX_FAILS, type KasaStaff, type Meta } from "@/lib/offline/state";

export type Cashier = { id: string; name: string };

/** PIN doğrulama cihazda (hash'ler katalogla iner). only: yalnız bu personel kabul (ör. iade onayı için müdür). */
export function PinPad({ meta, onOk, onMeta, only }: { meta: Meta; onOk: (c: Cashier) => void; onMeta: (m: Meta) => void; only?: (s: KasaStaff) => boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const locked = meta.pinLockUntil > now;
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);
  const key = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  const submit = async () => {
    setBusy(true);
    setError(null);
    const entered = pin;
    setPin("");
    let found: Cashier | null = null;
    for (const s of meta.catalog.staff.filter(only ?? (() => true))) if (await verifyPin(entered, s.pinHash)) { found = { id: s.id, name: s.name }; break; }
    const m = await loadMeta();
    if (found) {
      await kasaDb().meta.put({ ...m, pinFails: 0, pinLockUntil: 0 });
      onMeta({ ...m, pinFails: 0, pinLockUntil: 0 });
      onOk(found);
    } else {
      const fails = m.pinFails + 1;
      const next = fails >= PIN_MAX_FAILS ? { ...m, pinFails: 0, pinLockUntil: Date.now() + PIN_LOCK_MS } : { ...m, pinFails: fails };
      await kasaDb().meta.put(next);
      onMeta(next);
      setNow(Date.now());
      setError(fails >= PIN_MAX_FAILS ? null : "PIN hatalı.");
    }
    setBusy(false);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mx-auto w-full max-w-xs">
      <div className="mb-4 flex h-12 items-center justify-center gap-3" aria-label="Girilen PIN">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={`size-3.5 rounded-full ${i < pin.length ? "bg-ink" : "border-2 border-line"}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => key(d)} className="h-16 rounded-xl border border-line text-2xl font-medium hover:bg-stone-50 active:bg-stone-100">{d}</button>
        ))}
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-xl text-sm text-muted hover:bg-stone-50">Sil</button>
        <button type="button" onClick={() => key("0")} className="h-16 rounded-xl border border-line text-2xl font-medium hover:bg-stone-50 active:bg-stone-100">0</button>
        <button type="submit" disabled={busy || locked || pin.length < 4} className="h-16 rounded-xl bg-brand text-lg font-medium text-white disabled:opacity-40">Gir</button>
      </div>
      {locked && <p className="mt-4 text-center text-sm text-red-700">Çok fazla yanlış deneme. {Math.ceil((meta.pinLockUntil - now) / 1000)} sn sonra tekrar deneyin.</p>}
      {error && !locked && <p className="mt-4 text-center text-sm text-red-700">{error}</p>}
    </form>
  );
}
