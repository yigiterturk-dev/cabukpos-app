# ÇabukPOS LAN merkezi — Uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Yiğit kuralı: ajan yok → inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** İnternet kesilince adisyon olayları (garson ↔ kasa ↔ mutfak) dükkândaki ajan üzerinden akmaya devam etsin.

**Architecture:** Ajana olay arabelleği (`agent/src/tabs.ts`, bellek + `tabs.jsonl`) ve iki yol (`POST /tabs/events`, `GET /tabs/stream` SSE). Cihaz, bulut akışına ek olarak ajan akışını dinler; yeni olayı ajana da yollar; LAN'dan geleni yalnız yerelde yoksa `seq: null` ile ekler. Ajan buluta olay yollamaz.

**Tech Stack:** Node http (ajan, esbuild tek dosya), Dexie (tarayıcı), EventSource, node:test, playwright-core.

Spec: `docs/superpowers/specs/2026-09-29-cabukpos-lan-merkez-design.md` · Dal: `lan-merkez` (m9c-ajans üstünde).

## Global Constraints

- **BOZMADAN (Yiğit):** ajan yoksa / erişilemezse davranış bugünküyle birebir aynı. `useTabs`'in yeni parametresi isteğe bağlı; mevcut yazıcı/çekmece/terazi yolları ve bilet kontrolü değişmez; `?ticket=` YALNIZ `GET /tabs/stream`'de kabul edilir.
- Her görev sonunda: `npm test` fail 0 + `npx tsc --noEmit` + `npm run lint` temiz. Son görevde E2E `lan` + regresyon `m4`, `m5`.
- Parti sınırı 200 olay (ajan gövde sınırı 256 KB); arabellek 20 000 olay, 24 saat.
- Ajan sürümü `0.5.0` (kasalar yeni ajanı Donanım'dan indirip kurar; eski ajan yeni yolları bilmez → cihaz 404 alır, sessizce buluta kalır).
- Commit mesajı sonu: oturumun Co-Authored-By / Claude-Session satırları; AI footer yok.

## Dosya haritası

- Create `agent/src/tabs.ts` — arabellek; Test `tests/agent-tabs.test.ts`
- Modify `agent/src/server.ts` — yollar, `?ticket=`, SSE istemcileri, status; `agent/src/main.ts` — `tabsFile`; Test `tests/agent-lan.test.ts`
- Modify `lib/core/tab.ts` — `lanMergePlan`; Test `tests/tab.test.ts` (ekle)
- Modify `lib/offline/tabs.ts` — `mergeLanEvents`, `pushLan`, `resendPending`, `createLanStream`
- Modify `components/kasa/useTabs.ts` + çağıranlar (`grep -rn "useTabs(" components`) — ajan akışı, `link` göstergesi
- Create `e2e/lan.mjs`; Modify `docs/PROGRESS.md`

---

### Task 1: Ajan olay arabelleği

**Files:** Create `agent/src/tabs.ts`, Test `tests/agent-tabs.test.ts`

**Produces:** `MAX_BATCH = 200`, `MAX_BUFFER = 20_000`, `KEEP_MS`; `type Entry = { lanSeq: number; event: TabEvent }`; `validEvent(e: unknown): e is TabEvent`; `createTabBuffer(file: string | null, now?: () => number)` → `{ accept(events): Entry[]; after(n): Entry[]; compact(): void; size(): number; lastSeq(): number }`.

- [ ] **Step 1: Test yaz** — `tests/agent-tabs.test.ts`

```ts
// tests/agent-tabs.test.ts — ajan adisyon arabelleği: tekilleştirme, lanSeq, disk, 24 saat.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTabBuffer, validEvent } from "../agent/src/tabs";
import type { TabEvent } from "@/lib/core/tab";

const ev = (at = new Date().toISOString(), seq: number | null = 7): TabEvent => ({ id: crypto.randomUUID(), tabId: crypto.randomUUID(), tableId: null, at, staffId: null, approvedBy: null, seq, ev: { type: "open" } as TabEvent["ev"] });

test("accept: yeni olana artan lanSeq, tekrar atlanır, seq null'a çekilir", () => {
  const b = createTabBuffer(null);
  const [a, c] = [ev(), ev()];
  assert.deepEqual(b.accept([a, c]).map((e) => e.lanSeq), [1, 2]);
  assert.equal(b.accept([a]).length, 0);
  assert.equal(b.after(0)[0].event.seq, null);
  assert.deepEqual(b.after(1).map((e) => e.event.id), [c.id]);
  assert.equal(b.lastSeq(), 2);
});

test("disk: yeni örnek aynı olayları aynı lanSeq ile yükler; 24 saatten eski atılır, sayaç geri gitmez", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tabs-")), "tabs.jsonl");
  let now = Date.now();
  const b = createTabBuffer(file, () => now);
  const old = ev(new Date(now - 25 * 3600_000).toISOString());
  const yeni = ev();
  b.accept([old, yeni]);
  const b2 = createTabBuffer(file, () => now);
  assert.deepEqual(b2.after(0).map((e) => [e.lanSeq, e.event.id]), [[2, yeni.id]]);
  assert.equal(b2.lastSeq(), 2);
  assert.equal(b2.accept([ev()])[0].lanSeq, 3);
  now += 25 * 3600_000;
  b2.compact();
  assert.equal(b2.size(), 0);
  assert.equal(fs.readFileSync(file, "utf8"), "");
});

test("validEvent", () => {
  assert.equal(validEvent(ev()), true);
  assert.equal(validEvent({ ...ev(), id: "x" }), false);
  assert.equal(validEvent({ ...ev(), at: "dün" }), false);
  assert.equal(validEvent({ ...ev(), ev: null }), false);
  assert.equal(validEvent(null), false);
});
```

- [ ] **Step 2:** `node --import ./tests/ts-resolve.mjs --test tests/agent-tabs.test.ts 2>&1 | tail -3` → FAIL (modül yok).

- [ ] **Step 3: Uygula** — `agent/src/tabs.ts`

```ts
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
```

- [ ] **Step 4:** aynı komut → `pass 3`, `fail 0`.
- [ ] **Step 5: Commit** `git add agent/src/tabs.ts tests/agent-tabs.test.ts && git commit -m "LAN Görev 1: ajan adisyon arabelleği"`

---

### Task 2: Ajan yolları (`/tabs/events`, `/tabs/stream`)

**Files:** Modify `agent/src/server.ts`, `agent/src/main.ts`; Test `tests/agent-lan.test.ts`

**Consumes:** Task 1. **Produces:** `Hub.tabsFile?: string | null`, `Hub.streamMs?: number`; `statusBody().tabs = { buffered, clients }`; `VERSION = "0.5.0"`.

- [ ] **Step 1: Test yaz** — `tests/agent-lan.test.ts`

```ts
// tests/agent-lan.test.ts — ajan LAN yolları: bilet (Bearer / yalnız akışta ?ticket=), olay kabulü, SSE yayını.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHub } from "../agent/src/server";
import { signTicket } from "@/lib/agent/ticket";
import type { TabEvent } from "@/lib/core/tab";

const ORIGIN = "https://kasa.example";
const ev = (): TabEvent => ({ id: crypto.randomUUID(), tabId: crypto.randomUUID(), tableId: null, at: new Date().toISOString(), staffId: null, approvedBy: null, seq: null, ev: { type: "open" } as TabEvent["ev"] });

/** SSE'den ilk `n` veri partisini okur. */
async function readBatches(res: Response, n: number): Promise<{ id: string; data: TabEvent[] }[]> {
  const out: { id: string; data: TabEvent[] }[] = [];
  const reader = res.body!.getReader();
  let buf = "";
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const id = /^id: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
      if (id && data) out.push({ id, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return out;
}

test("LAN: bilet, olay kabulü, akış (geçmiş + canlı), Last-Event-ID", async () => {
  const hub = createHub({ hubKey: "hk", tenantId: "T", origin: ORIGIN, config: () => null, revoked: () => [], tabsFile: null });
  const srv = await hub.listenLocal(0);
  after(() => srv.close());
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const ticket = await signTicket("hk", { t: "T", d: "dev-1" });
  const post = (events: unknown, auth = `Bearer ${ticket}`) => fetch(`${base}/tabs/events`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ events }) });

  assert.equal((await post([ev()], "")).status, 401);
  assert.equal((await fetch(`${base}/status?ticket=${ticket}`)).status, 401); // ?ticket= yalnız akışta
  assert.equal((await fetch(`${base}/tabs/stream`)).status, 401);
  assert.equal((await post([{ id: "x" }])).status, 400);
  assert.equal((await post(Array.from({ length: 201 }, ev))).status, 400);

  const [a, b] = [ev(), ev()];
  assert.deepEqual(await (await post([a, a])).json(), { accepted: 1 });
  const s1 = await fetch(`${base}/tabs/stream?ticket=${encodeURIComponent(ticket)}`);
  assert.equal(s1.headers.get("content-type"), "text/event-stream");
  const pending = readBatches(s1, 2);
  await new Promise((r) => setTimeout(r, 50));
  await post([b]);
  const got = await pending;
  assert.deepEqual(got.map((x) => [x.id, x.data.map((e) => e.id)]), [["1", [a.id]], ["2", [b.id]]]);

  const s2 = await fetch(`${base}/tabs/stream?ticket=${encodeURIComponent(ticket)}`, { headers: { "Last-Event-ID": "1" } });
  assert.deepEqual((await readBatches(s2, 1))[0].data.map((e) => e.id), [b.id]);
  const s3 = await fetch(`${base}/tabs/stream?after=99&ticket=${encodeURIComponent(ticket)}`); // ajan sıfırlanmış → baştan
  assert.equal((await readBatches(s3, 1))[0].id, "2");

  const st = await (await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${ticket}` } })).json();
  assert.equal(st.tabs.buffered, 2);
});
```

`signTicket` imzasını `lib/agent/ticket.ts`'ten doğrula (`tests/agent-server.test.ts` nasıl çağırıyorsa aynı).

- [ ] **Step 2:** `node --import ./tests/ts-resolve.mjs --test tests/agent-lan.test.ts 2>&1 | tail -3` → FAIL.

- [ ] **Step 3: `server.ts`**
  - import: `import { createTabBuffer, MAX_BATCH, validEvent, type Entry } from "./tabs";`
  - `VERSION = "0.5.0"`; `Hub`'a `tabsFile?: string | null; streamMs?: number;`
  - `createHub` başında:
```ts
  const tabs = createTabBuffer(h.tabsFile ?? null);
  const clients = new Set<http.ServerResponse>();
  setInterval(() => tabs.compact(), 3600_000).unref();
  const writeBatch = (res: http.ServerResponse, entries: Entry[]) => {
    if (entries.length) res.write(`id: ${entries.at(-1)!.lanSeq}\ndata: ${JSON.stringify(entries.map((e) => e.event))}\n\n`);
  };
