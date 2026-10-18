"use client";
// lib/offline/tabs.ts — Adisyon olaylarının yerel deposu ve canlı akış (tarayıcı).
// Yerel olay: tabEvents'e seq=null ile + giden kutusuna tek işlemde. Sunucu yankısı aynı kimlikle gelir, seq'li hâli kalır.
import type { TabEv, TabEvent } from "@/lib/core/tab";
import { foldTabs, lanMergePlan } from "@/lib/core/tab";
import type { LanLink } from "@/lib/agent/config";
import type { TabDoc } from "@/lib/sync/docs";
import { kasaDb } from "./db";

export type NewTabEvent = { tabId: string; tableId: string | null; staffId: string | null; approvedBy?: string | null; approvalToken?: string | null; ev: TabEv };

/** Olayları (sırayla) yerel depoya ve giden kutusuna yazar. Aynı milisaniyede sıra bozulmasın diye zaman 1 ms artar. */
export async function addTabEvents(list: NewTabEvent[]): Promise<TabEvent[]> {
  const d = kasaDb();
  const base = Date.now();
  const events: TabEvent[] = list.map((e, i) => ({ id: crypto.randomUUID(), tabId: e.tabId, tableId: e.tableId, at: new Date(base + i).toISOString(), staffId: e.staffId, approvedBy: e.approvedBy ?? null, approvalToken: e.approvalToken ?? undefined, seq: null, ev: e.ev }));
  await d.transaction("rw", [d.tabEvents, d.outbox], async () => {
    for (const e of events) {
      await d.tabEvents.put(e);
      const doc: TabDoc = { kind: "tab", id: e.id, tabId: e.tabId, tableId: e.tableId, at: e.at, staffId: e.staffId, approvedBy: e.approvedBy, ev: e.ev as TabDoc["ev"], ...(e.approvalToken ? { approvalToken: e.approvalToken } : {}) };
      await d.outbox.add({ id: e.id, doc });
    }
  });
  return events;
}

export const allTabEvents = () => kasaDb().tabEvents.toArray();

async function maxSeq(): Promise<number> {
  const last = await kasaDb().tabEvents.orderBy("seq").last();
  return last?.seq ?? 0;
}

/** Sunucu olayları: seq'li hâl yerelin yerine geçer. */
export async function mergeServerEvents(evs: TabEvent[]) {
  if (evs.length) await kasaDb().tabEvents.bulkPut(evs);
}

/** 24 saatten önce kapanmış adisyonların olayları silinir (bekleyen olayı olan kalır). */
export async function pruneTabEvents(now = Date.now()) {
  const d = kasaDb();
  const events = await d.tabEvents.toArray();
  const cutoff = new Date(now - 24 * 3600_000).toISOString();
  const old = [...foldTabs(events).values()].filter((t) => t.closed && t.closedAt && t.closedAt < cutoff && !events.some((e) => e.tabId === t.id && e.seq === null)).map((t) => t.id);
  if (old.length) await d.tabEvents.where("tabId").anyOf(old).delete();
}

/**
 * SSE aboneliği. Tarayıcı bağlantı düşünce Last-Event-ID ile kendisi yeniden bağlanır; sunucu 401 verirse
 * (EventSource kapanır) 30 sn sonra yeniden kurulur. onChange her yeni partide çağrılır.
 */
export function createTabStream(onChange: () => void, onState?: (live: boolean) => void) {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const open = async () => {
    if (stopped) return;
    const after = await maxSeq();
    es = new EventSource(after ? `/api/tabs/stream?after=${after}` : "/api/tabs/stream");
    es.onopen = () => onState?.(true);
    es.onmessage = (m) => {
      try {
        void mergeServerEvents(JSON.parse(m.data) as TabEvent[]).then(onChange);
      } catch { /* bozuk parti: sonraki yeniden bağlanmada imleçten gelir */ }
    };
    es.onerror = () => {
      onState?.(false);
      if (es?.readyState === EventSource.CLOSED) { es = null; timer = setTimeout(() => void open(), 30_000); }
    };
  };
  void open();
  return {
    stop() { stopped = true; es?.close(); if (timer) clearTimeout(timer); },
  };
}

// — LAN merkezi: ajan üzerinden aynı olaylar. Giden kutusuna girmez (başkasının olayını o cihaz buluta iter). —
const LAN_BATCH = 200;

export async function mergeLanEvents(evs: TabEvent[]): Promise<number> {
  if (!evs.length) return 0;
  const d = kasaDb();
  return d.transaction("rw", d.tabEvents, async () => {
    const have = new Set((await d.tabEvents.bulkGet(evs.map((e) => e.id))).flatMap((e) => (e ? [e.id] : [])));
    const add = lanMergePlan(have, evs);
    if (add.length) await d.tabEvents.bulkAdd(add);
    return add.length;
  });
}

/** En iyi çaba: ajan yoksa/erişilemezse sessizce vazgeçer (bulut yolu zaten var). */
export async function pushLan(a: LanLink, events: TabEvent[]) {
  for (let i = 0; i < events.length; i += LAN_BATCH) {
    try {
      await fetch(`${a.url}/tabs/events`, { method: "POST", headers: { Authorization: `Bearer ${a.ticket}`, "Content-Type": "application/json" }, body: JSON.stringify({ events: events.slice(i, i + LAN_BATCH) }) });
    } catch { return; }
  }
}

/** Ajana bağlanınca buluta henüz gitmemiş (seq null) tüm olaylar: kesintide açılan cihaz da eksiksiz olsun. */
export async function resendPending(a: LanLink) {
  await pushLan(a, (await allTabEvents()).filter((e) => e.seq === null));
}

export function createLanStream(a: LanLink, onChange: () => void, onState?: (live: boolean) => void) {
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const open = () => {
    if (stopped) return;
    es = new EventSource(`${a.url}/tabs/stream?ticket=${encodeURIComponent(a.ticket)}`);
    es.onopen = () => { onState?.(true); void resendPending(a); };
    es.onmessage = (m) => {
      try { void mergeLanEvents(JSON.parse(m.data) as TabEvent[]).then((n) => { if (n) onChange(); }); } catch { /* bozuk parti */ }
    };
    es.onerror = () => {
      onState?.(false);
      if (es?.readyState === EventSource.CLOSED) { es = null; timer = setTimeout(open, 10_000); }
    };
  };
  open();
  return { stop() { stopped = true; es?.close(); if (timer) clearTimeout(timer); } };
}
