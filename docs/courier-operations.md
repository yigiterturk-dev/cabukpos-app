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

Dış kurye durumu için ayrıca `db/releases/2026-10-31-courier-jobs.sql` eklenir; yalnız yeni `courier_jobs` tablosunu açar, mevcut verilere dokunmaz. Sıra ve doğrulama ayrıntısı [courier-integrations.md](courier-integrations.md) içindedir.

Dağıtım sırası: güncel yedek/restore kanıtını kontrol et → SQL'i uygula → yeni uygulamayı dağıt → API smoke/şube izolasyonunu doğrula. Eski uygulama yeni tabloyu kullanmadığından kod geri alınabilir; geri dönüşte tabloyu silmek gerekmez. Üretime henüz uygulanmadı. Üretimdeki tablo hacmi ve kilit beklemeleri dağıtım öncesi tekrar ölçülmelidir.

Yerel HTTP smoke (yalnız loopback ve `cabukpos_preview_*` DB kabul eder):

```sh
node --env-file=.env.local --experimental-strip-types --import ./tests/ts-resolve.mjs e2e/delivery-api.mjs
```

Test kendi geçici işletmesini kaldırır; kullanıcının PIN'i, cihazı veya demo siparişlerini değiştirmez. Çalışan telefon GPS'i için saha doğrulaması ayrıca gerekir. Dış kurye (YNR) sevki artık bağlıdır; yapılandırma, tekilleştirme ve sınırlar için [courier-integrations.md](courier-integrations.md).

Etkileşimli, yalnız geliştirmede çalışan örnek ekran: `/kasa/sevkiyat-onizleme`.

## Gerçek tahsilat ve kurye hesabı

`/yonetim/kurye-hesap`: seçili şubenin kurye cihazlarına ait vardiyalarını listeler. Günlük nakit, kart, online ve iade tutarları `sales`/`payments` kayıtlarından hesaplanır. Gün sınırı Türkiye saatidir; günlük tahsilat ödeme tarihine göre, kapanış hesabı vardiyanın bütününe göre alınır. Gece yarısını geçen vardiyanın önceki tahsilatı beklenen nakde dahildir, sonraki günün tahsilat karosuna eklenmez.

Beklenen nakit = açılış + alınan nakit − para üstü − nakit iadeler − safe drop. Sayılan nakit mevcut vardiya kapanışından gelir; fark yeniden hesaplanan beklenene göre gösterilir. Saklanmış kapanış beklentisi sonradan eşitlenen işlemlerle değişmişse uyarı verilir. İncelenecek satışlar tutarlardan gizlenmez; sayıları ayrıca gösterilir. Rapor limit aşımında kısmi toplamı tam hesap gibi göstermez.

Kurye telefonundaki eski sipariş-etiketi toplamı kaldırıldı. “Vardiya beklenen nakit” yerel IndexedDB satışlarını canlı izler; internet olmadan kaydedilen tahsilat da güncellenir. Bu değer gerçek fiziksel sayımın yerine geçmez.

Kurye hesabı CSV ve yazdır/PDF sunar; vardiya kartından fiş raporuna gidilir. Kasa paket ekranının Kurye yönetimi bölümünden ve yönetim menüsünden erişilir. Okuma yönetici oturumu ve seçili şube kapsamındadır. Vardiya ayrıntısında şube müdürünün başka şubeye geçmesi de engellendi. Yeni tablo veya migration yok; yeni kasa girişi yazılarak tahsilat iki kez sayılmaz. Telefonun hesap kapatma/PIN onayı mevcut kapanış yolunu kullanır.

Kapsam: cihaz rolü `kurye` olan vardiyalar. Başka cihazda tahsil edilmiş ön ödeme bu telefonun nakdi sayılmaz. Personel başına dış kurye ücretleri, platform komisyonu ve bağımsız banka mutabakatı bu raporun parçası değildir. Cihaz rolünü geçmişte değiştirmiş işletmeler için geçmiş cihaz sınıflandırma kaydı bu şemada bulunmaz.

Yerel örnekler: `scripts/seed-courier-account-demo.ts`, sadece belirli loopback demo veritabanını ve demo hesabını kabul eder. İki kapalı tarihî vardiya ekler: Deniz hesabı dengeli, Ekin hesabı 10 TL eksik. Hesaplar pasif, cihazlar eşlenmemiş ve iptal edilmiş durumdadır; kullanıcı PIN'i, cihaz eşlemesi ve aktif vardiyası değişmez. Sağlayıcı, stok veya mali belge işlemi başlatmaz.

Doğrulama: 521/521 test, ESLint ve TypeScript geçti. Veritabanı testleri karma ödeme/para üstü/iade, gece yarısı, safe drop, sayım farkı, değişen kapanış, şube/kiracı ayrımı ve CSV formül kaçışını kapsar. Yönetim sayfası ve CSV route'u yerel tarayıcı isteğinde 200 döndü. CSV indirme olayını bekleyen tarayıcı otomasyonu zaman aşımına uğradığından indirilen dosyanın konumu ayrıca doğrulanmadı. Masaüstü görünüm incelendi; 390 px mobilde sayfa genişliği 390 px olarak doğrulandı.
