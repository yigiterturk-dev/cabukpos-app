// Adisyon akışı (SSE): şubedeki adisyon olayları sunucu sırasıyla. Kimlik: cihaz çerezi.
// İmleç Last-Event-ID (tarayıcı yeniden bağlanırken gönderir) ya da ?after=. İmleç yoksa son 24 saatin açık adisyonları.
// Sunucu saniyede bir yeni olay arar, 15 sn'de bir ping, ~240 sn sonra kapatır; EventSource kendiliğinden yeniden bağlanır.
import { getDevice } from "@/lib/auth/kasa";
import { eventsAfter, initialEvents } from "@/lib/tabs/stream";
import type { TabEvent } from "@/lib/core/tab";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 1000;
const PING_MS = 15_000;
const LIFETIME_MS = 240_000;

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const ctx = { tenantId: device.tenantId, storeId: device.storeId };
  const raw = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after");
  let cursor = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  const enc = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      req.signal.addEventListener("abort", () => { closed = true; });
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      // Olaylar toplu gönderilir: tek "data" = dizi; id = partinin son seq'i.
      const emit = (evs: TabEvent[]) => {
        if (!evs.length) return;
        cursor = Math.max(cursor ?? 0, ...evs.map((e) => e.seq ?? 0));
        send(`id: ${cursor}\ndata: ${JSON.stringify(evs)}\n\n`);
      };
      try {
        send("retry: 2000\n\n");
        if (cursor === null) { const evs = await initialEvents(ctx); cursor = 0; emit(evs); send(`event: ready\ndata: ${cursor}\n\n`); }
        let lastPing = Date.now();
        while (!closed && Date.now() - started < LIFETIME_MS) {
          const evs = await eventsAfter(ctx, cursor ?? 0);
          emit(evs);
          if (evs.length) continue; // parti doluysa beklemeden devam
          if (Date.now() - lastPing > PING_MS) { send(": ping\n\n"); lastPing = Date.now(); }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        // DB hatası: kapat, istemci yeniden bağlanır
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
