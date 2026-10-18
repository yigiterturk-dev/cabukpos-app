"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Delete } from "lucide-react";
import { verifyPin } from "@/lib/auth/pin";
import { kasaDb, loadMeta } from "@/lib/offline/db";
import { PIN_LOCK_MS, PIN_MAX_FAILS, type KasaStaff, type Meta } from "@/lib/offline/state";

const KEY = "press h-20 rounded-2xl border border-line bg-surface text-3xl font-semibold shadow-rest outline-none transition-[box-shadow,border-color,background-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 active:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40";

export type Cashier = { id: string; name: string };

/** PIN doğrulama cihazda (hash'ler katalogla iner). only: yalnız bu personel kabul (ör. iade onayı için müdür).
 *  Müdür eşleşmesinde ve çevrimiçiyken PIN /api/kasa/onay ile sunucuda da doğrulanır; dönüşte kısa ömürlü
 *  imzalı onay belirteci onOk'ya verilir (belgeyle buluta gider, apply'da tekrar doğrulanır). */
export function PinPad({ meta, onOk, onMeta, only, autoFocusFirst = false, previewOnly = false, serverPurpose }: { meta: Meta; onOk: (c: Cashier, approvalToken?: string) => void | Promise<void>; onMeta: (m: Meta) => void; only?: (s: KasaStaff) => boolean; autoFocusFirst?: boolean; previewOnly?: boolean; serverPurpose?: "courier-close" }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const submitRef = useRef(false);
  const firstKeyRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const locked = meta.pinLockUntil > now;
  const wasLockedRef = useRef<boolean | null>(null);
  const lockStatusRef = useRef<HTMLParagraphElement>(null);
  const lockMessageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (autoFocusFirst) firstKeyRef.current?.focus(); }, [autoFocusFirst]);
  useEffect(() => {
    if (!error || busy || locked || document.activeElement !== document.body) return;
    const frame = window.requestAnimationFrame(() => {
      if (document.activeElement === document.body) firstKeyRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, error, locked]);
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);
  useEffect(() => {
    let message = "";
    const unlocked = wasLockedRef.current === true && !locked;
    if (wasLockedRef.current === null) {
      if (locked) message = "PIN girişi geçici olarak kilitli. Ekrandaki süre dolunca yeniden deneyebilirsiniz.";
    } else if (wasLockedRef.current && !locked) message = "PIN kilidi kalktı. Yeniden deneyebilirsiniz.";
    else if (!wasLockedRef.current && locked) message = "PIN girişi geçici olarak kilitli. Ekrandaki süre dolunca yeniden deneyebilirsiniz.";
    wasLockedRef.current = locked;
    if (message && lockStatusRef.current) lockStatusRef.current.textContent = message;
    const active = document.activeElement;
    if (locked && (active === document.body || active instanceof HTMLButtonElement && active.disabled)) lockMessageRef.current?.focus();
    if (unlocked && document.activeElement === document.body) firstKeyRef.current?.focus();
  }, [locked]);
  const key = (d: string) => { setError(null); setPin((p) => (p.length < 6 ? p + d : p)); };
  const erase = () => { setError(null); setPin((p) => p.slice(0, -1)); };
  const submit = useCallback(async () => {
    if (submitRef.current || busy || locked || pin.length < 4) return;
    if (previewOnly) {
      setPin("");
      setError("Önizlemede PIN doğrulaması yapılmaz.");
      return;
    }
    submitRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const entered = pin;
      setPin("");
      let foundStaff: KasaStaff | null = null;
      if (serverPurpose) {
        if (!navigator.onLine) throw new Error("İnternet bağlantısı olmadan kasiyer PIN'i doğrulanamaz.");
        const r = await fetch("/api/kasa/onay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: serverPurpose, pin: entered }) });
        if (!r.ok) throw new Error(r.status === 429 ? "Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin." : "PIN hatalı. Tekrar deneyin.");
        const result = (await r.json()) as { staff?: { id: string } };
        foundStaff = meta.catalog.staff.find((s) => s.id === result.staff?.id) ?? null;
      } else {
        for (const s of meta.catalog.staff.filter(only ?? (() => true))) {
          if (!s.pinHash) continue;
          if (await verifyPin(entered, s.pinHash)) { foundStaff = s; break; }
        }
      }
      const found: Cashier | null = foundStaff ? { id: foundStaff.id, name: foundStaff.name } : null;
      // Müdür onayı: PIN sunucuda da doğrulanır, kısa ömürlü imzalı belirteç belgeyle buluta gider.
      let approvalToken: string | undefined;
      if (foundStaff?.role === "mudur" && navigator.onLine) {
        try {
          const r = await fetch("/api/kasa/onay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: foundStaff.id, pin: entered }) });
          if (r.ok) approvalToken = ((await r.json()) as { token?: string }).token;
        } catch { /* çevrimdışı: yerel doğrulama yeterli; belge onaysız gider ve bulutta review'lanır */ }
      }
      const m = await loadMeta();
      if (found) {
        await kasaDb().meta.put({ ...m, pinFails: 0, pinLockUntil: 0 });
        onMeta({ ...m, pinFails: 0, pinLockUntil: 0 });
        setWorking(true);
        try { await onOk(found, approvalToken); }
        catch { setError("PIN doğru, ancak işlem tamamlanamadı. Tekrar deneyin."); }
      } else {
        const fails = m.pinFails + 1;
        const next = fails >= PIN_MAX_FAILS ? { ...m, pinFails: 0, pinLockUntil: Date.now() + PIN_LOCK_MS } : { ...m, pinFails: fails };
        await kasaDb().meta.put(next);
        onMeta(next);
        setNow(Date.now());
        setError(fails >= PIN_MAX_FAILS ? null : `PIN hatalı. Kilitlenmeden önce ${PIN_MAX_FAILS - fails} deneme kaldı.`);
      }
    } catch (error) {
      setError(error instanceof TypeError ? "Doğrulama servisine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." : error instanceof Error ? error.message : "PIN doğrulanamadı. Tekrar deneyin.");
    } finally {
      setWorking(false);
      submitRef.current = false;
      setBusy(false);
    }
  }, [busy, locked, meta, onMeta, onOk, only, pin, previewOnly, serverPurpose]);
  useEffect(() => {
    // The design preview keeps a static PIN pad mounted beside other live screens.
    // Its global keyboard handler must not consume those screens' Enter/digit keys.
    if (previewOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if (!locked && !busy) key(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (!locked && !busy) erase();
      } else if (e.key === "Enter") {
        // Let focused keypad and dialog buttons keep their native Enter action.
        if (e.target instanceof HTMLElement && e.target.closest('button, a, [role="button"]')) return;
        e.preventDefault();
        if (!locked && !busy) void submit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, locked, previewOnly, submit]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-label={only ? "Yetkili PIN girişi" : "PIN girişi"} aria-busy={busy} className="mx-auto w-full max-w-xs">
      <div className="mb-6 flex h-6 items-center justify-center gap-4" role="status" aria-live="polite" aria-atomic="true">
        <span className="sr-only">{working ? "İşlem uygulanıyor." : busy ? "PIN kontrol ediliyor." : `${pin.length} hane girildi.`}</span>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} aria-hidden="true" className={`size-4 rounded-full transition ${i < pin.length ? "scale-110 bg-brand-action" : "border-2 border-line-strong"}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} ref={d === "1" ? firstKeyRef : undefined} type="button" disabled={busy || locked} onClick={() => key(d)} className={KEY}>{d}</button>
        ))}
        <button type="button" aria-label="Sil" disabled={busy || locked} onClick={erase} className="press grid h-20 place-items-center rounded-2xl text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40"><Delete aria-hidden className="size-7" /></button>
        <button type="button" disabled={busy || locked} onClick={() => key("0")} className={KEY}>0</button>
      <button type="submit" disabled={busy || locked || pin.length < 4} className="press h-20 rounded-2xl bg-brand-action text-xl font-semibold text-white shadow-rest ring-1 ring-inset ring-white/15 outline-none hover:bg-brand-action-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-40">{working ? "İşleniyor…" : busy ? "Kontrol ediliyor…" : "Gir"}</button>
      </div>
      {locked && <>
        <p ref={lockMessageRef} tabIndex={-1} aria-live="off" className="mt-4 break-words text-center text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30">Çok fazla yanlış deneme. {Math.ceil((meta.pinLockUntil - now) / 1000)} sn sonra tekrar deneyin.</p>
      </>}
      <p ref={lockStatusRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      {error && !locked && <p className="mt-4 break-words text-center text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
      {!only && <p className="mt-5 text-center text-xs text-muted">PIN’i bilmiyor musun? <Link href="/giris" className="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-2 hover:text-brand-hover">Yönetim panelinden değiştir</Link></p>}
    </form>
  );
}
