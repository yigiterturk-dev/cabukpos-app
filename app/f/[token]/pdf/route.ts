// NES resmî PDF görünümü (belge token'ı ile). Canlıda kiracının BYOK NES bağlantısı kullanılır.
import { schema, withTenant } from "@/db";
import { docByToken } from "../doc";
import { nesConfig, nesConnFrom, nesPdf, type NesConn } from "@/lib/fiscal/nes";
import { clientIp, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

async function connFor(d: { provider: string | null; tenantId: string }): Promise<NesConn | null> {
  if (process.env.FISCAL_PROVIDER_OVERRIDE === "nes-sandbox") return nesConfig();
  if (d.provider !== "nes") return null;
  const [s] = await withTenant(d.tenantId, (tx) => tx.select().from(schema.fiscalSettings));
  return s ? nesConnFrom(s) : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if ((await hit(`fatura-pdf:${await clientIp()}`, 1)) > 30) return new Response("Çok fazla istek", { status: 429 });
  const { token } = await params;
  const d = await docByToken(token);
  if (!d?.ettn) return new Response("Belge yok", { status: 404 });
  const conn = await connFor(d);
  if (!conn) return new Response("Yok", { status: 404 });
  try {
    const r = await nesPdf(d.ettn, conn);
    return new Response(r.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${d.number ?? "fatura"}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response(`NES PDF alınamadı: ${e instanceof Error ? e.message.slice(0, 300) : ""}`, { status: 502 });
  }
}