```
  - `statusBody()` dönüşüne `tabs: { buffered: tabs.size(), clients: clients.size },`
  - Bilet satırını değiştir (url'yi bilet kontrolünden ÖNCE hesapla; aşağıdaki `const url` satırını buraya taşı):
```ts
    const url = new URL(req.url ?? "/", "http://x");
    const streamRoute = req.method === "GET" && url.pathname === "/tabs/stream";
    const ticket = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? (streamRoute ? url.searchParams.get("ticket") ?? undefined : undefined);
```
  - `route === "GET /status"` satırından önce:
```ts
    if (route === "POST /tabs/events") {
      const evs = body.events;
      if (!Array.isArray(evs) || evs.length > MAX_BATCH || !evs.every(validEvent)) return send(400, { error: "olay" });
      const added = tabs.accept(evs);
      for (const c of clients) writeBatch(c, added);
      return send(200, { accepted: added.length });
    }
    if (route === "GET /tabs/stream") {
      const last = Number(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0) || 0;
      res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", Connection: "keep-alive" });
      res.write(": ok\n\n");
      const pending = tabs.after(last > tabs.lastSeq() ? 0 : last);
      for (let i = 0; i < pending.length; i += MAX_BATCH) writeBatch(res, pending.slice(i, i + MAX_BATCH));
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      const end = setTimeout(() => res.end(), h.streamMs ?? 240_000);
      res.on("close", () => { clients.delete(res); clearInterval(ping); clearTimeout(end); });
      return;
    }
