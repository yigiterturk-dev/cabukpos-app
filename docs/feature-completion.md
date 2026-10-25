# Kod tarafı tamamlama çalışması — 25 Ekim 2026

Kullanıcı yedi başlığın tamamının bağlantı/sağlayıcı erişimi beklenmeden uygulanmasını istedi. Çalışma yerel geliştirme, migration, demo ve test kapsamındadır; canlı dağıtım ve dış finansal işlem yoktur. Kullanıcı PIN'i, cihaz eşlemesi ve aktif vardiyası korunur. Başlangıç: `b2608aa`, 531 test, lint/TypeScript temiz.

- [x] Kurye kapıda nakit + kart karma tahsilat; para üstü ve tekrar denemede tek satış.
- [x] Rezervasyon masa kapasitesi, çakışan saatleri engelleme ve müşteriye rezervasyon sayfası.
- [x] Depo sevkiyatında gönderim/yolda/teslim alma; hedef stok yalnız teslimde artsın.
- [x] Platform komisyonu, kurye gideri, beklenen hakediş ve gerçekleşen tutar farkı.
- [x] Stok parti/SKT ve düşük stoktan tedarik siparişi.
- [x] Personel bazında ayrıntılı işlem yetkileri; arka uçta da uygulanması.
- [x] Çalışan gerçek giriş/çıkışı ve çalışma süresi; plan ve kasa vardiyasından ayrı.

Her başlıkta kalıcı veri/işlem, kullanılabilir ekran, şube/kiracı kapsamı, tekrar/eşzamanlılık koruması ve uygun testler gerekir. Belirsiz sağlayıcı davranışları taklit edilmez. Tüm başlıklar bitmeden çalışma tamamlandı sayılmaz.


## Sonuç ve kanıt

Yedi kod başlığı yerelde tamamlandı. Bu kayıt canlı sağlayıcı, banka, kurye firması, yazıcı veya mali cihaz doğrulaması anlamına gelmez.

| Başlık | Kullanım yolu | Doğrulanan davranış |
| --- | --- | --- |
| Kurye karma tahsilat | Kurye teslim penceresi; `/kasa/sevkiyat-onizleme` | Nakit/kart ayrı tutarlar, nakitten para üstü, tekrar satış kimliğinde tek tahsilat. 315 ₺ hesapta 200 nakit + 150 kart → 35 ₺ para üstü. |
| Rezervasyon | `/yonetim/rezervasyonlar/ayarlar`; `/rezervasyon/[token]` | Masa kapasitesi, süre, yarı açık aralıkla çakışma, şubeye göre kilit, aynı istek kimliğinde tekrar, müşteri formu. Eşzamanlı son masa isteklerinden biri kabul edilir. |
| Sevkiyat | `/yonetim/transferler/[id]` | Gönderimde kaynak düşer; yolda stok yazılmaz; hedef teslimde artar; iptal kaynağa döner. Tekrarlanan teslim/iptal tek stok hareketi üretir. Parti kodu/SKT hedefe taşınır. |
| Hakediş | `/yonetim/platform-hesap` | Kaynak platforma göre satış/iade, komisyon matrahı ve oranı, kurye gideri, düzeltme, beklenen/gelen/fark. Çakışan dönem engeli, sonradan eşitlenen belge uyarısı, geçmişi silmeden iptal ve yeni hesap. |
| Parti ve tedarik | `/yonetim/partiler`, `/yonetim/tedarik` | Etiketsiz mevcut stok partiye ayrılır; stok artmaz. Satış/reçete/üretim/fire/sevkiyat çıkışları FEFO. Sayım ve geriye tarihli hareketler toplamla tutarlıdır. Sipariş tesliminde tek alış/parti; alış iptali kendi partisine uygulanır, tüketilmiş alış iptali engellenir. |
| Personel yetkisi | `/yonetim/personel` → Düzenle → İşlem yetkileri | Kişi bazında 9 izin; yerel depoda ve sunucuda kontrol. Yetkisiz adisyon işlemi reddi, tamamlanmış mali belgelerde kaydı koruyan inceleme uyarısı. Değişimde hesap şifresi doğrulaması. |
| Fiilî devam | `/yonetim/devam` | Yönetici giriş/çıkış kaydeder; sunucu saati. Personel başına tüm şubelerde tek açık giriş. Eski çıkış isteği yeni girişi kapatamaz. Son 31 gün ve açık girişler, geçen/gerçek süre. |

### Testler

- Genel paket: `npm test`, **550/550 geçti**. Log: `/private/tmp/cabukpos-seven-full-final.log`.
- Son alış/parti çapraz düzeltmesinden sonra: stok, alış, üretim, sevkiyat ve sync grubunda **31/31 geçti**; bu grupta bir yeni regresyon testi var. Log: `/private/tmp/cabukpos-stock-integration-final.log`. Aynı anda çalıştırılmış 551 test iddiası yoktur.
- `npm run qa:static`: lint ve TypeScript temiz. Son log: `/private/tmp/cabukpos-seven-static-final.log`.
- Üretim derlemesi açık dev sunucusundan bağımsız kaynak kopyasında doğrulanır; sonuç logu `/private/tmp/cabukpos-seven-build-final.log`.
- Gerçek tarayıcıda karma para üstü, tedarik oluşturma/teslim, personel giriş/çıkış, sevkiyat yolda/teslim ve müşteri rezervasyon başarı mesajı görüldü. Hakediş ekranındaki demo: net 800 ₺, online 560 ₺, komisyon 80 ₺, beklenen 480 ₺, gelen 445 ₺, fark −35 ₺.
- Görsel kanıt: `/private/tmp/cabukpos-reservation-success.png`, `/private/tmp/cabukpos-platform-settlement.png`.

### İşletim sınırları

- SKT yaklaşan/geçmiş partileri uyarır. Fiziksel ayırma ve imha işletme tarafından onaylanır; otomatik satış blokajı veya gıda uygunluğu sertifikası değildir. İadeler etiketsiz stoğa döner.
- Tedarik siparişinde kısmi teslim ve tedarikçiye otomatik mesaj yoktur. Mevcut işlem bütün siparişi tek kez teslim alır.
- Komisyon oranları ve masraflar işletme tarafından girilir. Gelen ödeme elle kayıttır; banka/sağlayıcıdan otomatik çekilmez.
- Devam yönetici kayıtlarıdır; çalışan uygulaması, bordro, mola/ücret hesaplama ve konumla otomatik giriş yoktur.
- Çevrimdışı cihaz yeni izinleri katalog eşitlemesinde alır. Sunucu güncel yetkileri ayrıca denetler. Daha önce fiilen tamamlanmış mali belgeler inceleme işaretiyle korunur.
- Kullanıcı PIN'i, mevcut cihaz eşlemesi ve kullanıcının açık kasa vardiyası değiştirilmedi. Demo mali geçmişi ayrı, iptal edilmiş cihaz/kapanmış vardiyada oluşturuldu.
- Migration ve dağıtım sırası: `docs/feature-completion-migrations.md`. Canlı veritabanına uygulanmadı; GitHub Actions açılmadı.

Son gezinme düzeltmesi: Stok ekranına Parti/SKT, Tedarik ve Sevkiyat; Raporlar ekranına Hakediş ve Kurye hesabı bağlantıları eklendi. Personel formunun şifre açıklaması izin değişimini de kapsar. Son dar ekran kontrolü tarayıcı kontrol bağlantısı kesildiği için tamamlanmış sayılmadı; bu çalışmada yeni ekranların mobil doğrulaması iddia edilmiyor.
