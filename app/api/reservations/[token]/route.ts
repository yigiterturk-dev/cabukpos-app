import { z } from "zod";
import { clientIp, hit } from "@/lib/ratelimit";
import { availableBookingSlots, bookReservation, BookingError, reservationContext } from "@/lib/reservations";
import { timeToAt } from "@/lib/core/reservation";
import { isValidCalendarDay } from "@/lib/core/report";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ token: string }> };
export async function GET(req: Request, { params }: Params) {
  if (await hit(`booking-slots:${await clientIp()}`, 1) > 30) return Response.json({ error: "Çok sık sorgulandı. Bir dakika bekleyin." }, { status: 429, headers });
  const ctx = await reservationContext((await params).token);
  if (!ctx) return Response.json({ error: "Rezervasyon sayfası kapalı." }, { status: 404, headers });
  const q = new URL(req.url).searchParams, day = q.get("day") ?? "", guests = Number(q.get("guests"));
  if (!isValidCalendarDay(day) || !Number.isInteger(guests) || guests < 1 || guests > 99) return Response.json({ error: "Gün ve kişi sayısını kontrol edin." }, { status: 400, headers });
  try { return Response.json({ slots: await availableBookingSlots(ctx, day, guests) }, { headers }); }
  catch { return Response.json({ error: "Uygun saatler yüklenemedi." }, { status: 503, headers }); }
}
const input = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(120), phone: z.string().max(24).transform(s => s.replace(/\D/g, "")).pipe(z.string().regex(/^\d{6,15}$/)), guests: z.number().int().min(1).max(99), day: z.string().max(10), time: z.string().max(5), note: z.string().max(300).default(""), website: z.string().max(100).default("") });
export async function POST(req: Request, { params }: Params) {
  if (req.headers.get("origin") !== new URL(process.env.APP_URL || req.url).origin) return Response.json({ error: "Kaynak doğrulanamadı." }, { status: 403, headers });
  if (await hit(`booking-create:${await clientIp()}`, 1) > 5) return Response.json({ error: "Çok fazla istek. Bir dakika bekleyin." }, { status: 429, headers });
  const ctx = await reservationContext((await params).token);
  if (!ctx) return Response.json({ error: "Rezervasyon sayfası kapalı." }, { status: 404, headers });
  const body = input.safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.website) return Response.json({ error: "Bilgileri kontrol edin." }, { status: 400, headers });
  const at = timeToAt(body.data.day, body.data.time);
  if (!at) return Response.json({ error: "Geçerli gün ve saat seçin." }, { status: 400, headers });
  try { const saved = await bookReservation(ctx, { ...body.data, at }, "public:reservation", true); return Response.json({ id: saved.id, status: saved.status }, { headers }); }
  catch (e) { return Response.json({ error: e instanceof BookingError ? e.message : "Rezervasyon alınamadı. Tekrar deneyin." }, { status: e instanceof BookingError ? 409 : 503, headers }); }
}
