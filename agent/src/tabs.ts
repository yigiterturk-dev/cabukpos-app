// agent/src/tabs.ts — Dükkân içi adisyon olayı arabelleği (LAN merkezi). Bellek + tabs.jsonl (ekleme);
// son 24 saat, en çok 20 000 olay. lanSeq yalnız artar (sıkıştırmada da). Bulut sırası (seq) burada hep null.
import fs from "node:fs";
import type { TabEvent } from "@/lib/core/tab";

export const MAX_BATCH = 200;
export const MAX_BUFFER = 20_000;
export const KEEP_MS = 24 * 3600_000;
export type Entry = { lanSeq: number; event: TabEvent };
const UUID = /^[0-9a-f-]{36}$/i;

export function validEvent(e: unknown): e is TabEvent {
  const x = e as TabEvent | null;
  return !!x && typeof x === "object" && UUID.test(String(x.id)) && UUID.test(String(x.tabId)) && typeof x.at === "string" && !Number.isNaN(Date.parse(x.at)) && !!x.ev && typeof x.ev.type === "string";
}

export function createTabBuffer(file: string | null, now = () => Date.now()) {
  let list: Entry[] = [];
  const ids = new Set<string>();
  let seq = 0;
  const rewrite = () => { if (file) fs.writeFileSync(file, list.map((e) => JSON.stringify(e) + "\n").join("")); };
  function compact() {
    const cut = now() - KEEP_MS, before = list.length;
    list = list.filter((e) => Date.parse(e.event.at) >= cut).slice(-MAX_BUFFER);
    if (list.length !== before) { ids.clear(); for (const e of list) ids.add(e.event.id); rewrite(); }
  }
  if (file && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as Entry;
        seq = Math.max(seq, e.lanSeq);
        if (!ids.has(e.event.id)) { list.push(e); ids.add(e.event.id); }
      } catch { /* yarım kalmış son satır */ }
    }
    compact();
  }
  return {
    accept(events: TabEvent[]): Entry[] {
      const added: Entry[] = [];
      for (const ev of events) {
        if (ids.has(ev.id)) continue;
        const e = { lanSeq: ++seq, event: { ...ev, seq: null } };
        list.push(e); ids.add(ev.id); added.push(e);
      }
      if (added.length && file) fs.appendFileSync(file, added.map((e) => JSON.stringify(e) + "\n").join(""));
      if (list.length > MAX_BUFFER) compact();
      return added;
    },
    after: (n: number) => list.filter((e) => e.lanSeq > n),
    compact,
    size: () => list.length,
    lastSeq: () => seq,
  };
}
