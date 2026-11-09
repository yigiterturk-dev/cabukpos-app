// lib/offline/sync.ts — Eşitleme motoru (tarayıcı). Tek seferde tek koşu: önce giden kutusu yukarı, sonra katalog aşağı.
// Ağ/5xx hatası → artan bekleme; 401 → cihaz eşlemesi yok/iptal; 409 → tarayıcı başka cihaz olarak eşlenmiş.
import { backoffMs, PUSH_BATCH, type DocResult } from "@/lib/sync/docs";
import { kasaDb, loadMeta, resetForDevice } from "./db";
import { reconcile, type Meta, type ResetNotice } from "./state";

export type SyncStatus = { online: boolean; pending: number; rejected: number; unpaired: boolean; lastOkAt: number | null; syncing: boolean; reset: ResetNotice | null };
type Listener = (s: SyncStatus, meta: Meta | null) => void;

const PULL_EVERY_MS = 60_000;

// Kapanış gibi uzun rw işlemleri süresince eşitleme okuma bandını durdurur:
// IndexedDB işlemi yaş/açlıktan korumaz; sürekli gelen küçük readonly'lar rw'yi bekletir.
let syncPaused = false;
export function pauseSync(v: boolean) { syncPaused = v; }

class HttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  if (!r.ok) throw new HttpError(r.status);
  return r.json();
}

export function createSync(listener: Listener) {
  const d = kasaDb();
  let status: SyncStatus = { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: 0, rejected: 0, unpaired: false, lastOkAt: null, syncing: false, reset: null };
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const emit = async (meta: Meta | null = null) => {
    const m = meta ?? (await loadMeta());
    status = { ...status, pending: await d.outbox.count(), rejected: await d.rejected.count(), reset: m.resetNotice ?? null };
    if (!stopped) listener(status, meta);
  };

  async function push(deviceId: string) {
    for (;;) {
      const rows = await d.outbox.orderBy("n").limit(PUSH_BATCH).toArray();
      if (!rows.length) return;
      const { results } = (await getJson("/api/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, now: Date.now(), docs: rows.map((r) => r.doc) }) })) as { results: DocResult[] };
      // Çökme dayanıklılığı (#26): sonuç partiyle hizalı değilse hiçbir satır silinmez;
      // aynı belgeler sunucuda idempotent (var olan tekrar yazılmaz) olduğundan yeniden gönderim güvenli.
      if (!Array.isArray(results) || results.length !== rows.length) throw new Error("push yanıtı partiyle uyuşmuyor");
      await d.transaction("rw", [d.outbox, d.rejected], async () => {
        const now = new Date().toISOString();
        for (const [i, r] of results.entries()) {
          const row = rows[i]; // sonuçlar gönderilen sırayla
          if (!row) continue;
          if (!r.ok) await d.rejected.put({ id: row.id, doc: row.doc, error: r.error, at: now });
          await d.outbox.delete(row.n!);
        }
      });
      await emit();
    }
  }

  async function once() {
    const meta = await loadMeta();
    if (!meta.device) {
      status = { ...status, unpaired: true };
      await emit(meta);
      return;
    }
    await push(meta.device.id);
    const server = await getJson(`/api/sync/catalog?v=${encodeURIComponent(meta.v ?? "")}`);
    if (meta.device && meta.device.id !== server.device.id) {
      await resetForDevice("Bu tarayıcı başka bir cihaz olarak eşlendi.");
      return once();
    }
    const next = await d.transaction("rw", [d.meta, d.outbox], async () => {
      const m = reconcile(await loadMeta(), server, await d.outbox.count());
      await d.meta.put(m);
      return m;
    });
    await emit(next);
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void run(), ms);
  }

  async function run(): Promise<void> {
    if (syncPaused) { again = true; return; }
    if (running) { again = true; return running; }
    running = (async () => {
      status = { ...status, syncing: true };
      await emit();
      try {
        do { again = false; await once(); } while (again);
        failures = 0;
        status = { ...status, online: true, unpaired: false, lastOkAt: Date.now() };
        schedule(PULL_EVERY_MS);
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) status = { ...status, online: true, unpaired: true };
        else if (e instanceof HttpError && e.status === 409) { await resetForDevice("Bu tarayıcı başka bir cihaz olarak eşlendi."); schedule(0); }
        else { failures++; status = { ...status, online: e instanceof HttpError }; schedule(backoffMs(failures)); }
      } finally {
        status = { ...status, syncing: false };
        running = null;
        await emit();
      }
    })();
    return running;
  }

  const onOnline = () => { failures = 0; void run(); };
  const onOffline = () => { status = { ...status, online: false }; void emit(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return {
    /** Hemen eşitle (satıştan sonra, açılışta). */
    kick: () => run(),
    status: () => status,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    },
  };
}
