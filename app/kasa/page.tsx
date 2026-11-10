// Kasa: statik kabuk; tüm veri cihazda (IndexedDB) — service worker ile çevrimdışı açılır.
import { KasaApp } from "@/components/kasa/KasaApp";
import { getDevice } from "@/lib/auth/kasa";

export const dynamic = "force-dynamic";

export default async function Kasa() {
  const device = await getDevice().catch(() => null);
  return (
    <div className="flex min-h-dvh flex-col">
      <KasaApp paired={Boolean(device)} />
    </div>
  );
}
