"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addProduct, lineTotal, setQty, totals, type CartLine } from "@/lib/core/cart";
import { formatTL, parseTL, type VatRate } from "@/lib/core/money";
import { settle, type Payment } from "@/lib/core/payment";
import { completeSale } from "@/lib/kasa/actions";

export type KasaProduct = { id: string; name: string; price: number; vatRate: VatRate; categoryId: string | null; barcodes: string[] };

function PayDialog({ cart, total, onClose, onDone }: { cart: CartLine[]; total: number; onClose: () => void; onDone: (r: { saleId: string; receiptNo: string; change: number }) => void }) {
  const [saleId] = useState(() => crypto.randomUUID()); // diyalog başına bir kez → tekrar denemede aynı satış (idempotent)
  const [cash, setCash] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const payments: Payment[] = [];
  const add = (method: Payment["method"], v: string | null) => { const k = v === null ? null : parseTL(v); if (k) payments.push({ method, amount: k }); };
  add("nakit", cash); add("kart", card); add("yemek_karti", meal);
  const s = settle(total, payments);
  const all = (m: "nakit" | "kart" | "yemek_karti") => { const v = formatTL(total).replace(" ₺", ""); setCash(m === "nakit" ? v : ""); setCard(m === "kart" ? v : null); setMeal(m === "yemek_karti" ? v : null); };
  const submit = () => start(async () => {
    setError(null);
    try {
      const r = await completeSale({ id: saleId, lines: cart.map((l) => ({ productId: l.productId, qtyMilli: l.qtyMilli })), payments });
      if (r.ok) onDone(r); else setError(r.error);
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin; satış iki kez kaydedilmez.");
    }
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Ödeme" className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Ödeme</h2><span className="tabular text-2xl font-bold">{formatTL(total)}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <button type="button" onClick={() => all("nakit")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı nakit</button>
          <button type="button" onClick={() => all("kart")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı kart</button>
          <button type="button" onClick={() => all("yemek_karti")} className="rounded-lg border border-line px-2 py-2 hover:bg-stone-50">Tamamı yemek kartı</button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3"><span className="w-28 text-sm">Alınan nakit</span><input name="amount-nakit" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /></label>
          {card !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm">Kart</span><input name="amount-kart" inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /><button type="button" aria-label="Kartı kaldır" onClick={() => setCard(null)} className="px-2 text-muted">×</button></label>}
          {meal !== null && <label className="flex items-center gap-3"><span className="w-28 text-sm">Yemek kartı</span><input name="amount-yemek_karti" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} className="tabular flex-1 rounded-lg border border-line px-3 py-2 text-right" /><button type="button" aria-label="Yemek kartını kaldır" onClick={() => setMeal(null)} className="px-2 text-muted">×</button></label>}
          <div className="flex gap-3 text-sm">
            {card === null && <button type="button" onClick={() => setCard("")} className="text-brand underline">Kart ekle</button>}
            {meal === null && <button type="button" onClick={() => setMeal("")} className="text-brand underline">Yemek kartı ekle</button>}
          </div>
        </div>
        <div className="mt-4 min-h-6 text-sm font-medium" aria-live="polite">
          {s.ok ? <span className="text-emerald-700">Para üstü {formatTL(s.change)}</span> : payments.length > 0 && <span className="text-red-700">{s.error}</span>}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-line py-3 text-sm">Vazgeç</button>
          <button type="button" disabled={!s.ok || pending} onClick={submit} className="flex-[2] rounded-lg bg-brand py-3 font-medium text-white disabled:opacity-40">{pending ? "Kaydediliyor…" : "Satışı tamamla"}</button>
        </div>
      </div>
    </div>
  );
}

export function SaleScreen({ categories, products }: { categories: { id: string; name: string }[]; products: KasaProduct[] }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState(false);
  const [last, setLast] = useState<{ saleId: string; receiptNo: string; change: number } | null>(null);
  const t = totals(cart);
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return products.filter((p) => (cat ? p.categoryId === cat : true) && (!needle || p.name.toLocaleLowerCase("tr").includes(needle) || p.barcodes.includes(q.trim())));
  }, [products, cat, q]);
  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = q.trim();
    const hit = products.find((p) => p.barcodes.includes(code)) ?? (shown.length === 1 ? shown[0] : undefined);
    if (hit) { setCart((c) => addProduct(c, hit)); setQ(""); setLast(null); }
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <section className="flex min-h-0 flex-col">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onScan} placeholder="Ürün ara ya da barkod okut" aria-label="Ürün ara ya da barkod okut" autoFocus className="mb-3 rounded-xl border border-line px-4 py-3" />
        <div className="mb-3 flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setCat(null)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${cat === null ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>Tümü</button>
          {categories.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${cat === c.id ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>{c.name}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => { setCart((c) => addProduct(c, p)); setLast(null); }} className="flex h-24 flex-col justify-between rounded-xl border border-line p-3 text-left hover:border-brand active:bg-brand-soft">
              <span className="font-medium leading-tight">{p.name}</span>
              <span className="tabular text-sm text-muted">{formatTL(p.price)}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted">Ürün yok.</p>}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col rounded-2xl border border-line">
        <div className="flex-1 divide-y divide-line overflow-y-auto">
          {cart.length === 0 && <p className="p-6 text-center text-sm text-muted">Sepet boş</p>}
          {cart.map((l) => (
            <div key={l.productId} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div><div className="tabular text-xs text-muted">{formatTL(l.unitPrice)}</div></div>
              <button type="button" aria-label={`${l.name} azalt`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli - 1000))} className="size-8 rounded-lg border border-line">−</button>
              <span className="tabular w-8 text-center">{l.qtyMilli / 1000}</span>
              <button type="button" aria-label={`${l.name} artır`} onClick={() => setCart((c) => setQty(c, l.productId, l.qtyMilli + 1000))} className="size-8 rounded-lg border border-line">+</button>
              <span className="tabular w-24 text-right font-medium">{formatTL(lineTotal(l))}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-4">
          {t.vat.map((v) => <div key={v.rate} className="tabular flex justify-between text-xs text-muted"><span>KDV %{v.rate}</span><span>{formatTL(v.vat)}</span></div>)}
          <div data-testid="cart-total" className="tabular mt-1 flex items-baseline justify-between"><span className="text-sm">TOPLAM</span><span className="text-3xl font-bold">{formatTL(t.total)}</span></div>
          {last && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Fiş {last.receiptNo} · Para üstü {formatTL(last.change)}
              <Link href={`/kasa/fis/${last.saleId}`} target="_blank" className="ml-2 font-medium underline">Fişi yazdır</Link>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setCart([])} disabled={!cart.length} className="rounded-xl border border-line py-4 text-sm disabled:opacity-40">Temizle</button>
            <button type="button" onClick={() => setPaying(true)} disabled={!cart.length} className="col-span-2 rounded-xl bg-brand py-4 text-lg font-semibold text-white disabled:opacity-40">Öde</button>
          </div>
        </div>
      </aside>
      {paying && <PayDialog cart={cart} total={t.total} onClose={() => setPaying(false)} onDone={(r) => { setPaying(false); setCart([]); setLast(r); }} />}
    </div>
  );
}
