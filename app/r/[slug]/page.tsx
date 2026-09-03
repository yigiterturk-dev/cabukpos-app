// Public (oturumsuz) online rezervasyon sayfası — SERVER COMPONENT.
//
// slug route param'dan alınır → getPublicBookingBySlug(slug) ile salt-okunur, DAR veri yüklenir
// (yalnız işletme adı + AKTİF hizmet/personel + meşgul aralıklar; hassas veri yok). Slug yoksa 404.
// useStore'a BAĞIMLI DEĞİL → oturumsuz ziyaretçide çalışır, sahibin slug'ı doğrulanır.

import { notFound } from "next/navigation";

import { getPublicBookingBySlug } from "@/lib/data/public-booking";
import BookingClient from "./BookingClient";

export const dynamic = "force-dynamic"; // her zaman güncel slot/işletme verisi

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicBookingBySlug(slug);
  if (!data) notFound();

  return <BookingClient data={data} />;
}
