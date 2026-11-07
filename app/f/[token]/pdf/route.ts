// NES sandbox'ının resmî PDF görünümü (yalnız test ortamı; belge token'ı ile).
import { docByToken } from "../doc";
import { nesConfig, nesPdf } from "@/lib/fiscal/nes";
import { clientIp, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (process.env.FISCAL_PROVIDER_OVERRIDE !== "nes-sandbox" || !nesConfig()) return new Response("Yok", { status: 404 });
  if ((await hit(`fatura-pdf:${await clientIp()}`, 1)) > 30) return new Response("Çok fazla istek", { status: 429 });
  const { token } = await params;
  const d = await docByToken(token);
  if (!d?.ettn) return new Response("Belge yok", { status: 404 });
  try {
    const r = await nesPdf(d.ettn);
    return new Response(r.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${d.number ?? "fatura"}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response(`NES PDF alınamadı: ${e instanceof Error ? e.message.slice(0, 300) : ""}`, { status: 502 });
  }
}
