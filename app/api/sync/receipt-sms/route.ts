// #38: nakit satışta fişi SMS ile gönderme. Cihaz çereziyle kimlik; SMS sağlayıcı env kapalıysa 501.
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getDevice } from "@/lib/auth/kasa";
import { hit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/core/delivery";
import { isCurrency, type Currency } from "@/lib/core/money";
import { receiptSmsText } from "@/lib/core/receipt";
import { messagingProvider } from "@/lib/growth/messaging";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  const body = (await req.json().catch(() => null)) as { saleId?: string; phone?: string } | null;
  const saleId = body?.saleId ?? "";
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) return Response.json({ error: "Satış bulunamadı." }, { status: 400, headers: noStore });
  if (!phone) return Response.json({ error: "Telefon geçersiz (ör. 05321234567)." }, { status: 400, headers: noStore });
  if ((await hit(`receipt-sms:${device.id}`, 15)) > 10) return Response.json({ error: "Çok fazla istek; biraz bekleyin." }, { status: 429, headers: noStore });

  const row = await withTenant(device.tenantId, async (tx) => {
    const [s] = await tx.select({ receiptNo: schema.sales.receiptNo, at: schema.sales.createdAt, total: schema.sales.total, storeId: schema.sales.storeId, channel: schema.sales.channel })
      .from(schema.sales).where(and(eq(schema.sales.id, saleId), eq(schema.sales.status, "kapandi")));
    if (!s || s.channel !== "kasa") return null;
    const lines = await tx.select({ name: schema.saleLines.name, qtyMilli: schema.saleLines.qtyMilli }).from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId));
    const [store] = await tx.select({ name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.id, s.storeId));
    const [tn] = await tx.select({ currency: schema.tenants.currency }).from(schema.tenants); // #16: fiş SMS'i işletme para birimiyle
    const currency: Currency | undefined = isCurrency(tn?.currency) ? tn.currency : undefined;
    return { ...s, lines, storeName: store?.name ?? "", currency };
  });
  if (!row) return Response.json({ error: "Satış bulunamadı." }, { status: 404, headers: noStore });

  const provider = messagingProvider();
  if (!provider) return Response.json({ error: "SMS gönderimi kapalı (sağlayıcı yapılandırılmadı)." }, { status: 501, headers: noStore });
  let result: { error?: string } | undefined;
  try {
    [result] = await provider.send({
      body: receiptSmsText({ storeName: row.storeName, receiptNo: row.receiptNo, at: row.at.toISOString(), total: row.total, lines: row.lines, currency: row.currency }),
      targets: [{ recipientRef: `receipt:${saleId}`, phone }],
    });
  } catch (e) {
    return Response.json({ error: `SMS gönderilemedi: ${e instanceof Error ? e.message : "sağlayıcı hatası"}` }, { status: 502, headers: noStore });
  }
  await withTenant(device.tenantId, (tx) => audit(tx, device.tenantId, `device:${device.id}`, "receipt.sms", { saleId, phone: `***${phone.slice(-2)}`, ok: !result.error }));
  if (result.error) return Response.json({ error: `SMS gönderilemedi: ${result.error}` }, { status: 502, headers: noStore });
  return Response.json({ ok: true }, { headers: noStore });
}
