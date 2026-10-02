// #57: İstemci telemetri fişeği. Doğrulanmış yükü sunucu telemetrisine devreder; kimliksiz, küçük sınırlı.
import { z } from "zod";
import { captureError } from "@/lib/observability/telemetry";

export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  if ((Number(req.headers.get("content-length")) || 0) > 8192) return new Response(null, { status: 413 });
  try {
    const parsed = schema.safeParse(await req.json());
    if (parsed.success) {
      const { source, message, stack, path } = parsed.data;
      await captureError(source, message, { stack, path });
    }
  } catch { /* bozuk yük sessizce düşer */ }
  return new Response(null, { status: 204 });
}