```
- [ ] **Step 4: `main.ts`** — `createHub({ ..., tabsFile: path.join(dir, "tabs.jsonl") })` (`path` import yoksa `import path from "node:path";`).
- [ ] **Step 5:** `node --import ./tests/ts-resolve.mjs --test tests/agent-lan.test.ts tests/agent-server.test.ts tests/agent-core.test.ts tests/agent-db.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 0 (mevcut ajan testleri bozulmadı). `npm run agent:build 2>&1 | tail -2` → `public/indir/cabukpos-agent.cjs` güncellendi.
- [ ] **Step 6: Commit** `git add agent/src tests/agent-lan.test.ts public/indir/cabukpos-agent.cjs && git commit -m "LAN Görev 2: ajan /tabs/events + /tabs/stream (SSE), ajan 0.5.0"`

---

### Task 3: Cihaz — LAN akışı ve gönderimi

**Files:** Modify `lib/core/tab.ts`, `lib/offline/tabs.ts`, `components/kasa/useTabs.ts`, `useTabs(` çağıranları; Test `tests/tab.test.ts`

**Produces:** `lanMergePlan(existing: Set<string>, incoming: TabEvent[]): TabEvent[]`; `mergeLanEvents(evs): Promise<number>`; `pushLan(a: KasaAgent, events: TabEvent[]): Promise<void>`; `resendPending(a)`; `createLanStream(a, onChange, onState)`; `useTabs(enabled, kick, agent?)` → `{ tabs, live, link: "bulut" | "lan" | "yok", add, reload }`.

