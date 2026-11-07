"use client";
// components/kasa/useOrderAlert.ts — Yeni platform/paket siparişi sesi kasanın HER ekranında (eskiden yalnız Paket panosunda).
// Otomatik kabulde sipariş "onay bekliyor"a hiç düşmez; bu yüzden ölçüt "ilk kez görülen platform siparişi".
import { useEffect, useRef } from "react";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import { useKasaSetting } from "./useKasaSetting";
import { ALERT_VALUES, REPEAT_KEY } from "./DeliverySoundControls";
import { orderAlarm } from "./beep";

// Yalnız TAZE sipariş öter: geçmiş içe aktarma (asıl, eski zamanlı) ya da olayları parça parça gelen eski adisyon ötmez.
const FRESH_MS = 10 * 60_000;
const isPlatformOrder = (t: TabState) => Boolean(t.order?.source) && !t.closed && Date.now() - Date.parse(t.openedAt) < FRESH_MS;

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
    if (!prev) { if ([...tabs.values()].some((t) => isPlatformOrder(t) && deliveryStatus(t) === "onay_bekliyor")) orderAlarm(); return; }
    if (ids.some((id) => !prev.has(id))) orderAlarm();
  }, [tabs, loaded, enabled, sound]);

  const waiting = enabled && loaded && [...tabs.values()].some((t) => isPlatformOrder(t) && deliveryStatus(t) === "onay_bekliyor");
  useEffect(() => {
    if (!waiting || repeat !== "acik" || sound !== "acik") return;
    const t = setInterval(() => orderAlarm(), 6000);
    return () => clearInterval(t);
  }, [waiting, repeat, sound]);
}
