"use client";
// Adisyonlar: yerel olaylar + canlı akış → katlanmış durum. Yeni olay yazılınca eşitleme tetiklenir.
import { useCallback, useEffect, useMemo, useState } from "react";
import { foldTabs, type TabEvent } from "@/lib/core/tab";
import { addTabEvents, allTabEvents, createLanStream, createTabStream, pruneTabEvents, pushLan, type NewTabEvent } from "@/lib/offline/tabs";
import type { LanLink } from "@/lib/agent/config";

export function useTabs(enabled: boolean, kick: () => void, agent?: LanLink | null) {
  const [events, setEvents] = useState<TabEvent[]>([]);
  const [cloud, setCloud] = useState(false);
  const [lan, setLan] = useState(false);
  const reload = useCallback(async () => setEvents(await allTabEvents()), []);
  useEffect(() => {
    if (!enabled) return;
    void pruneTabEvents().then(reload);
    const s = createTabStream(() => void reload(), setCloud);
    return () => s.stop();
  }, [enabled, reload]);
  const agentUrl = agent?.url, agentTicket = agent?.ticket;
  useEffect(() => {
    if (!enabled || !agentUrl || !agentTicket) return;
    const s = createLanStream({ url: agentUrl, ticket: agentTicket }, () => void reload(), setLan);
    return () => s.stop();
  }, [enabled, agentUrl, agentTicket, reload]);
  const tabs = useMemo(() => foldTabs(events), [events]);
  const add = useCallback(async (list: NewTabEvent[]) => {
    const evs = await addTabEvents(list);
    await reload();
    kick();
    if (agent) void pushLan(agent, evs);
    return evs;
  }, [reload, kick, agent]);
  const lanLive = lan && enabled && !!agentUrl; // ajan kalkınca eski "canlı" durumu sayılmaz
  const link: "bulut" | "lan" | "yok" = cloud ? "bulut" : lanLive ? "lan" : "yok";
  return { tabs, live: cloud || lanLive, link, add, reload };
}

/** Geçen süre göstergeleri için dakikalık saat. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
