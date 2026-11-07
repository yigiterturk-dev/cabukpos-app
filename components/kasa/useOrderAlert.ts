"use client";
// components/kasa/useOrderAlert.ts — Yeni platform/paket siparişi sesi kasanın HER ekranında (eskiden yalnız Paket panosunda).
// Otomatik kabulde sipariş "onay bekliyor"a hiç düşmez; bu yüzden ölçüt "ilk kez görülen platform siparişi".
import { useEffect, useRef } from "react";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import { useKasaSetting } from "./useKasaSetting";
import { ALERT_VALUES, REPEAT_KEY } from "./DeliverySoundControls";
import { beep } from "./beep";

const isPlatformOrder = (t: TabState) => Boolean(t.order?.source) && !t.closed;

export function useOrderAlert(tabs: Map<string, TabState>, loaded: boolean, enabled: boolean) {
  const [sound] = useKasaSetting("sesli_uyari", ALERT_VALUES, "acik");
  const [repeat] = useKasaSetting(REPEAT_KEY, ALERT_VALUES, "acik");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || !loaded) { seen.current = null; return; }
    const ids = [...tabs.values()].filter(isPlatformOrder).map((t) => t.id);
    const prev = seen.current;
    seen.current = new Set([...(prev ?? []), ...ids]);
    if (sound !== "acik") return;
    // İlk yüklemede: yalnız onay bekleyen varsa öt (eski siparişler için her açılışta ötmesin).
    if (!prev) { if ([...tabs.values()].some((t) => isPlatformOrder(t) && deliveryStatus(t) === "onay_bekliyor")) beep(true); return; }
    if (ids.some((id) => !prev.has(id))) beep(true);
  }, [tabs, loaded, enabled, sound]);

  const waiting = enabled && loaded && [...tabs.values()].some((t) => !t.closed && deliveryStatus(t) === "onay_bekliyor");
  useEffect(() => {
    if (!waiting || repeat !== "acik" || sound !== "acik") return;
    const t = setInterval(() => beep(true), 4000);
    return () => clearInterval(t);
  }, [waiting, repeat, sound]);
}
