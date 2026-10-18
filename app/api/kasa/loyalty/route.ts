// #33: kasada sadakat/kupon/hediye kartı sorgusu. Cihaz çereziyle kimlik; salt okuma, hız sınırlı.
// ?phone=      → müşteri + puan bakiyesi + sadakat ayarları
// ?coupon=&subtotal=&customer= → kupon doğrulama + indirim
// ?gift=       → hediye kartı kalan bakiye
import { getDevice } from "@/lib/auth/kasa";
import { hit } from "@/lib/ratelimit";
import { normalizeCouponCode } from "@/lib/loyalty";
import { checkCoupon, customerLoyalty, giftCardBalance } from "@/lib/admin/loyalty-lookup";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  if (device.role !== "kasa") return Response.json({ error: "rol" }, { status: 403, headers: noStore });
  if ((await hit(`loyalty:${device.id}`, 60)) > 90) return Response.json({ error: "Çok fazla istek; biraz bekleyin." }, { status: 429, headers: noStore });

  const p = new URL(req.url).searchParams;
  const phone = p.get("phone");
  if (phone) {
    if (phone.length > 24) return Response.json({ error: "Telefon numarası çok uzun." }, { status: 400, headers: noStore });
    return Response.json({ customer: await customerLoyalty(device.tenantId, phone) }, { headers: noStore });
  }

  const coupon = normalizeCouponCode(p.get("coupon") ?? "");
  if (coupon) {
    const subtotal = Math.max(0, Math.trunc(Number(p.get("subtotal") ?? 0)) || 0);
    const customerId = p.get("customer") || null;
    return Response.json(await checkCoupon(device.tenantId, coupon, subtotal, customerId), { headers: noStore });
  }

  const gift = normalizeCouponCode(p.get("gift") ?? "");
  if (gift) return Response.json(await giftCardBalance(device.tenantId, gift), { headers: noStore });

  return Response.json({ error: "sorgu" }, { status: 400, headers: noStore });
}
