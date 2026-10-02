// Bulut→istemci itme (SSE): kiracıda değişim belirteci değişince "tick" yollar; istemci kick() ile eşitler.
// Kimlik: cihaz çerezi (kasa). Sunucu 2 sn'de bir belirteç arar, 15 sn'de bir ping, ~240 sn sonra kapatır;
// EventSource kendiliğinden yeniden bağlanır. Katalog içeriği belirteçte yoktur: çekim yine ?v= özetiyle yapılır.
import { getDevice } from "@/lib/auth/kasa";
import { syncToken } from "@/lib/sync/dirty";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2000;
const PING_MS = 15_000;
const LIFETIME_MS = 240_000;

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const enc = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      req.signal.addEventListener("abort", () => { closed = true; });
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      try {
        send("retry: 2000\n\n");
        send(`event: ready\ndata: ${device.storeId}\n\n`);
        let last = await syncToken(device.tenantId);
        let lastPing = Date.now();
        while (!closed && Date.now() - started < LIFETIME_MS) {
          const next = await syncToken(device.tenantId);
          if (next !== last) { last = next; send(`data: ${next}\n\n`); }
          else if (Date.now() - lastPing > PING_MS) { send(": ping\n\n"); lastPing = Date.now(); }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        // DB hatası: kapat, istemci yeniden bağlanır
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
