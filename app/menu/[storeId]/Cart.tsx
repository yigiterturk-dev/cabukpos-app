"use client";
// Kiosko sepeti: ekle/çıkar, not, ödeme niyeti → /api/kiosk → durum ekranı.
// Satırdaki + düğmesi "kiosk-add" olayı yayar; sepet dinler (aynı sayfada iki istemci bileşeni).
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatReceipt, type Currency } from "@/lib/core/money";
import { Select } from "@/components/Select";
import { Field } from "@/components/ui";

export type CartItem = { id: string; name: string; price: number };

const emit = (i: CartItem) => window.dispatchEvent(new CustomEvent("kiosk-add", { detail: i }));
const lockMenu = (locked: boolean) => window.dispatchEvent(new CustomEvent("kiosk-lock", { detail: locked }));

export function Cart({ storeId, secret, vertical, currency }: { storeId: string; secret: string; vertical: "restoran" | "market"; currency: Currency }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [payIntent, setPayIntent] = useState<"nakit" | "kart">("nakit");
  const [busy, setBusy] = useState(false);
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const cartRef = useRef<HTMLElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<CartItem[]>([]);
  const busyRef = useRef(false);
  const uncertainRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!retryError || !error || busy) return;
    const frame = window.requestAnimationFrame(() => submitRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [busy, error, retryError]);

  useLayoutEffect(() => {
    const node = cartRef.current;
    if (!node) return;
    const viewport = window.visualViewport;
    const sync = () => {
      const visibleHeight = Math.max(1, Math.min(window.innerHeight, viewport?.height ?? window.innerHeight));
      const visibleBottom = (viewport?.offsetTop ?? 0) + visibleHeight;
      const bottomInset = Math.max(0, window.innerHeight - visibleBottom);
      document.documentElement.style.setProperty("--kiosk-cart-visible-height", `${visibleHeight}px`);
      document.documentElement.style.setProperty("--kiosk-cart-bottom-inset", `${bottomInset}px`);
      document.documentElement.style.setProperty("--kiosk-cart-space", `${node.getBoundingClientRect().height + bottomInset + 16}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    window.addEventListener("resize", sync);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      document.documentElement.style.removeProperty("--kiosk-cart-visible-height");
      document.documentElement.style.removeProperty("--kiosk-cart-bottom-inset");
      document.documentElement.style.removeProperty("--kiosk-cart-space");
    };
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      setRetryError(false);
      if (busyRef.current || uncertainRef.current) { setError(uncertainRef.current ? "Siparişin sonucu henüz doğrulanmadı. Aynı siparişi yeniden gönderin." : "Sipariş gönderilirken sepet düzenlenemez."); return; }
      const item = (e as CustomEvent<CartItem>).detail;
      const current = itemsRef.current;
      const count = current.filter((x) => x.id === item.id).length;
      if (count >= 100) { setError(`${item.name}: bir siparişte en fazla 100 adet seçebilirsiniz.`); return; }
      if (count === 0 && new Set(current.map((x) => x.id)).size >= 50) { setError("Bir siparişte en fazla 50 farklı ürün olabilir."); return; }
      requestIdRef.current = null;
      const next = [...current, item];
      itemsRef.current = next;
      setItems(next);
      const nextTotal = next.reduce((sum, line) => sum + line.price, 0);
      setCartNotice(`${item.name} sepete eklendi. Adet: ${count + 1}. Sepet toplamı ${formatReceipt(nextTotal, currency)}.`);
      setError(null);
    };
    window.addEventListener("kiosk-add", on);
    return () => window.removeEventListener("kiosk-add", on);
  }, [currency]);

  const lines = useMemo(() => {
    const by = new Map<string, { id: string; qty: number }>();
    for (const i of items) by.set(i.id, { id: i.id, qty: (by.get(i.id)?.qty ?? 0) + 1 });
    return [...by.values()].map((l) => ({ ...l, item: items.find((i) => i.id === l.id)! }));
  }, [items]);
  const total = items.reduce((s, i) => s + i.price, 0);

  async function submit() {
    if (!lines.length || busyRef.current) return;
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    busyRef.current = true;
    setBusy(true);
    lockMenu(true);
    setRetryError(false);
    setError(null);
    let navigating = false;
    let uncertain = false;
    try {
      const res = await fetch("/api/kiosk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId, secret, requestId, name: name.trim() || "Kiosk müşterisi", phone: phone.replace(/[^\d+]/g, ""),
          note: note.trim() || null, payIntent, lines: lines.map((l) => ({ productId: l.id, qtyMilli: l.qty * 1000, note: null })),
        }),
        signal: AbortSignal.timeout(8000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.tabId) { navigating = true; router.push(`/menu/${storeId}/s/${j.tabId}`); }
      else if (res.status >= 500) {
        uncertain = true;
        setUncertainSubmission(true);
        uncertainRef.current = true;
        setError("Sipariş sunucuya ulaşmış olabilir. Sonucu doğrulamak için aynı siparişi yeniden gönderin.");
        setRetryError(true);
      } else {
        requestIdRef.current = null;
        setUncertainSubmission(false);
        uncertainRef.current = false;
        setError(j.error ?? "Sipariş gönderilemedi.");
        setRetryError(true);
      }
    } catch {
      uncertain = true;
      setUncertainSubmission(true);
      uncertainRef.current = true;
      setError("Sipariş sunucuya ulaşmış olabilir. Sonucu doğrulamak için aynı siparişi yeniden gönderin.");
      setRetryError(true);
    } finally {
      if (!navigating) {
        busyRef.current = false;
        setBusy(false);
        if (uncertain) lockMenu(true);
        else lockMenu(false);
      }
    }
  }

  return (
    <section id="kiosk-cart" ref={cartRef} tabIndex={-1} aria-label="Sepet" style={{ paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "min(80vh, var(--kiosk-cart-visible-height, 100vh))", bottom: "var(--kiosk-cart-bottom-inset, 0px)" }} className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto border-t border-line bg-surface/95 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 backdrop-blur">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-busy={busy} className="mx-auto w-full max-w-xl px-4 py-3">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{busy ? "Sipariş gönderiliyor. Lütfen bekleyin." : cartNotice}</p>
        {items.length === 0 ? (
          <p className="py-1 text-center text-sm text-muted">Sipariş vermek için menüden seç.</p>
        ) : (
          <ul className="mb-2 space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex min-w-0 flex-wrap items-center gap-2">
              <button type="button" aria-label={`${l.item.name} miktarını azalt`} disabled={busy || uncertainSubmission} className="grid size-12 shrink-0 place-items-center rounded-lg border border-line text-lg font-bold text-ink-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40" onClick={(e) => { const xs = itemsRef.current; const ix = xs.findIndex((x) => x.id === l.id); if (ix < 0) return; const next = [...xs.slice(0, ix), ...xs.slice(ix + 1)]; requestIdRef.current = null; itemsRef.current = next; setItems(next); const remaining = next.filter((x) => x.id === l.id).length; if (remaining === 0 && document.activeElement === e.currentTarget) requestAnimationFrame(() => { const addButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-kiosk-add]:not(:disabled)")]; (addButtons.find((button) => button.dataset.kioskAdd === l.id) ?? addButtons[0] ?? cartRef.current)?.focus(); }); setCartNotice(remaining ? `${l.item.name} adedi ${remaining}. Sepet toplamı ${formatReceipt(next.reduce((sum, item) => sum + item.price, 0), currency)}.` : `${l.item.name} sepetten çıkarıldı.`); setError(null); setRetryError(false); }}>−</button>
                <span className="tabular w-6 text-center font-semibold">{l.qty}</span>
                <button type="button" aria-label={`${l.item.name} miktarını artır`} disabled={busy || uncertainSubmission || l.qty >= 100} className="grid size-12 shrink-0 place-items-center rounded-lg border border-line text-lg font-bold text-ink-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => emit({ id: l.id, name: l.item.name, price: l.item.price })}>+</button>
                <span className="order-first basis-full break-words font-medium text-ink">{l.item.name}</span>
                <span className="ml-auto shrink-0 tabular text-ink-2">{formatReceipt(l.item.price * l.qty, currency)}</span>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <label className="block min-w-0 text-xs font-medium text-muted">Ad soyad (isteğe bağlı)<input name="name" value={name} onChange={(e) => { requestIdRef.current = null; setName(e.target.value); setError(null); setRetryError(false); }} disabled={busy || uncertainSubmission} maxLength={60} autoComplete="name" placeholder="Ör. Ayşe Yılmaz" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-60 lg:text-sm" /></label>
            <label className="block min-w-0 text-xs font-medium text-muted">Telefon (isteğe bağlı)<input name="phone" type="tel" value={phone} onChange={(e) => { requestIdRef.current = null; setPhone(e.target.value); setError(null); setRetryError(false); }} disabled={busy || uncertainSubmission} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-60 lg:text-sm" /></label>
            <div className="min-w-0"><Field label="Ödeme tercihi"><Select disabled={busy || uncertainSubmission} defaultValue="nakit" options={[{ value: "nakit", label: "Kasada nakit" }, { value: "kart", label: "Kasada kart" }]} onChange={(value) => { requestIdRef.current = null; setPayIntent(value as "nakit" | "kart"); setError(null); setRetryError(false); }} /></Field></div>
            <label className="block min-w-0 text-xs font-medium text-muted sm:col-span-3">Sipariş notu (isteğe bağlı)<input name="note" value={note} onChange={(e) => { requestIdRef.current = null; setNote(e.target.value); setError(null); setRetryError(false); }} disabled={busy || uncertainSubmission} maxLength={300} placeholder="Ör. Zili çalın" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-60 lg:text-sm" /></label>
          </div>
        )}
        {error && <p className="mb-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
        <button ref={submitRef} type="submit" aria-busy={busy} disabled={!lines.length || busy} className="min-h-14 w-full rounded-xl bg-brand-action px-4 py-3 font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50">
          {busy ? "Gönderiliyor…" : uncertainSubmission ? `Aynı siparişi yeniden gönder · ${formatReceipt(total, currency)}` : items.length ? `Siparişi gönder · ${formatReceipt(total, currency)}` : "Siparişi gönder"}
        </button>
        {vertical === "market" && <p className="mt-1 text-center text-xs text-muted">Tartılı ürünler kasada tartılır.</p>}
      </form>
    </section>
  );
}

/** Menü satırındaki + düğmesi; sepet "kiosk-add" olayıyla ekler. */
export function Add({ id, name, price }: CartItem) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setLocked(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("kiosk-lock", on);
    return () => window.removeEventListener("kiosk-lock", on);
  }, []);
  return <button type="button" data-kiosk-add={id} aria-label={`${name} sepete ekle`} title={`${name} sepete ekle`} disabled={locked} className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-action text-lg font-bold leading-none text-white outline-none transition-colors hover:bg-brand-action-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => emit({ id, name, price })}>+</button>;
}

/** Garson çağır: masa seç, çağır. Açık çağrı varken düğme "Çağrın masada" durumuna düşer. */
export function WaiterCall({ storeId, secret, tables }: { storeId: string; secret: string; tables: { id: string; name: string }[] }) {
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const selectedTableExists = tables.some((table) => table.id === tableId);

  async function call() {
    if (!selectedTableExists || busyRef.current || sent) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/menu/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, secret, tableId, note: null }),
        signal: AbortSignal.timeout(8000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setSent(true);
      else setError(j.error ?? "Çağrı gönderilemedi.");
    } catch {
      setError("Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="Garson çağır" className="mt-6 rounded-xl border border-line p-4">
      <h2 className="text-sm font-semibold text-ink">Garson çağır</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1"><Field label="Masa" hint="Garson çağırmak için masa seçin"><Select placeholder="Masanı seç" disabled={busy} aria-required options={tables.map((t) => ({ value: t.id, label: t.name }))} onChange={(value) => { if (value === tableId) return; setTableId(value); setSent(false); setError(null); }} /></Field></div>
        <button type="button" disabled={!selectedTableExists} aria-disabled={busy || sent || undefined} aria-busy={busy || undefined} onClick={call} className="press min-h-12 shrink-0 rounded-lg bg-brand-action px-4 text-sm font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
          {busy ? "Çağırılıyor…" : sent ? "Çağrı gönderildi" : "Çağır"}
        </button>
      </div>
      {busy && <p className="sr-only" role="status" aria-live="polite">Garson çağrısı gönderiliyor. Lütfen bekleyin.</p>}
      {sent && <p className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-center text-sm text-ok" role="status">Garsona haber verdik, masana geliyor. Başka bir masa için seçim yapabilirsin.</p>}
      {error && <p className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
    </section>
  );
}
