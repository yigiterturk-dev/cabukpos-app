"use client";
// Kiosko sepeti: ekle/çıkar, not, ödeme niyeti → /api/kiosk → durum ekranı.
// Satırdaki + düğmesi "kiosk-add" olayı yayar; sepet dinler (aynı sayfada iki istemci bileşeni).
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatReceipt, type Currency } from "@/lib/core/money";
import { Select } from "@/components/Select";

export type CartItem = { id: string; name: string; price: number };

const emit = (i: CartItem) => window.dispatchEvent(new CustomEvent("kiosk-add", { detail: i }));

export function Cart({ storeId, secret, vertical, currency }: { storeId: string; secret: string; vertical: "restoran" | "market"; currency: Currency }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [payIntent, setPayIntent] = useState<"nakit" | "kart">("nakit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cartRef = useRef<HTMLElement>(null);
  const router = useRouter();

  useLayoutEffect(() => {
    const node = cartRef.current;
    if (!node) return;
    const sync = () => document.documentElement.style.setProperty("--kiosk-cart-space", `${node.getBoundingClientRect().height + 16}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--kiosk-cart-space");
    };
  }, []);

  useEffect(() => {
    const on = (e: Event) => { setError(null); setItems((xs) => [...xs, (e as CustomEvent<CartItem>).detail]); };
    window.addEventListener("kiosk-add", on);
    return () => window.removeEventListener("kiosk-add", on);
  }, []);

  const lines = useMemo(() => {
    const by = new Map<string, { id: string; qty: number }>();
    for (const i of items) by.set(i.id, { id: i.id, qty: (by.get(i.id)?.qty ?? 0) + 1 });
    return [...by.values()].map((l) => ({ ...l, item: items.find((i) => i.id === l.id)! }));
  }, [items]);
  const total = items.reduce((s, i) => s + i.price, 0);

  async function submit() {
    if (!lines.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storeId, secret, name: name.trim() || "Kiosk müşterisi", phone: phone.replace(/[^\d+]/g, ""),
          note: note.trim() || null, payIntent, lines: lines.map((l) => ({ productId: l.id, qtyMilli: l.qty * 1000, note: null })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.tabId) router.push(`/menu/${storeId}/s/${j.tabId}`);
      else setError(j.error ?? "Sipariş gönderilemedi.");
    } catch {
      setError("Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={cartRef} aria-label="Sepet" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto border-t border-line bg-surface/95 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-4 py-3">
        {items.length === 0 ? (
          <p className="py-1 text-center text-sm text-muted">Sipariş vermek için menüden seç.</p>
        ) : (
          <ul className="mb-2 space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <button type="button" aria-label={`${l.item.name} azalt`} className="grid size-12 shrink-0 place-items-center rounded-lg border border-line text-lg font-bold text-ink-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" onClick={() => setItems((xs) => { const ix = xs.findIndex((x) => x.id === l.id); return ix < 0 ? xs : [...xs.slice(0, ix), ...xs.slice(ix + 1)]; })}>−</button>
                <span className="tabular w-6 text-center font-semibold">{l.qty}</span>
                <button type="button" aria-label={`${l.item.name} artır`} className="grid size-12 shrink-0 place-items-center rounded-lg border border-line text-lg font-bold text-ink-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60" onClick={() => emit({ id: l.id, name: l.item.name, price: l.item.price })}>+</button>
                <span className="min-w-0 flex-1 truncate" title={l.item.name}>{l.item.name}</span>
                <span className="shrink-0 tabular text-ink-2">{formatReceipt(l.item.price * l.qty, currency)}</span>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Adın (isteğe bağlı)" aria-label="Adın (isteğe bağlı)" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="Telefon (isteğe bağlı)" aria-label="Telefon (isteğe bağlı)" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
            <Select ariaLabel="Ödeme" defaultValue="nakit" options={[{ value: "nakit", label: "Kasada nakit" }, { value: "kart", label: "Kasada kart" }]} onChange={(value) => setPayIntent(value as "nakit" | "kart")} />
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Not (isteğe bağlı)" aria-label="Sipariş notu (isteğe bağlı)" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 sm:col-span-3" />
          </div>
        )}
        {error && <p className="mb-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
        <button type="button" disabled={!lines.length || busy} onClick={submit} className="min-h-14 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50">
          {busy ? "Gönderiliyor…" : items.length ? `Siparişi gönder · ${formatReceipt(total, currency)}` : "Siparişi gönder"}
        </button>
        {vertical === "market" && <p className="mt-1 text-center text-xs text-muted">Tartılı ürünler kasada tartılır.</p>}
      </div>
    </section>
  );
}

/** Menü satırındaki + düğmesi; sepet "kiosk-add" olayıyla ekler. */
export function Add({ id, name, price }: CartItem) {
  return <button type="button" aria-label={`${name} sepete ekle`} title={`${name} sepete ekle`} className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand text-lg font-bold leading-none text-white outline-none transition-colors hover:bg-brand-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60" onClick={() => emit({ id, name, price })}>+</button>;
}

/** Garson çağır: masa seç, çağır. Açık çağrı varken düğme "Çağrın masada" durumuna düşer. */
export function WaiterCall({ storeId, secret, tables }: { storeId: string; secret: string; tables: { id: string; name: string }[] }) {
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call() {
    if (!tableId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/menu/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, secret, tableId, note: null }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setSent(true);
      else setError(j.error ?? "Çağrı gönderilemedi.");
    } catch {
      setError("Bağlantı kurulamadı. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-center text-sm text-ok" role="status">Garsona haber verdik, masana geliyor.</p>;
  return (
    <section aria-label="Garson çağır" className="mt-6 rounded-xl border border-line p-4">
      <h2 className="text-sm font-semibold text-ink">Garson çağır</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1"><Select ariaLabel="Masa" placeholder="Masanı seç" options={tables.map((t) => ({ value: t.id, label: t.name }))} onChange={(value) => { setTableId(value); setSent(false); }} /></div>
        <button type="button" disabled={!tableId || busy} onClick={call} className="press min-h-12 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-white outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50">
          {busy ? "Çağırılıyor…" : "Çağır"}
        </button>
      </div>
      {error && <p className="mt-1 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
    </section>
  );
}
