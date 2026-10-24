"use client";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { positionFresh, positionMapUrl, type CourierPosition } from "@/lib/core/courier-location";

export function CourierMap({ couriers, now, preview = false }: { couriers: { id: string; name: string }[]; now: number; preview?: boolean }) {
  const [data, setData] = useState<{ positions: CourierPosition[]; error?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => {
    if (preview) return;
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/delivery/location", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Konum bilgisi yüklenemedi.");
        if (active) setData({ positions: body.positions });
      } catch (error) { if (active) setData(old => ({ positions: old?.positions ?? [], error: error instanceof Error ? error.message : "Konum bilgisi yüklenemedi." })); }
    };
    void load(); const timer = setInterval(() => void load(), 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [preview]);
  const positions = data?.positions ?? [];
  const current = positions.find(p => p.staffId === selected) ?? positions[0];
  return <section aria-label="Kurye konumları" className="overflow-hidden rounded-2xl border border-line bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><h3 className="flex items-center gap-2 font-semibold"><MapPin aria-hidden className="size-4" />Kurye konumları</h3><span className="text-xs text-muted">{positions.filter(p => positionFresh(p, now)).length} güncel konum</span></div>
    {data?.error && <p role="alert" className="bg-warn-soft p-3 text-sm text-warn">{data.error} Konumlar güncel olmayabilir.</p>}
    {!positions.length ? <div className="p-8 text-center"><MapPin aria-hidden className="mx-auto mb-3 size-8 text-muted" /><p className="font-medium">Henüz konum paylaşan kurye yok</p><p className="mx-auto mt-2 max-w-lg text-sm text-muted">Kurye, kendi telefonundaki “Konumumu paylaş” düğmesiyle başlatabilir. İzin verilmeden konum alınmaz; örnek konum gösterilmez.</p>{!preview && !data && <p role="status" className="mt-2 text-xs text-muted">Konumlar kontrol ediliyor…</p>}</div> : <div className="grid lg:grid-cols-[240px_1fr]">
      <div className="space-y-2 p-3">{positions.map(p => <button type="button" key={p.staffId} aria-pressed={p.staffId === current?.staffId} onClick={() => setSelected(p.staffId)} className={`min-h-16 w-full rounded-xl border p-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${p.staffId === current?.staffId ? "border-brand bg-brand-soft" : "border-line"}`}><span className="block text-sm font-semibold">{couriers.find(c => c.id === p.staffId)?.name ?? "Kurye"}</span><span className={`block text-xs ${positionFresh(p, now) && !data?.error ? "text-ok" : "text-warn"}`}>{positionFresh(p, now) && !data?.error ? "Güncel" : "Son bilinen konum"} · {Math.max(0, Math.floor((now - Date.parse(p.observedAt)) / 60000))} dk önce</span><span className="text-xs text-muted">Doğruluk ~{p.accuracy} m</span></button>)}</div>
      {current && <div className="border-t border-line lg:border-l lg:border-t-0">{showMap ? <iframe title="Seçilen kuryenin son paylaşılan konumu" src={positionMapUrl(current)} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" className="h-80 w-full border-0" /> : <div className="grid min-h-64 place-content-center gap-3 p-6 text-center"><p className="text-sm text-muted">Harita OpenStreetMap üzerinde açılır.</p><button type="button" onClick={() => setShowMap(true)} className="min-h-12 rounded-xl bg-brand-action px-4 font-medium text-white">Konumu haritada göster</button></div>}</div>}
    </div>}
  </section>;
}
