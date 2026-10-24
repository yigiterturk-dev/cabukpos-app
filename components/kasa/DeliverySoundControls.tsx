"use client";
import { Volume2, VolumeX } from "lucide-react";
import { useKasaSetting } from "./useKasaSetting";
import { beep } from "./beep";

export const ALERT_VALUES = ["acik", "kapali"] as const;
export const REPEAT_KEY = "cabukpos_paket_uyari_tekrar";
export function DeliverySoundControls() {
  const [sound, setSound] = useKasaSetting("sesli_uyari", ALERT_VALUES, "acik");
  const [repeat, setRepeat] = useKasaSetting(REPEAT_KEY, ALERT_VALUES, "acik");
  return <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm">
    {sound === "acik" ? <Volume2 aria-hidden className="size-4 text-brand" /> : <VolumeX aria-hidden className="size-4 text-muted" />}
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={sound === "acik"} onChange={e => setSound(e.target.checked ? "acik" : "kapali")} className="size-5 accent-brand" />Sesli uyarılar</label>
    <label className={`flex min-h-11 items-center gap-2 ${sound !== "acik" ? "text-muted" : ""}`}><input type="checkbox" checked={repeat === "acik"} disabled={sound !== "acik"} onChange={e => setRepeat(e.target.checked ? "acik" : "kapali")} className="size-5 accent-brand" />Onay beklerken tekrarla</label>
    <button type="button" disabled={sound !== "acik"} onClick={() => beep(true)} className="press ml-auto min-h-11 rounded-lg px-3 font-medium text-brand outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:text-muted disabled:opacity-50">Sesi dene</button>
  </div>;
}
