// Örnek menü verisi (saf): yeni işletmenin soğuk başlangıcını kırmak için tek tıkla kategori + ürün seti.
// Fiyatlar kuruş; KDV Türkiye oranları (1 temel gıda, 10 yiyecek/içecek). Yalnız ürün listesi boşken yüklenir.
export type OrnekUrun = { name: string; price: number; vatRate: 1 | 10 | 20; kind?: "adet" | "tartili"; quick?: boolean };
export type OrnekKategori = { name: string; urunler: OrnekUrun[] };
export type OrnekMenu = { kategoriler: OrnekKategori[] };

export const ORNEK_MENULER: Record<"restoran" | "market", OrnekMenu> = {
  restoran: {
    kategoriler: [
      { name: "Çorbalar", urunler: [
        { name: "Mercimek Çorbası", price: 9500, vatRate: 10 },
        { name: "Ezogelin Çorbası", price: 9500, vatRate: 10 },
      ] },
      { name: "Ana Yemekler", urunler: [
        { name: "Adana Kebap", price: 28500, vatRate: 10 },
        { name: "Tavuk Şiş", price: 22500, vatRate: 10 },
        { name: "Köfte Porsiyon", price: 24000, vatRate: 10 },
        { name: "İskender", price: 32000, vatRate: 10 },
        { name: "Lahmacun", price: 8500, vatRate: 10 },
        { name: "Kıymalı Pide", price: 12000, vatRate: 10 },
      ] },
      { name: "İçecekler", urunler: [
        { name: "Ayran", price: 4500, vatRate: 10, quick: true },
        { name: "Şalgam", price: 4000, vatRate: 10 },
        { name: "Türk Kahvesi", price: 6000, vatRate: 10 },
        { name: "Su 0,5 L", price: 1500, vatRate: 1, quick: true },
      ] },
      { name: "Tatlılar", urunler: [
        { name: "Künefe", price: 14000, vatRate: 10 },
        { name: "Fındık Baklava", price: 12500, vatRate: 10 },
        { name: "Sütlaç", price: 8500, vatRate: 10 },
      ] },
    ],
  },
  market: {
    kategoriler: [
      { name: "İçecekler", urunler: [
        { name: "Su 5 L", price: 3500, vatRate: 1, quick: true },
        { name: "Kola 1 L", price: 4500, vatRate: 10, quick: true },
        { name: "Ayran 300 ml", price: 2500, vatRate: 10, quick: true },
        { name: "Meyve Suyu 1 L", price: 4200, vatRate: 10 },
      ] },
      { name: "Atıştırmalık", urunler: [
        { name: "Cips 110 g", price: 4200, vatRate: 10, quick: true },
        { name: "Karışık Kuruyemiş 250 g", price: 6500, vatRate: 10 },
        { name: "Bisküvi", price: 1800, vatRate: 1 },
        { name: "Çikolata", price: 2500, vatRate: 1 },
      ] },
      { name: "Temel Gıda", urunler: [
        { name: "Ekmek", price: 1500, vatRate: 1, quick: true },
        { name: "Süt 1 L", price: 3200, vatRate: 1, quick: true },
        { name: "Yumurta 10'lu", price: 6500, vatRate: 1 },
        { name: "Beyaz Peynir 500 g", price: 14500, vatRate: 1 },
        { name: "Zeytinyağı 1 L", price: 32000, vatRate: 1 },
        { name: "Domates", price: 2990, vatRate: 1, kind: "tartili" },
      ] },
    ],
  },
};
