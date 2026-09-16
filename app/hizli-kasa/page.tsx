"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatTRY, todayISO } from "@/lib/utils";
import { sectorTerms } from "@/lib/sectors";
import type { Staff } from "@/lib/types";
import { IcBarcode, IcPlus, IcTrash, IcCheck } from "@/components/icons";

type CartLine = { serviceId: string; name: string; price: number; qty: number };

const PERAKENDE = "Perakende";

export default function HizliKasaPage() {
  const { state, addAppointment, addPayment, upsertService, addCustomer, upsertStaff } = useStore();
  const terms = sectorTerms(state.sector);

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [flash, setFlash] = useState<string>("");
  const [method, setMethod] = useState<"nakit" | "kart" | "havale" | "veresiye">("nakit");
  const [customerId, setCustomerId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [done, setDone] = useState<{ total: number; veresiye: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

  // Barkod birebir → ad içeren → sıralı liste
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    const byBarcode = state.services.filter(
      (s) => s.barcode && s.barcode.toLowerCase() === q && s.active !== false
    );
    if (byBarcode.length > 0) return byBarcode;
    return state.services.filter(
      (s) => s.name.toLocaleLowerCase("tr").includes(q) && s.active !== false
    );
  }, [query, state.services]);

  function addToCart(svcId: string) {
    const svc = state.services.find((s) => s.id === svcId);
    if (!svc) return;
    setCart((prev) => {
      const i = prev.findIndex((l) => l.serviceId === svc.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { serviceId: svc.id, name: svc.name, price: svc.price, qty: 1 }];
    });
    setQuery("");
    inputRef.current?.focus();
  }

  function onScanEnter() {
    if (matches.length === 1) {
      addToCart(matches[0].id);
      setQuery("");
    }
    // 0 veya çoklu eşleşme: alttaki listeden seçim beklenir
  }

  function setQty(serviceId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.serviceId === serviceId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function submit() {
    if (cart.length === 0) return;

    // Kasiyer garantisi: hiç personel yoksa bir "Kasiyer" aç.
    let sid = staffId || state.staff[0]?.id || "";
    if (!sid) {
      const kasiyer: Staff = {
        id: "stf-kasa-" + Date.now().toString(36),
        name: "Kasiyer",
        role: "Kasa",
        color: "#1B7A5A",
        initials: "K",
      };
      upsertStaff(kasiyer);
      sid = kasiyer.id;
      setStaffId(sid);
    }

    // Veresiye gerçek cari ister; perakende satış otomatik "Perakende" carisine gider.
    let cid = customerId;
    if (method === "veresiye" && !cid) {
      setFlash("Veresiye için önce cari seçin.");
      return;
    }
    if (!cid) {
      const existing = state.customers.find((c) => c.name === PERAKENDE);
      cid = existing?.id ?? addCustomer({ name: PERAKENDE, phone: "—" }).id;
    }

    const now = new Date();
    const start = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const date = todayISO();

    // Satır başına birim adisyon (masalar akışıyla aynı model — ciro/prim raporları doğru kalır)
    for (const line of cart) {
      for (let i = 0; i < line.qty; i++) {
        addAppointment({
          date,
          start,
          staffId: sid,
          customerId: cid,
          serviceId: line.serviceId,
          status: "geldi",
        });
      }
    }

    // Stok düşümü — hizmet başına tek güncelleme (state yarışını önler)
    for (const line of cart) {
      const svc = state.services.find((s) => s.id === line.serviceId);
      if (svc?.trackStock) {
        upsertService({ ...svc, stock: Math.max(0, (svc.stock ?? 0) - line.qty) });
      }
    }

    if (method !== "veresiye") {
      addPayment({
        date,
        amount: total,
        method,
        customerId: cid,
        note: "Hızlı Kasa satışı",
      });
    }

    setDone({ total, veresiye: method === "veresiye" });
    setCart([]);
    setQuery("");
    inputRef.current?.focus();
  }

  if (done) {
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
            <IcCheck className="h-8 w-8 text-brand" />
          </div>
          <h2 className="mt-5 font-display text-[24px] font-extrabold text-ink">
            {done.veresiye ? "Cari hesaba işlendi" : `Tahsil edildi · ${formatTRY(done.total)}`}
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            {done.veresiye
              ? "Tutar cari ekstresine borç olarak yazıldı."
              : "Satış kasaya işlendi, stoklar güncellendi."}
          </p>
          <button
            onClick={() => {
              setDone(null);
              setCart([]);
              setMethod("nakit");
              setCustomerId("");
            }}
            className="mt-8 rounded-xl bg-brand px-6 py-3 text-[15px] font-semibold text-white shadow-card transition hover:bg-brand-deep"
          >
            Yeni Satış
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1200px]">
        <SectionTitle sub="Barkod okut, ara ya da listeden seç — satış saniyeler içinde">
          Hızlı Kasa
        </SectionTitle>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Sol: arama + ürün listesi */}
          <div>
            <div className="relative">
              <IcBarcode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onScanEnter()}
                placeholder="Barkod okut veya ürün ara…"
                className="w-full rounded-xl border border-line bg-white py-4 pl-12 pr-4 text-[16px] font-medium text-ink shadow-card outline-none transition placeholder:text-muted/60 focus:border-brand/40"
              />
            </div>

            {query.trim() !== "" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {matches.length === 0 ? (
                  <p className="rounded-xl bg-canvas px-4 py-3 text-[13.5px] text-muted sm:col-span-2">
                    Eşleşme yok — ürünü <Link href="/urunler" className="font-semibold text-brand underline underline-offset-2">Ürünler</Link> sayfasından ekleyebilirsin.
                  </p>
                ) : (
                  matches.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => addToCart(s.id)}
                      className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:border-brand/40 hover:shadow-card"
                    >
                      <span className="text-[14px] font-semibold text-ink">{s.name}</span>
                      <span className="text-[14px] font-bold text-brand">{formatTRY(s.price)}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {query.trim() === "" && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {state.services.filter((s) => s.active !== false).slice(0, 12).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => addToCart(s.id)}
                    className="flex flex-col items-start rounded-xl border border-line bg-white p-3 text-left transition hover:border-brand/40 hover:shadow-card"
                  >
                    <span className="text-[13.5px] font-semibold leading-snug text-ink">{s.name}</span>
                    <span className="mt-1 text-[14px] font-bold text-brand">{formatTRY(s.price)}</span>
                    {s.trackStock && (
                      <span className={`mt-1 text-[11.5px] font-medium ${(s.stock ?? 0) > 0 ? "text-muted" : "text-rose"}`}>
                        Stok: {s.stock ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sağ: sepet + tahsilat */}
          <Card className="flex h-fit flex-col p-5 lg:sticky lg:top-24">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Sepet</h3>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-muted">Barkod okut ya da soldan seç.</p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {cart.map((l) => {
                  const svc = state.services.find((s) => s.id === l.serviceId);
                  const stockLeft = svc?.trackStock ? (svc.stock ?? 0) - l.qty : null;
                  return (
                    <div key={l.serviceId} className="flex items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{l.name}</p>
                        <p className="text-[12px] text-muted">
                          {formatTRY(l.price)} × {l.qty}
                          {stockLeft !== null && (
                            <span className={stockLeft < 0 ? "font-semibold text-rose" : ""}> · kalan {stockLeft}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQty(l.serviceId, -1)} className="h-7 w-7 rounded-lg bg-canvas text-[16px] font-bold text-ink transition hover:bg-line">−</button>
                        <span className="w-6 text-center text-[14px] font-bold text-ink">{l.qty}</span>
                        <button onClick={() => setQty(l.serviceId, 1)} className="h-7 w-7 rounded-lg bg-canvas text-[16px] font-bold text-ink transition hover:bg-line">+</button>
                      </div>
                      <span className="w-20 text-right text-[14px] font-bold text-brand">{formatTRY(l.price * l.qty)}</span>
                      <button
                        onClick={() => setCart((prev) => prev.filter((x) => x.serviceId !== l.serviceId))}
                        className="rounded-lg p-1 text-muted transition hover:bg-rose/10 hover:text-rose"
                        title="Satırı sil"
                      >
                        <IcTrash className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-end justify-between">
                <span className="text-[14px] font-semibold text-muted">Toplam</span>
                <span className="font-display text-[26px] font-extrabold text-ink">{formatTRY(total)}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["nakit", "kart", "havale", "veresiye"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition ${
                      method === m
                        ? "bg-brand text-white shadow-card"
                        : "bg-canvas text-ink ring-1 ring-line hover:ring-brand/30"
                    }`}
                  >
                    {m === "veresiye" ? "Veresiye (Cari)" : m}
                  </button>
                ))}
              </div>

              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-3 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand/40"
              >
                <option value="">{method === "veresiye" ? "Cari seçin (zorunlu)" : `Perakende (${terms.customer})`}</option>
                {state.customers
                  .filter((c) => c.name !== PERAKENDE)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>

              {state.staff.length > 1 && (
                <select
                  value={staffId || state.staff[0].id}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand/40"
                >
                  {state.staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              {flash && <p className="mt-2 text-[12.5px] font-semibold text-rose">{flash}</p>}

              <button
                onClick={submit}
                disabled={cart.length === 0}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white shadow-card transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IcPlus className="h-4.5 w-4.5" />
                {method === "veresiye" ? "Cari Hesaba Yaz" : "Satışı Tamamla"}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
