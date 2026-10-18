"use client";
// Yeni paket: telefon → müşteri defteri (/api/musteri; çevrimdışı → boş form) → adres + bölge + ödeme niyeti → adisyon açılır.
// Olaylar: open{kind:paket} + order + (bölge ücreti varsa) ücret satırı + (tekrarla seçildiyse) eski satırlar yeni kimlikle.
import { useEffect, useId, useRef, useState } from "react";
import { kasaFmt } from "./kasa-format";
import { feeLine, formatPhone, normalizePhone, PAY_INTENTS, zoneFee, zoneOpenAt } from "@/lib/core/delivery";
import type { PayIntent } from "@/lib/core/tab";
import type { CustomerLookup } from "@/lib/delivery/customers";
import type { NewTabEvent } from "@/lib/offline/tabs";
import type { Meta } from "@/lib/offline/state";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { useKasaMainProps } from "./KasaPreviewContext";

const pill = (on: boolean) => `press min-h-12 rounded-[10px] border px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand ring-2 ring-brand-ring" : "border-line bg-surface hover:border-line-strong"}`;
const EMPTY: CustomerLookup = { customer: null, addresses: [], recent: [] };

export function NewDelivery({ meta, staffId, add, onCreated, onBack, autoFocusPhone = true }: { meta: Meta; staffId: string; add: (list: NewTabEvent[]) => Promise<unknown>; onCreated: (tabId: string) => void; onBack: () => void; autoFocusPhone?: boolean }) {
  const mainProps = useKasaMainProps();
  const { TL } = kasaFmt(meta);
  const createButtonId = useId();
  const [phoneInput, setPhoneInput] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);
  const zoneRef = useRef<HTMLFieldSetElement>(null);
  const kmRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const creatingRef = useRef(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [found, setFound] = useState<CustomerLookup | null>(null);
  const [offline, setOffline] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"phone" | "name" | "address" | "zone" | "km" | null>(null);
  const [busy, setBusy] = useState<"lookup" | "create" | null>(null);
  const [name, setName] = useState("");
  const [addrId, setAddrId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [directions, setDirections] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [km, setKm] = useState(""); // #52: mesafe bazlı ücret için mesafe
  const [intent, setIntent] = useState<PayIntent>("nakit");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState<string | null>(null);
  useEffect(() => {
    if (!error || errorField || busy) return;
    const frame = window.requestAnimationFrame(() => {
      const button = document.getElementById(createButtonId);
      if (button && !button.matches(":disabled")) button.focus();
      else errorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, createButtonId, error, errorField]);
  const zones = meta.catalog.deliveryZones ?? [];
  const noOpenZones = zones.length > 0 && !zones.some((zone) => zoneOpenAt(zone));
  const selectedRepeat = found?.recent.find((r) => r.tabId === repeat);
  const skippedRepeatLines = selectedRepeat?.lines.filter((line) => line.productId && !meta.catalog.products.some((product) => product.id === line.productId)).length ?? 0;
  const kmText = km.trim();
  const parsedKm = /^\d{1,3}(?:[.,]\d{1,2})?$/.test(kmText) ? Number(kmText.replace(",", ".")) : NaN;
  const validKm = Number.isFinite(parsedKm) && parsedKm > 0 && parsedKm <= 100 ? parsedKm : null;
  const kmInvalid = kmText !== "" && validKm === null;
  const clearError = () => { setError(null); setErrorField(null); };
  const validationError = (field: NonNullable<typeof errorField>, message: string) => {
    setError(message);
    setErrorField(field);
    const refs = { phone: phoneRef, name: nameRef, address: addressRef, zone: zoneRef, km: kmRef };
    requestAnimationFrame(() => refs[field].current?.focus());
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phoneInput);
    if (!p) return validationError("phone", "Telefon numarası geçersiz (ör. 0532 123 45 67).");
    clearError();
    setBusy("lookup");
    let r: CustomerLookup = EMPTY;
    try {
      const res = await fetch(`/api/musteri?tel=${p}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok) { r = await res.json(); setOffline(false); setLookupFailed(false); }
      else { setOffline(!navigator.onLine); setLookupFailed(navigator.onLine); }
    } catch { setOffline(!navigator.onLine); setLookupFailed(navigator.onLine); }
    setBusy(null);
    setPhone(p);
    setFound(r);
    setName(r.customer?.name ?? "");
    requestAnimationFrame(() => nameRef.current?.focus());
    setAddrId(null);
    setAddress("");
    setDirections("");
    setZoneId(null);
    setKm("");
    setNote("");
    setRepeat(null);
    const a = r.addresses[0];
    if (a) pickAddress(a);
  };
  const pickAddress = (a: CustomerLookup["addresses"][number]) => {
    clearError();
    if (addrId !== a.id || zoneId !== a.zoneId) setKm("");
    setAddrId(a.id);
    setAddress(a.address);
    setDirections(a.directions ?? "");
    setZoneId(a.zoneId);
  };

  const create = async () => {
    if (creatingRef.current) return;
    if (!phone || !found) return;
    if (zones.length && !zones.some((zone) => zoneOpenAt(zone))) {
      setError("Şu anda servis saatinde açık bir teslimat bölgesi yok. Bölge saatlerini kontrol edin.");
      setErrorField(null);
      return;
    }
    if (name.trim().length < 2) return validationError("name", "Müşteri adını girin.");
    if (address.trim().length < 5) return validationError("address", "Adresi girin.");
    if (zones.length && !zoneId) return validationError("zone", "Bölge seçin.");
    const zone = zones.find((z) => z.id === zoneId) ?? null;
    if (zone && !zoneOpenAt(zone)) return validationError("zone", `${zone.name} bu saatte servis dışında.`);
    if (zone?.perKm && validKm === null) return validationError("km", "Mesafe 0'dan büyük ve en fazla 100 km olmalı.");
    const kmN = zone?.perKm ? validKm : null;
    clearError();
    creatingRef.current = true;
    setBusy("create");
    const tabId = crypto.randomUUID();
    const ev = (e: NewTabEvent["ev"]): NewTabEvent => ({ tabId, tableId: null, staffId, ev: e });
    const lines = found.recent.find((r) => r.tabId === repeat)?.lines ?? [];
    const known = lines.filter((l) => l.productId && meta.catalog.products.some((p) => p.id === l.productId));
    const fee = zoneFee(zone, kmN);
    try {
      await add([
        ev({ type: "open", guests: 0, kind: "paket" }),
        ev({ type: "order", customerId: found.customer?.id ?? null, name: name.trim(), phone, address: address.trim(), directions: directions.trim() || null, zoneId, note: note.trim() || null, payIntent: intent, promisedAt: null, source: null }),
        ...(zone && fee > 0 ? [ev(feeLine(crypto.randomUUID(), fee))] : []),
        ...known.map((l) => ev({ ...l, lineId: crypto.randomUUID() })),
      ]);
      onCreated(tabId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sipariş oluşturulamadı. Tekrar deneyin.");
    } finally {
      creatingRef.current = false;
      setBusy(null);
    }
  };

  return (
    <div {...mainProps} className="mx-auto w-full max-w-2xl px-4 py-6 outline-none">
      <button type="button" disabled={busy !== null} onClick={onBack} className="press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-wait disabled:opacity-50 -ml-3 mb-4">← Paket</button>
      <h1 className="mb-5 font-display text-2xl font-bold tracking-tight">Yeni paket sipariş</h1>
      <form noValidate onSubmit={lookup} aria-busy={busy === "lookup"} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1"><Field label="Telefon" hint="Zorunlu · Türkiye numarası, ör. 0532 123 45 67"><Input ref={phoneRef} id="delivery-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus={autoFocusPhone} disabled={busy !== null} value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setFound(null); clearError(); }} aria-invalid={errorField === "phone" || undefined} aria-describedby={errorField === "phone" ? "delivery-error" : undefined} placeholder="0532 123 45 67" maxLength={24} required className="text-lg" /></Field></div>
        <Button type="submit" disabled={busy !== null} variant={found ? "ghost" : "primary"} className="min-h-12 shrink-0">{busy === "lookup" ? "Aranıyor…" : "Müşteriyi bul"}</Button>
      </form>
      {busy === "lookup" && <p className="sr-only" role="status" aria-live="polite">Telefon numarasıyla müşteri aranıyor.</p>}
      {!found && error && <p id="delivery-error" className="mt-3 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}

      {found && phone && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <fieldset disabled={busy !== null} aria-busy={busy === "create"} className="mt-6 min-w-0 space-y-5 border-0 p-0">
            <legend className="sr-only">Sipariş bilgileri</legend>
          {busy === "create" && <p className="sr-only" role="status" aria-live="polite">Paket siparişi oluşturuluyor. Lütfen bekleyin.</p>}
          <p className="text-sm text-muted" data-testid="customer-status" role="status" aria-live="polite" aria-atomic="true">
            {found.customer ? `Kayıtlı müşteri · ${formatPhone(phone)}` : lookupFailed ? "Müşteri kaydı alınamadı; bilgileri elle girin." : offline ? "Bağlantı yok: müşteri defterine bakılamadı, bilgileri elle girin." : "Yeni müşteri"}
          </p>
          <Field label="Ad soyad" hint="Zorunlu · 2–120 karakter"><Input ref={nameRef} id="delivery-name" name="name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); clearError(); }} aria-invalid={errorField === "name" || undefined} aria-describedby={errorField === "name" ? "delivery-error" : undefined} minLength={2} maxLength={120} pattern=".*\\S.*" required /></Field>
          {errorField === "name" && error && <p id="delivery-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
          {found.addresses.length > 0 && (
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1.5 text-sm font-medium">Kayıtlı adresler</legend>
              <div className="grid gap-2">
                {found.addresses.map((a) => (
                  <label key={a.id} className={`${pill(addrId === a.id)} inline-flex cursor-pointer items-center break-words text-left focus-within:ring-4 focus-within:ring-brand-ring/60`}>
                    <input type="radio" name="delivery-address-choice" value={a.id} checked={addrId === a.id} onChange={() => pickAddress(a)} className="peer sr-only" />
                    {a.label && <span className="font-medium">{a.label}: </span>}{a.address}
                  </label>
                ))}
                <label className={`${pill(addrId === null)} inline-flex cursor-pointer items-center text-left focus-within:ring-4 focus-within:ring-brand-ring/60`}>
                  <input type="radio" name="delivery-address-choice" value="" checked={addrId === null} onChange={() => { clearError(); setAddrId(null); setAddress(""); setDirections(""); }} className="peer sr-only" />
                  + Yeni adres
                </label>
              </div>
            </fieldset>
          )}
          <Field label="Adres" hint="Zorunlu · 5–500 karakter"><Textarea ref={addressRef} id="delivery-address" value={address} onChange={(e) => { setAddress(e.target.value); setAddrId(null); setZoneId(null); setKm(""); clearError(); }} aria-invalid={errorField === "address" || undefined} aria-describedby={errorField === "address" ? "delivery-error" : undefined} minLength={5} maxLength={500} rows={2} required className="resize-y" /></Field>
          {errorField === "address" && error && <p id="delivery-error" className="break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
          <Field label="Adres tarifi" hint="İsteğe bağlı · en fazla 300 karakter (ör. yeşil kapı, 3. kat)"><Input value={directions} onChange={(e) => { setDirections(e.target.value); clearError(); }} maxLength={300} /></Field>
          {zones.length > 0 && (
            <fieldset ref={zoneRef} tabIndex={-1} aria-describedby={errorField === "zone" ? "delivery-error" : undefined} className="m-0 border-0 p-0 outline-none focus-within:ring-4 focus-within:ring-brand-ring/60">
              <legend className="mb-1.5 text-sm font-medium">Bölge · zorunlu</legend>
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                  const open = zoneOpenAt(z);
                  return (
                    <label key={z.id} className={`${pill(zoneId === z.id)} inline-flex cursor-pointer items-center focus-within:ring-4 focus-within:ring-brand-ring/60 ${open ? "" : "cursor-not-allowed opacity-50"}`}>
                      <input type="radio" name="delivery-zone" value={z.id} checked={zoneId === z.id} disabled={!open} required={open} onChange={() => { clearError(); setZoneId(z.id); setKm(""); }} aria-describedby={errorField === "zone" ? "delivery-error" : undefined} className="peer sr-only" />
                      {z.name} <span className="text-xs text-muted">{z.fee || z.perKm ? `+${TL(zoneFee(z, null))}${z.perKm ? ` + ${TL(z.perKm)}/km` : ""}` : "ücretsiz"}{z.minOrder ? ` · asgari ${TL(z.minOrder)}` : ""}{!open ? " · servis dışı" : ""}</span>
                    </label>
                  );
                })}
              </div>
              {errorField === "zone" && error && <p id="delivery-error" className="mt-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
              {(() => {
                const z = zones.find((x) => x.id === zoneId);
                if (!z?.perKm) return null;
                return (
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="w-28"><Field label="Mesafe (km)" hint="Zorunlu · 0'dan büyük, en fazla 100 km · en çok 2 ondalık"><Input ref={kmRef} id="delivery-km" value={km} onChange={(e) => { setKm(e.target.value); clearError(); }} aria-invalid={errorField === "km" || kmInvalid || undefined} aria-describedby={errorField === "km" ? "delivery-error" : undefined} inputMode="decimal" maxLength={6} pattern="[0-9]{1,3}([.,][0-9]{1,2})?" placeholder="3,5" required /></Field></div>
                    {errorField === "km" && error && <p id="delivery-error" className="basis-full break-words text-sm text-bad" role="alert" aria-live="assertive">{error}</p>}
                    <span className="pb-3 text-sm text-muted" aria-live="polite" aria-atomic="true">Ücret: <b className="tabular text-ink">{validKm === null ? "0–100 km · en çok 2 ondalık girin" : TL(zoneFee(z, validKm))}</b></span>
                  </div>
                );
              })()}
            </fieldset>
          )}
          {noOpenZones && <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn" role="status" aria-live="polite">Şu anda servis saatinde açık teslimat bölgesi yok. Bölge servis saatlerini kontrol edin.</p>}
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">Ödeme</legend>
            <div className="flex flex-wrap gap-2">
              {PAY_INTENTS.map((p) => (
                <label key={p.value} className={`${pill(intent === p.value)} inline-flex cursor-pointer items-center focus-within:ring-4 focus-within:ring-brand-ring/60`}>
                  <input type="radio" name="payIntent" value={p.value} required checked={intent === p.value} onChange={() => { setIntent(p.value); clearError(); }} className="peer sr-only" />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Sipariş notu" hint="İsteğe bağlı · en fazla 300 karakter (ör. zili çalmayın)"><Input value={note} onChange={(e) => { setNote(e.target.value); clearError(); }} maxLength={300} /></Field>
          {found.recent.length > 0 && (
            <div role="group" aria-label="Son siparişler">
              <div className="mb-1.5 text-sm font-medium">Son siparişler</div>
              <div className="grid gap-2">
                {found.recent.map((r) => (
                    <button key={r.tabId} type="button" aria-pressed={repeat === r.tabId} onClick={() => { setRepeat((x) => (x === r.tabId ? null : r.tabId)); clearError(); }} className={`${pill(repeat === r.tabId)} text-left`}>
                    <span className="text-xs text-muted">{new Date(r.at).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })} · {TL(r.total)}{repeat === r.tabId ? " · tekrarlanacak" : " · tekrarla"}</span>
                    <span className="block break-words">{r.lines.map((l) => `${l.qtyMilli / 1000}× ${l.name}`).join(", ")}</span>
                  </button>
                ))}
              </div>
              {repeat && skippedRepeatLines > 0 && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn" role="status" aria-live="polite" aria-atomic="true">
                Seçilen siparişte katalogda bulunmayan {skippedRepeatLines} ürün var; bu ürünler yeni siparişe aktarılmayacak. Siparişi göndermeden önce kontrol edin.
              </p>}
            </div>
          )}
          {error && !errorField && <p ref={errorRef} id="delivery-error" tabIndex={-1} className="break-words text-sm text-bad outline-none focus-visible:ring-4 focus-visible:ring-bad/30" role="alert" aria-live="assertive">{error}</p>}
            <Button id={createButtonId} type="submit" disabled={busy !== null || noOpenZones} className="min-h-14 w-full text-base">{busy === "create" ? "Sipariş oluşturuluyor…" : noOpenZones ? "Şu an servis yok" : "Siparişe geç"}</Button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
