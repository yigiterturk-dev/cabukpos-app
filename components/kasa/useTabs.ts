"use client";
// Adisyonlar: yerel olaylar + canlı akış → katlanmış durum. Yeni olay yazılınca eşitleme tetiklenir.
import { useCallback, useEffect, useMemo, useState } from "react";
import { foldTabs, type TabEvent } from "@/lib/core/tab";
import { addTabEvents, allTabEvents, createTabStream, pruneTabEvents, type NewTabEvent } from "@/lib/offline/tabs";

export function useTabs(enabled: boolean, kick: () => void) {
  const [events, setEvents] = useState<TabEvent[]>([]);
  const [live, setLive] = useState(false);
  const reload = useCallback(async () => setEvents(await allTabEvents()), []);
  useEffect(() => {
    if (!enabled) return;
    void pruneTabEvents().then(reload);
    const s = createTabStream(() => void reload(), setLive);
    return () => s.stop();
  }, [enabled, reload]);
  const tabs = useMemo(() => foldTabs(events), [events]);
  const add = useCallback(async (list: NewTabEvent[]) => {
    const evs = await addTabEvents(list);
    await reload();
    kick();
    return evs;
  }, [reload, kick]);
  return { tabs, live, add, reload };
}

/** Geçen süre göstergeleri için dakikalık saat. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
