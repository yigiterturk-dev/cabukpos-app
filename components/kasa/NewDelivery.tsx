"use client";
// Yeni paket: telefon → müşteri defteri (/api/musteri; çevrimdışı → boş form) → adres + bölge + ödeme niyeti → adisyon açılır.
// Olaylar: open{kind:paket} + order + (bölge ücreti varsa) ücret satırı + (tekrarla seçildiyse) eski satırlar yeni kimlikle.
import { useState } from "react";
import { kasaFmt } from "./kasa-format";
import { feeLine, formatPhone, normalizePhone, PAY_INTENTS, zoneFee, zoneOpenAt } from "@/lib/core/delivery";
import type { PayIntent } from "@/lib/core/tab";
import type { CustomerLookup } from "@/lib/delivery/customers";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { Button, Field, Input } from "@/components/ui";

const pill = (on: boolean) => `press min-h-11 rounded-[10px] border px-3 py-2 text-sm ${on ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`;
const EMPTY: CustomerLookup = { customer: null, addresses: [], recent: [] };

export function NewDelivery({ meta, staffId, add, onCreated, onBack }: { meta: Meta; staffId: string; add: (list: NewTabEvent[]) => Promise<unknown>; onCreated: (tabId: string) => void; onBack: () => void }) {
  const { TL } = kasaFmt(meta);
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [found, setFound] = useState<CustomerLookup | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [addrId, setAddrId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [directions, setDirections] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [km, setKm] = useState(""); // #52: mesafe bazlı ücret için mesafe
  const [intent, setIntent] = useState<PayIntent>("nakit");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState<string | null>(null);
  const zones = meta.catalog.deliveryZones ?? [];

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (!p) return setError("Telefon numarası geçersiz (ör. 0532 123 45 67).");
    setError(null);
    setBusy(true);
    let r: CustomerLookup = EMPTY;
    try {
      const res = await fetch(`/api/musteri?tel=${p}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok) r = await res.json(); else setOffline(true);
    } catch { setOffline(true); }
    setBusy(false);
    setPhone(p);
    setFound(r);
    setName(r.customer?.name ?? "");
    const a = r.addresses[0];
    if (a) pickAddress(a);
  };
  const pickAddress = (a: CustomerLookup["addresses"][number]) => { setAddrId(a.id); setAddress(a.address); setDirections(a.directions ?? ""); setZoneId(a.zoneId); };

  const create = async () => {
    if (!phone || !found) return;
    if (name.trim().length < 2) return setError("Müşteri adını girin.");
    if (address.trim().length < 5) return setError("Adresi girin.");
    if (zones.length && !zoneId) return setError("Bölge seçin.");
    const zone = zones.find((z) => z.id === zoneId) ?? null;
    if (zone && !zoneOpenAt(zone)) return setError(`${zone.name} bu saatte servis dışında.`);
    const kmN = zone?.perKm ? Math.max(0, Math.min(100, Number(km.replace(",", ".")) || 0)) : null;
    if (zone?.perKm && kmN === 0) return setError("Mesafeyi (km) girin.");
    setError(null);
    setBusy(true);
    const tabId = crypto.randomUUID();
    const ev = (e: NewTabEvent["ev"]): NewTabEvent => ({ tabId, tableId: null, staffId, ev: e });
    const lines = found.recent.find((r) => r.tabId === repeat)?.lines ?? [];
    const known = lines.filter((l) => l.productId && meta.catalog.products.some((p) => p.id === l.productId));
    const fee = zoneFee(zone, kmN);
    await add([
      ev({ type: "open", guests: 0, kind: "paket" }),
      ev({ type: "order", customerId: found.customer?.id ?? null, name: name.trim(), phone, address: address.trim(), directions: directions.trim() || null, zoneId, note: note.trim() || null, payIntent: intent, promisedAt: null, source: null }),
      ...(zone && fee > 0 ? [ev(feeLine(crypto.randomUUID(), fee))] : []),
      ...known.map((l) => ev({ ...l, lineId: crypto.randomUUID() })),
    ]);
    setBusy(false);
    onCreated(tabId);
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <button type="button" onClick={onBack} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 -ml-3 mb-4">← Paket</button>
      <h1 className="mb-5 font-display text-2xl font-bold tracking-tight">Yeni paket sipariş</h1>
      <form onSubmit={lookup} className="flex items-end gap-2">
        <div className="flex-1"><Field label="Telefon"><Input name="phone" inputMode="tel" autoFocus value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setFound(null); }} placeholder="0532 123 45 67" className="text-lg" /></Field></div>
        <Button type="submit" disabled={busy} variant={found ? "ghost" : "primary"}>Müşteriyi bul</Button>
      </form>
      {!found && error && <p className="mt-3 text-sm text-bad">{error}</p>}

      {found && phone && (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-muted" data-testid="customer-status">
            {found.customer ? `Kayıtlı müşteri · ${formatPhone(phone)}` : offline ? "Bağlantı yok: müşteri defterine bakılamadı, bilgileri elle girin." : "Yeni müşteri"}
          </p>
          <Field label="Ad soyad"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Field>
          {found.addresses.length > 0 && (
            <div>
              <div className="mb-1.5 text-sm font-medium">Kayıtlı adresler</div>
              <div className="grid gap-2">
                {found.addresses.map((a) => (
                  <button key={a.id} type="button" aria-pressed={addrId === a.id} onClick={() => pickAddress(a)} className={`${pill(addrId === a.id)} text-left`}>
                    {a.label && <span className="font-medium">{a.label}: </span>}{a.address}
                  </button>
                ))}
                <button type="button" aria-pressed={addrId === null} onClick={() => { setAddrId(null); setAddress(""); setDirections(""); }} className={`${pill(addrId === null)} text-left`}>+ Yeni adres</button>
              </div>
            </div>
          )}
          <Field label="Adres"><Input value={address} onChange={(e) => { setAddress(e.target.value); setAddrId(null); }} maxLength={300} /></Field>
          <Field label="Adres tarifi" hint="İsteğe bağlı (ör. yeşil kapı, 3. kat)"><Input value={directions} onChange={(e) => setDirections(e.target.value)} maxLength={200} /></Field>
          {zones.length > 0 && (
            <div role="group" aria-label="Bölge">
              <div className="mb-1.5 text-sm font-medium">Bölge</div>
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                  const open = zoneOpenAt(z);
                  return (
                    <button key={z.id} type="button" aria-pressed={zoneId === z.id} onClick={() => { setZoneId(z.id); if (z.perKm == null) setKm(""); }}
                      className={`${pill(zoneId === z.id)} ${open ? "" : "opacity-50"}`}>
                      {z.name} <span className="text-xs text-muted">{z.fee || z.perKm ? `+${TL(zoneFee(z, null))}${z.perKm ? ` + ${TL(z.perKm)}/km` : ""}` : "ücretsiz"}{z.minOrder ? ` · asgari ${TL(z.minOrder)}` : ""}{!open ? " · servis dışı" : ""}</span>
                    </button>
                  );
                })}
              </div>
              {(() => {
                const z = zones.find((x) => x.id === zoneId);
                if (!z?.perKm) return null;
                const kmN = Math.max(0, Math.min(100, Number(km.replace(",", ".")) || 0));
                return (
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="w-28"><Field label="Mesafe (km)"><Input value={km} onChange={(e) => setKm(e.target.value)} inputMode="decimal" placeholder="3,5" /></Field></div>
                    <span className="pb-3 text-sm text-muted">Ücret: <b className="tabular text-ink">{TL(zoneFee(z, kmN))}</b></span>
                  </div>
                );
              })()}
            </div>
          )}
          <div role="group" aria-label="Ödeme">
            <div className="mb-1.5 text-sm font-medium">Ödeme</div>
            <div className="flex flex-wrap gap-2">
              {PAY_INTENTS.map((p) => <button key={p.value} type="button" aria-pressed={intent === p.value} onClick={() => setIntent(p.value)} className={pill(intent === p.value)}>{p.label}</button>)}
            </div>
          </div>
          <Field label="Sipariş notu" hint="İsteğe bağlı (ör. zili çalmayın)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
          {found.recent.length > 0 && (
            <div>
              <div className="mb-1.5 text-sm font-medium">Son siparişler</div>
              <div className="grid gap-2">
                {found.recent.map((r) => (
                  <button key={r.tabId} type="button" aria-pressed={repeat === r.tabId} onClick={() => setRepeat((x) => (x === r.tabId ? null : r.tabId))} className={`${pill(repeat === r.tabId)} text-left`}>
                    <span className="text-xs text-muted">{new Date(r.at).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} · {TL(r.total)}{repeat === r.tabId ? " · tekrarlanacak" : " · tekrarla"}</span>
                    <span className="block truncate">{r.lines.map((l) => `${l.qtyMilli / 1000}× ${l.name}`).join(", ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button type="button" disabled={busy} onClick={() => void create()} className="w-full py-3 text-base">Siparişe geç</Button>
        </div>
      )}
    </main>
  );
}
