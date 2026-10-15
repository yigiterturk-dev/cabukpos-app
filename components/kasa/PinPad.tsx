"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Delete } from "lucide-react";
import { verifyPin } from "@/lib/auth/pin";
import { kasaDb, loadMeta } from "@/lib/offline/db";
import { PIN_LOCK_MS, PIN_MAX_FAILS, type KasaStaff, type Meta } from "@/lib/offline/state";

const KEY = "press h-20 rounded-2xl border border-line bg-surface text-3xl font-semibold shadow-rest outline-none transition-[box-shadow,border-color,background-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40";

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
  const submit = useCallback(async () => {
    if (busy || locked || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
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
    } catch {
      setError("PIN doğrulanamadı. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }, [busy, locked, meta, onMeta, onOk, only, pin]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if (!locked && !busy) key(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (!locked && !busy) setPin((p) => p.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!locked && !busy) void submit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, locked, submit]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-label={only ? "Yetkili PIN girişi" : "PIN girişi"} className="mx-auto w-full max-w-xs">
      <div className="mb-6 flex h-6 items-center justify-center gap-4" aria-label={`${pin.length} hane girildi`} aria-live="polite">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={`size-4 rounded-full transition ${i < pin.length ? "scale-110 bg-brand" : "border-2 border-line-strong"}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" disabled={busy || locked} onClick={() => key(d)} className={KEY}>{d}</button>
        ))}
        <button type="button" aria-label="Sil" disabled={busy || locked} onClick={() => setPin((p) => p.slice(0, -1))} className="press grid h-20 place-items-center rounded-2xl text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40"><Delete aria-hidden className="size-7" /></button>
        <button type="button" disabled={busy || locked} onClick={() => key("0")} className={KEY}>0</button>
        <button type="submit" disabled={busy || locked || pin.length < 4} className="press h-20 rounded-2xl bg-brand text-xl font-semibold text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:bg-brand-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">{busy ? "Kontrol ediliyor…" : "Gir"}</button>
      </div>
      {locked && <p className="mt-4 break-words text-center text-sm text-bad" role="alert" aria-live="polite">Çok fazla yanlış deneme. {Math.ceil((meta.pinLockUntil - now) / 1000)} sn sonra tekrar deneyin.</p>}
      {error && !locked && <p className="mt-4 break-words text-center text-sm text-bad" role="alert" aria-live="polite">{error}</p>}
      {!only && <p className="mt-5 text-center text-xs text-muted">PIN’i bilmiyor musun? <Link href="/giris" className="font-medium text-brand underline underline-offset-2 hover:text-brand-hover">Yönetim panelinden değiştir</Link></p>}
    </form>
  );
}
