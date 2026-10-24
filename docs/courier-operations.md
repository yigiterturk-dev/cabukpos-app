# Paket ve kurye operasyonu

Kasa → Paket: Canlı akış, Sipariş listesi, Kurye yönetimi.

- Canlı akışta onay/hazırlık/hazır/yolda/son kapanan siparişler, arama, hazırlık gecikmesi ve açık hesap uyarısı bulunur.
- “Hazır düğmesinde en az aktif işi olan kuryeye ata” bu oturum için isteğe bağlıdır. İşletmenin paket siparişlerinde mevcut atamayı korur. Platform kuryesi çağırmaz. Birden fazla kasanın eşzamanlı atamasında iş yükü önerisi anlık yerel görünüme dayanır.
- Sipariş listesi ve kurye raporu seçilen günün bulut kayıtlarını alır, cihazdaki bekleyen olayları birleştirir. Hata durumunda kısmi yerel veri açıkça işaretlenir; eksik raporun CSV/yazdırma işlemi kapatılır.
- Rapor gününe teslim tarihi (yoksa kapanış, sonra açılış) esas alınır; Türkiye saati kullanılır. Aktif kurye işi güncel iş yüküdür. Nakit/kart alanları teslim edilen siparişlerin teslimat ödeme türüne göre toplamıdır; çekmece bakiyesi veya kurye kasa teslim tutanağı değildir. Asıl tahsilat muhasebesi satış/ödeme kayıtları ve vardiya raporundadır.
- Kurye raporları seçili filtrelerle CSV ve yazdırma/PDF olarak alınabilir. CSV formül enjeksiyonu ve HTML yazdırma XSS kaçışları uygulanır.

## Konum paylaşımı

Yalnız `kurye` rolündeki eşlenmiş cihazdan, aktif kurye personelinin PIN'i sunucuda doğrulandıktan sonra başlar. `courier-location` amaçlı, cihaza/kiracıya/şubeye/personele bağlı 30 dakikalık jeton yalnız bellekte tutulur. PIN kaydedilmez.

Telefon ekranında açık rıza ile “Konumumu paylaş” seçilir; tarayıcı konum izni ayrıca gerekir. Paylaşım ön planda çalışır, 20 saniyeden sık göndermez ve 30 dakikada kapanır. Ekran kapanışı/durdurma son noktayı kaldırmayı dener. Gecikmiş istek durdurulan oturumu tekrar açamaz. Yeni oturum eski oturumu geçersiz kılar.

Yalnız son konum saklanır, yol izi saklanmaz. Konum 90 saniyeden eskiyse güncel olarak gösterilmez; 15 dakikadan eski noktalar rapordan çıkar ve şubenin sonraki konum sorgusunda silinir. Cihaz çevrimdışıyken arka planda kesintisiz GPS takibi vaat edilmez. Harita kullanıcı ayrıca açarsa OpenStreetMap'e son koordinatı iletir. GET yalnız kasa cihazlarına, aynı kiracı ve şubeye açıktır. Geriye dönük GPS izi ve otomatik rota optimizasyonu yoktur.

## Yerel doğrulama / dağıtım

Yeni tablo: `db/releases/2026-10-24-courier-locations.sql`. PostgreSQL 16.13 yerel demo ve test veritabanlarında uygulandı. Yeni tablo başlangıçta boştur; backfill yoktur, mevcut satış/ödeme/adisyon tabloları değiştirilmez. FK oluşturma üst tablolarda kısa kilit alabilir; 3 sn kilit, 15 sn işlem zaman aşımıyla sınırlandırılmıştır. FORCE RLS ve kiracı politikası aynı işlemde açılır. Uygulama rolü RLS'yi atlamaz.

Dağıtım sırası: güncel yedek/restore kanıtını kontrol et → SQL'i uygula → yeni uygulamayı dağıt → API smoke/şube izolasyonunu doğrula. Eski uygulama yeni tabloyu kullanmadığından kod geri alınabilir; geri dönüşte tabloyu silmek gerekmez. Üretime henüz uygulanmadı. Üretimdeki tablo hacmi ve kilit beklemeleri dağıtım öncesi tekrar ölçülmelidir.

Yerel HTTP smoke (yalnız loopback ve `cabukpos_preview_*` DB kabul eder):

```sh
node --env-file=.env.local --experimental-strip-types --import ./tests/ts-resolve.mjs e2e/delivery-api.mjs
```

Test kendi geçici işletmesini kaldırır; kullanıcının PIN'i, cihazı veya demo siparişlerini değiştirmez. Çalışan telefon GPS'i ve dış kurye sağlayıcısı için saha doğrulaması ayrıca gerekir. Dış firmaya otomatik kurye çağrısı bu sürümde bağlı değildir.

Etkileşimli, yalnız geliştirmede çalışan örnek ekran: `/kasa/sevkiyat-onizleme`.
