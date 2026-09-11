import type { SectorConfig, SectorId } from "./types";

export const SECTORS: Record<SectorId, SectorConfig> = {
  berber: {
    id: "berber",
    label: "Berber / Kuaför",
    tagline: "Koltuk doluluğu, usta primleri ve günlük ciro tek ekranda.",
    terms: {
      appointment: "Randevu",
      staff: "Usta",
      service: "İşlem",
      customer: "Müşteri",
    },
  },
  guzellik: {
    id: "guzellik",
    label: "Güzellik / Spa",
    tagline: "Seans planı, uzman doluluğu ve paket takibi düzenli kalsın.",
    terms: {
      appointment: "Randevu",
      staff: "Uzman",
      service: "Bakım",
      customer: "Müşteri",
    },
  },
  otoyikama: {
    id: "otoyikama",
    label: "Oto Yıkama / Detailing",
    tagline: "Araç akışı, ekip primi ve günlük kazanç kontrol altında.",
    terms: {
      appointment: "İş Emri",
      staff: "Ekip",
      service: "Paket",
      customer: "Araç Sahibi",
    },
  },
  veteriner: {
    id: "veteriner",
    label: "Veteriner",
    tagline: "Hasta kaydı, aşı takvimi ve kontrol randevuları tek panelde.",
    terms: {
      appointment: "Randevu",
      staff: "Veteriner Hekim",
      service: "İşlem",
      customer: "Hasta",
    },
  },
  diyetisyen: {
    id: "diyetisyen",
    label: "Diyetisyen",
    tagline: "Danışan takibi, seans planı ve ölçüm geçmişi tek ekranda.",
    terms: {
      appointment: "Seans",
      staff: "Diyetisyen",
      service: "Danışmanlık",
      customer: "Danışan",
    },
  },
  psikolog: {
    id: "psikolog",
    label: "Psikolog / Terapist",
    tagline: "Seans planı, danışan geçmişi ve terapi takibi düzenli kalsın.",
    terms: {
      appointment: "Seans",
      staff: "Uzman",
      service: "Terapi",
      customer: "Danışan",
    },
  },
  doktor: {
    id: "doktor",
    label: "Doktor / Klinik",
    tagline: "Muayene randevuları, hasta geçmişi ve kontrol takibi net olsun.",
    terms: {
      appointment: "Randevu",
      staff: "Hekim",
      service: "Muayene",
      customer: "Hasta",
    },
  },
  dishekimi: {
    id: "dishekimi",
    label: "Diş Hekimi",
    tagline: "Tedavi randevuları, hasta dosyası ve kontrol planı tek panelde.",
    terms: {
      appointment: "Randevu",
      staff: "Hekim",
      service: "Tedavi",
      customer: "Hasta",
    },
  },
  restoran: {
    id: "restoran",
    label: "Restoran / Lokanta",
    tagline: "Masa takibi, adisyonlar ve paket servisler tek panelde.",
    terms: {
      appointment: "Adisyon",
      staff: "Garson",
      service: "Ürün",
      customer: "Hesap",
    },
  },
  kafe: {
    id: "kafe",
    label: "Kafe / Kahveci",
    tagline: "Hızlı sipariş, adisyon takibi ve ciro kontrol altında.",
    terms: {
      appointment: "Sipariş",
      staff: "Barista",
      service: "Ürün",
      customer: "Hesap",
    },
  },
  market: {
    id: "market",
    label: "Market / Bakkal",
    tagline: "Hızlı satış, barkodlu okutma ve veresiye takibi.",
    terms: {
      appointment: "Satış",
      staff: "Kasiyer",
      service: "Ürün",
      customer: "Cari",
    },
  },
  pastane: {
    id: "pastane",
    label: "Pastane / Fırın",
    tagline: "Sipariş takibi, günlük satışlar ve özel pasta siparişleri.",
    terms: {
      appointment: "Sipariş",
      staff: "Tezgahtar",
      service: "Ürün",
      customer: "Hesap",
    },
  },
};

export const SECTOR_LIST = Object.values(SECTORS);

export function sectorTerms(id: SectorId | null) {
  if (!id) return SECTORS.restoran.terms;
  return SECTORS[id].terms;
}
