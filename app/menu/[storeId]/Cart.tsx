"use client";
// Kiosko sepeti: ekle/çıkar, not, ödeme niyeti → /api/kiosk → durum ekranı.
// Satırdaki + düğmesi "kiosk-add" olayı yayar; sepet dinler (aynı sayfada iki istemci bileşeni).
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatTL } from "@/lib/core/money";

export type CartItem = { id: string; name: string; price: number };

const emit = (i: CartItem) => window.dispatchEvent(new CustomEvent("kiosk-add", { detail: i }));

export function Cart({ storeId, secret, vertical }: { storeId: string; secret: string; vertical: "restoran" | "market" }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [payIntent, setPayIntent] = useState<"nakit" | "kart">("nakit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
    const res = await fetch("/api/kiosk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId, secret, name: name.trim() || "Kiosk müşterisi", phone: phone.replace(/[^\d+]/g, ""),
        note: note.trim() || null, payIntent, lines: lines.map((l) => ({ productId: l.id, qtyMilli: l.qty * 1000, note: null })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.tabId) router.push(`/menu/${storeId}/s/${j.tabId}`);
    else setError(j.error ?? "Sipariş gönderilemedi.");
  }

  return (
    <section aria-label="Sepet" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-4 py-3">
        {items.length === 0 ? (
          <p className="py-1 text-center text-sm text-muted">Sipariş vermek için menüden seç.</p>
        ) : (
          <ul className="mb-2 space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <button aria-label="Azalt" className="size-7 rounded-lg border border-line font-bold text-ink-2" onClick={() => setItems((xs) => { const ix = xs.findIndex((x) => x.id === l.id); return ix < 0 ? xs : [...xs.slice(0, ix), ...xs.slice(ix + 1)]; })}>−</button>
                <span className="tabular w-6 text-center font-semibold">{l.qty}</span>
                <button aria-label="Arttır" className="size-7 rounded-lg border border-line font-bold text-ink-2" onClick={() => emit({ id: l.id, name: l.item.name, price: l.item.price })}>+</button>
                <span className="min-w-0 flex-1 truncate">{l.item.name}</span>
                <span className="tabular text-ink-2">{formatTL(l.item.price * l.qty)}</span>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Adın (isteğe bağlı)" className="h-10 rounded-lg border border-line px-3 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="Telefon (isteğe bağlı)" className="h-10 rounded-lg border border-line px-3 text-sm" />
            <select value={payIntent} onChange={(e) => setPayIntent(e.target.value as "nakit" | "kart")} className="h-10 rounded-lg border border-line px-3 text-sm" aria-label="Ödeme">
              <option value="nakit">Kasada nakit</option>
              <option value="kart">Kasada kart</option>
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Not (isteğe bağlı)" className="h-10 rounded-lg border border-line px-3 text-sm sm:col-span-3" />
          </div>
        )}
        {error && <p className="mb-1 text-sm text-bad" role="alert">{error}</p>}
        <button disabled={!lines.length || busy} onClick={submit} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "Gönderiliyor…" : items.length ? `Siparişi gönder · ${formatTL(total)}` : "Siparişi gönder"}
        </button>
        {vertical === "market" && <p className="mt-1 text-center text-xs text-muted">Tartılı ürünler kasada tartılır.</p>}
      </div>
    </section>
  );
}

/** Menü satırındaki + düğmesi; sepet "kiosk-add" olayıyla ekler. */
export function Add({ id, name, price }: CartItem) {
  return <button aria-label={`${name} sepete ekle`} className="size-8 shrink-0 rounded-lg bg-brand text-lg font-bold leading-none text-white" onClick={() => emit({ id, name, price })}>+</button>;
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
    const res = await fetch("/api/menu/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, secret, tableId, note: null }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(j.error ?? "Çağrı gönderilemedi.");
  }

  if (sent) return <p className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-center text-sm text-ok" role="status">Garsona haber verdik, masana geliyor.</p>;
  return (
    <section aria-label="Garson çağır" className="mt-6 rounded-xl border border-line p-4">
      <h2 className="text-sm font-semibold text-ink">Garson çağır</h2>
      <div className="mt-2 flex gap-2">
        <select value={tableId} onChange={(e) => { setTableId(e.target.value); setSent(false); }} aria-label="Masa" className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm">
          <option value="">Masanı seç</option>
          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button disabled={!tableId || busy} onClick={call} className="press min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Çağırılıyor…" : "Çağır"}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-bad" role="alert">{error}</p>}
    </section>
  );
}