- [ ] **Step 1: Test** — `tests/tab.test.ts` sonuna (import satırına `lanMergePlan` ekle):

```ts
test("lanMergePlan: yerelde olan (bulut seq'li dahil) ezilmez; yeni seq null; aynı partide tekrar tek", () => {
  const mk = (id: string, seq: number | null): TabEvent => ({ id, tabId: "t", tableId: null, at: "2026-09-29T10:00:00.000Z", staffId: null, approvedBy: null, seq, ev: { type: "open" } as TabEvent["ev"] });
  const out = lanMergePlan(new Set(["a"]), [mk("a", null), mk("b", 5), mk("b", null), mk("c", null)]);
  assert.deepEqual(out.map((e) => [e.id, e.seq]), [["b", null], ["c", null]]);
});
```
(`TabEvent` tipi dosyada import'lu değilse `import type { TabEvent } from "@/lib/core/tab";` ekle.)

- [ ] **Step 2:** `node --import ./tests/ts-resolve.mjs --test tests/tab.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 1.

- [ ] **Step 3: `lib/core/tab.ts`** sonuna:
```ts
/** LAN (ajan) olayları: yalnız yerelde olmayanlar, seq=null ile. Bulut seq'li kopyanın üzerine yazılmaz. */
export function lanMergePlan(existing: Set<string>, incoming: TabEvent[]): TabEvent[] {
  const seen = new Set(existing), out: TabEvent[] = [];
  for (const e of incoming) if (!seen.has(e.id)) { seen.add(e.id); out.push({ ...e, seq: null }); }
  return out;
}
```

- [ ] **Step 4: `lib/offline/tabs.ts`** — import'lara `lanMergePlan` (`@/lib/core/tab`) ve `import type { KasaAgent } from "@/lib/agent/config";`; sona:
```ts
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
export async function pushLan(a: KasaAgent, events: TabEvent[]) {
  for (let i = 0; i < events.length; i += LAN_BATCH) {
    try {
      await fetch(`${a.url}/tabs/events`, { method: "POST", headers: { Authorization: `Bearer ${a.ticket}`, "Content-Type": "application/json" }, body: JSON.stringify({ events: events.slice(i, i + LAN_BATCH) }) });
    } catch { return; }
  }
}

/** Ajana bağlanınca buluta henüz gitmemiş (seq null) tüm olaylar: kesintide açılan cihaz da eksiksiz olsun. */
export async function resendPending(a: KasaAgent) {
  await pushLan(a, (await allTabEvents()).filter((e) => e.seq === null));
}

export function createLanStream(a: KasaAgent, onChange: () => void, onState?: (live: boolean) => void) {
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
```

- [ ] **Step 5: `useTabs.ts`**
```ts
export function useTabs(enabled: boolean, kick: () => void, agent?: KasaAgent | null) {
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
    if (!enabled || !agentUrl || !agentTicket) { setLan(false); return; }
    const s = createLanStream({ ...agent!, url: agentUrl, ticket: agentTicket }, () => void reload(), setLan);
    return () => s.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız adres/bilet değişince yeniden bağlan
  }, [enabled, agentUrl, agentTicket, reload]);
  const tabs = useMemo(() => foldTabs(events), [events]);
  const add = useCallback(async (list: NewTabEvent[]) => {
    const evs = await addTabEvents(list);
    await reload();
    kick();
    if (agent) void pushLan(agent, evs);
    return evs;
  }, [reload, kick, agent]);
  const link: "bulut" | "lan" | "yok" = cloud ? "bulut" : lan ? "lan" : "yok";
  return { tabs, live: cloud || lan, link, add, reload };
}
```
Import'lar: `createLanStream, pushLan` (`@/lib/offline/tabs`), `type KasaAgent` (`@/lib/agent/config`).

- [ ] **Step 6: Çağıranlar** — `grep -rn "useTabs(" components` → her çağrıya `meta.agent` 3. argüman (meta erişimi olan bileşende; yoksa prop ile). `live` kullanan göstergeleri (`grep -rn "live" components/kasa/*.tsx | grep -i "canlı\|live &&\|!live"`) `link`'e göre: `bulut` → mevcut metin ("Canlı"), `lan` → "Yerel ağ (internet yok)" (`data-testid="link-lan"`), `yok` → mevcut çevrimdışı metni. Başka `live` davranışını değiştirme.

- [ ] **Step 7:** `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 0; `npx tsc --noEmit` ve `npm run lint` temiz.
- [ ] **Step 8: Commit** `git commit -am "LAN Görev 3: cihaz ajan akışı + gönderimi, bağlantı göstergesi"` (yeni dosya yok).

---

### Task 4: E2E + ilerleme

**Files:** Create `e2e/lan.mjs`; Modify `docs/PROGRESS.md`

- [ ] **Step 1: `e2e/lan.mjs`** — kurulum `e2e/m5.mjs`'ten aynen (kayıt, masa/ürün, ajan eşle+çalıştır, kasa cihazı + garson rolü cihazı eşleme, PIN). m5'te garson bağlamı yoksa m5'teki kasa eşleme adımını ikinci bağlamda tekrarla ve cihazı Cihazlar'dan `garson` rolüne al. Sonra:
```js
  // İnternet yok: bulut adisyon akışı + eşitleme kesilir (ajan 127.0.0.1'de açık kalır)
  const cut = (route) => route.abort();
  for (const p of [kasa, garson]) { await p.route("**/api/tabs/**", cut); await p.route("**/api/sync/**", cut); }
  await garson.getByTestId("link-lan").waitFor({ timeout: 20_000 });
  // garson: masa → ürün ekle → mutfağa gönder (m5'teki seçicilerle)
  // kasa: salonda masa dolu + satır görünür
  await kasa.getByTestId("link-lan").waitFor();
  step("internet yok: garson siparişi ajan üzerinden kasaya düştü");
  for (const p of [kasa, garson]) { await p.unroute("**/api/tabs/**", cut); await p.unroute("**/api/sync/**", cut); }
  // bulutta tek kopya: garsonun add olayı
  await waitFor(async () => Number((await sql`select count(*)::int as n from tab_events where tab_id in (select tab_id from tab_events where store_id = ${storeId} and type = 'add')`)[0].n) >= 2, "bulut eşitlemesi");
  const [dup] = await sql`select count(*)::int as n from (select id from tab_events group by id having count(*) > 1) x`;
  if (dup.n) throw new Error("çift olay");
  step("internet geldi: olaylar buluta tek kopya");
  console.log("LAN OK");
```
(Seçiciler ve `waitFor`/`sql`/`storeId` m5'teki adlarıyla; eksik olanı m5'ten al.)

- [ ] **Step 2: Kapılar**
```bash
lsof -ti:3800 | xargs kill; npm run build 2>&1 | tail -2
node --env-file=.env.local node_modules/.bin/next start -p 3800 &   # arka planda
node --env-file=.env.local e2e/lan.mjs && node --env-file=.env.local e2e/m5.mjs && node --env-file=.env.local e2e/m4.mjs
```
Beklenen: `LAN OK`, `M5 OK`, `M4 OK`. Kayıt sınırı: `delete from login_attempts where key like 'signup:%'`.

- [ ] **Step 3: PROGRESS** — "LAN merkezi" bölümü: kararlar (ajan yalnız aktarıcı, `?ticket=` yalnız akışta, lanSeq, 24 saat/20 000, `mergeLanEvents` ezmez), tablet sınırı (CF DNS), ajan 0.5.0 yeniden indirme. Prod: şema değişikliği YOK → yalnız main + Vercel; kasalar ajanı güncellemeli.
- [ ] **Step 4: Commit + push** `git add e2e/lan.mjs docs/PROGRESS.md && git commit -m "LAN Görev 4: e2e/lan.mjs (LAN OK), ilerleme notu" && git push`

## Canlıya alma

Şema değişikliği yok. Sıra: M9c prod (prod-push.sh 1..5) → `lan-merkez` main'e ff → Vercel Ready → canlı E2E m5. Kasalar ajan 0.5.0'ı Donanım'dan indirip kurar. Tablet LAN'ı: Yiğit `cabukpos.com` DNS → Cloudflare + Vercel env `CF_API_TOKEN`, `CF_ZONE_ID`.
