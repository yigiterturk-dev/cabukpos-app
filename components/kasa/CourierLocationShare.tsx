"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui";

/** Location is opt-in, foreground only, PIN-bound, and never resumed automatically. */
export function CourierLocationShare({ staffId, needsPin = true }: { staffId: string; needsPin?: boolean }) {
  const [pin, setPin] = useState("");
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const tokenRef = useRef<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendRef = useRef(0);
  const sendingRef = useRef(false);
  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (expiryRef.current) clearTimeout(expiryRef.current);
    if (tokenRef.current) void fetch("/api/delivery/location", { method: "DELETE", headers: { Authorization: `Bearer ${tokenRef.current}` }, keepalive: true }).catch(() => {});
    tokenRef.current = null;
  }, [staffId]);
  const stop = async () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const token = tokenRef.current; tokenRef.current = null;
    setSharing(false);
    setNotice("Konum paylaşımı durduruldu.");
    if (token) {
      const res = await fetch("/api/delivery/location", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!res?.ok) setNotice("Paylaşım durdu. Son konum sunucudan kaldırılamadı; 90 saniye sonra güncel görünmez ve 15 dakika sonra rapordan çıkar.");
    }
  };
  const start = async () => {
    if (busy || sharing) return;
    if (!navigator.geolocation || !window.isSecureContext) { setNotice("Konum için HTTPS ve konum destekleyen bir tarayıcı gerekiyor."); return; }
    setBusy(true); setNotice("");
    try {
      const res = await fetch("/api/delivery/location/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, pin }) });
      const data = await res.json(); setPin("");
      if (!res.ok) throw new Error(data.error ?? "Konum oturumu açılamadı.");
      tokenRef.current = data.token; lastSendRef.current = 0;
      setSharing(true); setNotice("Konum izni bekleniyor. Paylaşım yalnız bu ekran açıkken çalışır.");
      expiryRef.current = setTimeout(() => { void stop().then(() => setNotice("30 dakikalık paylaşım oturumu bitti. Devam etmek için yeniden başlatın.")); }, Math.max(0, data.expiresAt - Date.now() - 5000));
      watchRef.current = navigator.geolocation.watchPosition(position => {
        const token = tokenRef.current;
        if (!token || sendingRef.current || Date.now() - lastSendRef.current < 20000) return;
        lastSendRef.current = Date.now(); sendingRef.current = true;
        void fetch("/api/delivery/location", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp }) }).then(async response => {
          if (tokenRef.current !== token) return;
          if (response.status === 403) { await stop(); setNotice("Konum oturumu sona erdi. Yeniden başlatın."); return; }
          if (!response.ok) throw new Error("Konum gönderilemedi. Bağlantı gelince yeniden denenecek.");
          setNotice(`Son gönderim ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · doğruluk yaklaşık ${Math.ceil(position.coords.accuracy)} m`);
        }).catch(error => { if (tokenRef.current === token) setNotice(error instanceof Error ? error.message : "Konum gönderilemedi."); }).finally(() => { sendingRef.current = false; });
      }, error => {
        if (error.code === 1) void stop().then(() => setNotice("Konum izni verilmedi; paylaşım kapalı."));
        else setNotice("Konum alınamadı. Telefonun konumunu ve bağlantısını kontrol edin.");
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    } catch (error) { if (tokenRef.current) await stop(); setNotice(error instanceof Error ? error.message : "Konum paylaşımı başlatılamadı."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Konum paylaşımı" className="mb-5 rounded-2xl border border-line bg-surface p-4 text-sm">
    <h2 className="flex items-center gap-2 font-semibold"><MapPin aria-hidden className="size-4" />Konum paylaşımı <span className={`ml-auto rounded-full px-2 py-1 text-xs ${sharing ? "bg-ok-soft text-ok" : "bg-surface-3 text-muted"}`}>{sharing ? "Açık" : "Kapalı"}</span></h2>
    <p className="mt-2 text-xs text-muted">Son konumunuz işletmenin kasa ekranında görünür. Harita açılırsa OpenStreetMap üzerinde gösterilir. Konum geçmişi tutulmaz. Paylaşım bu ekran açıkken, en fazla 30 dakika sürer; istediğiniz an durdurabilirsiniz.</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">{!sharing && needsPin && <label className="grid min-w-0 flex-1 gap-1 text-xs text-muted">Kendi kurye PIN’iniz<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60" /></label>}
      {sharing ? <Button variant="secondary" onClick={() => void stop()}>Paylaşımı durdur</Button> : <Button disabled={busy || (needsPin && pin.length < 4)} onClick={() => void start()}>{busy ? "Doğrulanıyor…" : "Konumumu paylaş"}</Button>}</div>
    {notice && <p role="status" className="mt-3 text-xs text-muted">{notice}</p>}
  </section>;
}
