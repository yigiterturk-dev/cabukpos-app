// PayTR "Bildirim URL" — ödeme sonucu buraya gelir. Yanıt düz "OK" olmalı; yoksa PayTR tekrar dener.
import { paymentIdOf, paytrKeys, callbackValid as verifyAuth } from "@/lib/billing/paytr";
import { completePayment } from "@/lib/billing/service";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { clientIp, hit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if ((await hit(`paytr:${await clientIp()}`, 1)) > 120) return new Response("too many requests", { status: 429 });
  const k = paytrKeys();
  if (!k) return new Response("disabled", { status: 404 });
  const f = await req.formData();
  const b = { merchant_oid: String(f.get("merchant_oid") ?? ""), status: String(f.get("status") ?? ""), total_amount: String(f.get("total_amount") ?? ""), hash: String(f.get("hash") ?? "") };
  if (!verifyAuth(k, b)) return new Response("bad hash", { status: 400 });
  const id = paymentIdOf(b.merchant_oid);
  if (!id) return new Response("OK"); // bizim olmayan sipariş: PayTR'yi döngüye sokma
  const [p] = await getDb().select().from(schema.billingPayments).where(eq(schema.billingPayments.id, id));
  if (!p || p.provider !== "paytr") return new Response("OK");
  // Taksitsiz; payment_amount bizim tutarla aynı olmalı (total_amount vade farkını içerebilir).
  const paid = Number(f.get("payment_amount") ?? b.total_amount);
  const ok = b.status === "success" && paid === p.amount;
  if (b.status === "success" && !ok) console.error("[paytr] tutar uyuşmuyor", id, paid, p.amount);
  await completePayment(id, ok, `paytr-${b.merchant_oid}${ok ? "" : `-${String(f.get("failed_reason_code") ?? "tutar")}`}`);
  return new Response("OK");
}
