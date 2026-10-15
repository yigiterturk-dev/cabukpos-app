// Kasa: statik kabuk; tüm veri cihazda (IndexedDB) — service worker ile çevrimdışı açılır.
import { KasaApp } from "@/components/kasa/KasaApp";

export default function Kasa() {
  return (
    <div className="flex min-h-dvh flex-col">
      <KasaApp />
    </div>
  );
}
