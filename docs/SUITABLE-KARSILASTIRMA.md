# ÇabukPOS ↔ Suitable POS karşılaştırması (2026-10-06)

Kaynak: suitablepos.com kamuya açık sayfa (3.150+ işletme, "80+ özellik, ömür boyu ücretsiz" konumlandırması). Kendi iddialarımız repodaki kanıtlara dayanır (test/E2E/prod).

## Özellik karşılaştırması

| Alan | Suitable | ÇabukPOS | Durum |
|---|---|---|---|
| Masa/adisyon yönetimi | Var | M5: değişmez olay kaydı, hesap bölme, ikram, istasyonlar | ✅ Bizde daha derin |
| Garson + mutfak ekranı | Var | M5 istasyon/mutfak (PIN'siz mutfak) | ✅ |
| QR menü + kiosko | Var (masadan sipariş) | #37: QR menü, sır doğrulamalı kiosko, müşteri durum ekranı | ✅ (garson çağırma düğmesi onlarda) |
| Stok + yarı mamul + reçete | Var | M7: hammadde, alış fişi, tedarikçi bakiyesi, kritik stok, **kârlılık (sale_lines.cost)** | ✅ Daha derin |
| Raporlama | Var ("onlarca rapor" + BOSS AI) | M9a + müşteri/RFM + konsolide + Büyüme Merkezi insights | ✅ PWA, native app onlarda |
| Çevrimdışı | "İnternet kesilse de çalışır" | M2 + SW outbox + panel offline + **LAN merkezi (internetsiz salon, ajan)** | ✅ En güçlü farkımız |
| Çoklu şube | Var (SuitableRMS: zincir HQ, reçete maliyeti, tedarik tek akış) | #44 şube UI + kapsam, #43 konsolide rapor | ⚠️ Temel var; RMS düzeyi HQ konsolu yok |
| Bulut mutfak (çok marka tek mekân) | Var | Yok | ❌ |
| Platform entegrasyonu | YS, Trendyol, Migros, GetirYemek, TıklaGelsin **canlı** | Getir sandbox + YS adaptör hazır, **canlı anahtar bekliyor** | ⚠️ İnsan işi |
| ÖKC entegrasyonu | Ingenico/Hugin/Pavo/Inpos/Beko/Ödeal, VUK 507 **canlı** | Sürücü katmanı + fake-okc sandbox hazır, **gerçek cihaz/entegratör yok** | ❌ En kritik boşluk (insan işi) |
| Caller ID telefon siparişi | Var (kendi %1 komisyon modelinin parçası) | Müşteri defteri + teslimat bölgeleri (caller ID bilerek yok) | ❌ Bilinçli |
| Kurye: 3. parti (Fiyuu, Vigo, 18 firma) + haritalı takip | Var | Kendi kurye PWA (konum bilerek yok) | ❌ Bilinçli |
| Market dikeyi (barkod, terazi, raf etiketi, hızlı kasa) | Yok (yalnız restoran/kafe) | M3 + ajan 0.6.0 prova komutları | ✅ Onlarda yok |
| Mali uyum detayı | VUK 507 fiş | Bilgi fişi + e-Arşiv sürücü katmanı + iade tutanağı/faturası + muhasebe export | ⚠️ Entegratör onayı bekleniyor |
| Güvenlik/kanıt | Kamuya açık kanıt yok | 348 test, 14/14 E2E maratonu, RLS + audit append-only, CI kapısı | ✅ |

## İş modeli farkı (dikkat)

Suitable POS'u **ömür boyu ücretsiz** veriyor; geliri SuitableYEMEK komisyonundan (%1 kendi kurye, %3 platform ödeme, %24 platform kuryesi) ve caller ID'den. Bizim PLAN_PRICE abonelik modelimiz buna karşı konumlanmalı: değer önerisi = **sahiplik (komisyon yok), market dikeyi, gerçek çevrimdışı/donanım sahipliği, veri uyumu**. Fiyat kararını (PLAN_PRICE_*) verirken bu karşısında test et.

## Somut yapılacaklar (bu karşılaştırmadan çıkan)

1. **Gerçek ÖKC/e-Arşiv** — launch kapısındaki en büyük boşluk; Suitable'nin "mali onaylı" iddiasına karşı bizde mutlaka canlı olmalı (insan: entegratör + mali müşavir).
2. **Platform canlı anahtarları** (YS/TGO/Getir/Migros) — sandbox hazır, insan işi.
3. Garson çağırma düğmesi (QR menüde) — küçük, eklenebilir (kapsam kararı Yiğit).
4. Bulut mutfak / çok marka — bekletilen işler listesine.
5. Native mobil (BOSS benzeri) — PWA ile örtülüyor, ayrı iş değil.

Not: onların fiyatı "0 TL" — bizim tanıtım sayfası fiyatı env'e bağlı; açılış mesajı buna göre yazılmalı.
