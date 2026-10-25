import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { availableBookingSlots, reservationContext } from "@/lib/reservations";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
import { Input, Button } from "@/components/ui";
import { ReservationBooking } from "@/components/ReservationBooking";
export const dynamic = "force-dynamic";
export default async function PublicReservation({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ day?: string; guests?: string }> }) {
  const ctx = await reservationContext((await params).token);
  if (!ctx) notFound();
  const [store] = await withTenant(ctx.tenantId, tx => tx.select({ name: schema.stores.name }).from(schema.stores).where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId))));
  if (!store) notFound();
  const today = istToday(), query = await searchParams;
  const maxDay = istToday(Date.parse(`${today}T12:00:00+03:00`), ctx.advanceDays);
  const day = query.day && isValidCalendarDay(query.day) && query.day >= today && query.day <= maxDay ? query.day : today;
  const guests = Number(query.guests) >= 1 && Number(query.guests) <= 99 && Number.isInteger(Number(query.guests)) ? Number(query.guests) : 2;
  const slots = await availableBookingSlots(ctx, day, guests);
  return <main className="min-h-screen bg-canvas px-4 py-10"><section className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-card"><p className="mb-2 text-sm font-semibold text-brand">{store.name}</p><h1 className="mb-2 text-3xl font-bold">Masanızı ayıralım</h1><p className="mb-6 text-sm text-muted">Gün ve kişi sayısını seçin; müsait saatleri gösterelim.</p><form method="get" className="mb-6 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Gün<Input type="date" name="day" defaultValue={day} min={today} max={maxDay} required /></label><label className="grid gap-1 text-sm">Kişi sayısı<Input type="number" name="guests" defaultValue={guests} min={1} max={99} required /></label><Button type="submit" variant="secondary" className="sm:col-span-2">Uygun saatleri göster</Button></form><ReservationBooking key={`${day}:${guests}`} token={ctx.token} day={day} guests={guests} slots={slots} /></section></main>;
}
