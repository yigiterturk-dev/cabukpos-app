# Suitable iş akışları ve ÇabukPOS karşılaştırması

İnceleme tarihi: 25 Ekim 2026. Kaynak: [SuitablePOS resmî kullanım kılavuzu v1.6](https://suitablepos.com/suitablepos-kilavuz). Kılavuzun 20 ana modülünün kapsamı tarandı; sipariş, mutfak, kurye ve ödeme adımları ayrıntılı incelendi. Yayımlanan ekran görüntüleri önceki referans dosyasında kayıtlıdır. Özel canlı panele giriş yapılmadı; tüm görsellerin tek tek incelendiği veya sağlayıcı işlemlerinin çalıştırıldığı iddia edilmiyor.

## Günlük operasyonun hedefi

Kullanıcının belirttiği işletme akışı: platform siparişi → otomatik kabul → mutfak bileti → hazır → kurye / gel-al → teslim ve ödeme → vardiya kapanışı. Otomatik kabul, dış kurye firmasına iş açılması ve fiziksel teslim birbirinden ayrı olaylardır. Zaman geçti diye fiilî teslim kaydı üretilmez.

## Bizdeki kanıt ve sınırlar

Buradaki “mevcut” kodda karşılığı bulunduğunu belirtir; her ekranın bu incelemede yeniden uçtan uca test edildiği veya Suitable ile tam eşdeğer olduğu anlamına gelmez.

| Alan | ÇabukPOS kanıtı | Sınır / yapılacak iş |
| --- | --- | --- |
| Kurulum, işletme ve PIN | `lib/auth`, `app/yonetim/subeler`, `lib/admin/staff-actions.ts` | Mevcut kullanıcının PIN'i ve cihaz eşlemesi korunur. Google işletme araması eşdeğerliği yok. |
| Menü, seçenek, toplu aktarım | `lib/admin/catalog-actions.ts`, `app/yonetim/secenekler`, `components/kasa/SaleScreen.tsx` | CSV aktarımı var; Excel ve çok dilli menü aynı özellik olarak sayılmıyor. |
| Masa ve hesap | `lib/core/tab.ts`, `components/kasa/TabScreen.tsx`, `components/kasa/BillScreen.tsx` | Masa akışı ve ödeme bölme var; referanstaki her kroki işlemi yeniden doğrulanmadı. |
| Paket kabulü | `lib/platform/provision.ts`, `lib/platform/ingest.ts`, `tests/delivery-db.test.ts` | Yeni yönetim bağlantısı otomatik kabul açık oluşturulur. Eski bağlantıdaki işletme tercihi korunur. Tekrar gelen webhook ikinci mutfak bileti oluşturmaz. |
| Mutfak | `components/kasa/KitchenScreen.tsx` | İstasyon, hazırlık/hazır, kompakt görünüm, arama, sayfalama ve yazı boyutu mevcut. |
| Kendi kuryesi | `components/kasa/DeliveryBoard.tsx`, `DeliveryOperations.tsx`, `CourierScreen.tsx` | İş yükü, atama, teslimat geçmişi ve ödeme türü mevcut. Otomatik atama oturumluk ve isteğe bağlıdır. |
| Konum | `lib/tabs/courier-location.ts`, `app/api/delivery/location` | İzinli, ekran açıkken konum; seçili kurye haritası. Arka plan takibi, çok işaretçili harita ve rota optimizasyonu yok. |
| Dış kurye | `lib/platform/types.ts` mevcut platform adaptörü sınırını gösterir | Dış kurye firmasında iş açma / iptal / teslim webhook'u tamamlanmış değil. “Hazır” düğmesi bu hizmetleri çağırıyor denemez. |
| Platformlar | `lib/platform/index.ts`, `notify.ts`, `outbound.ts` | Sağlayıcı sürücüleri sandbox ve varsayılan kapalı. Canlı sözleşme, kimlik ve karşılıklı durum testi olmadan entegrasyon hazır sayılmaz. |
| Ödeme ve gün sonu | `lib/core/split.ts`, `lib/core/payment.ts`, `lib/kasa/shift-report.ts` | Nakit/kart karma tahsilat, kişi/ürün/pay bölme ve para üstü mevcut. Kurye sipariş tutarı gerçek kasa bakiyesi değildir. |
| Rapor | `lib/admin/report.ts`, `app/yonetim/raporlar` | Tarih, ürün, personel ve konsolide rapor var. Platform komisyonu / hakediş / kurye masrafı mutabakatı ayrı geliştirme gerektirir. |
| Personel | `lib/admin/staff-actions.ts`, `lib/core/access.ts` | PIN ve sabit roller var. Özel rol matrisi, insan kaynakları dosyası, görev ve çalışma vardiyası planlama yok. Kasa vardiyası bu özelliklerle karıştırılmaz. |
| Müşteri ve sadakat | `lib/delivery/customers.ts`, `lib/loyalty.ts`, `lib/admin/loyalty-actions.ts` | Kayıtlı adres, puan, kupon, hediye kartı karşılıkları var. Telefon hattı Caller ID entegrasyonu yok; garson çağrısı farklı bir özelliktir. Cari hesapta bire bir eşdeğerlik doğrulanmadı. |
| Rezervasyon | `lib/admin/reservation-actions.ts`, `lib/core/reservation.ts` | Yönetimden kayıt/durum var. Müşteri rezervasyon portalı ve kapasiteye göre müsait saat motoru tamamlanmış sayılmaz. |
| Depo ve sevkiyat | `app/yonetim/depo`, `lib/admin/transfer.ts`, `transfer-document.ts` | Depo, şubeler arası stok hareketi ve belge var. Yolda/teslim alındı onaylı lojistik süreciyle aynı değil. |
| Reçete, üretim, sayım | `lib/core/recipe.ts`, `lib/admin/recipe-actions.ts`, `stock-count.ts`, `app/yonetim/uretim` | Maliyet, ara ürün, üretim ve sayım karşılıkları var. Otomatik tedarik siparişi ve SKT/lot yönetimi tamamlanmış değil. |
| QR ve kiosk | `lib/kiosk.ts`, `app/api/kiosk`, `app/api/menu` | Sipariş hattı mevcut; kendi tüketici pazaryeri / keşif uygulaması bulunmuyor. |
| Çok şube / marka | `app/yonetim/hq`, `franchise`, `markalar`, `lib/core/access.ts` | Merkez ve şube kapsamları var. Ayrı mobil yönetici uygulaması yok. |
| Donanım ve mali belge | `agent/src/printers.ts`, `scale.ts`, `app/api/fiscal` | Yazıcı/terazi köprüsü ve mali belge yolları var; Windows, fiziksel cihaz, ÖKC ve e-Arşiv saha doğrulaması bekliyor. |
| Destek ve işletme ayarları | `app/yonetim/yardim`, `tercihler`, `donanim`, `denetim` | Yardım, tercihler ve denetim kayıtları var. Destek bileti konuşması, broşür üretimi ve müşteri ekranı medya yönetimi doğrulanmış karşılıklar değil. |

## Bu değişikliğin doğrulaması

- Yönetim aksiyonu ortak bağlantı oluşturma servisini kullanır; `autoAccept: true` açıkça yazılır. Şema migrasyonu gerekmez.
- İşletme ve şube eşleşmesi doğrulanır; aynı bağlantıyı tekrar oluşturmak mevcut manuel tercihi değiştirmez. Eşzamanlı tekrarlar tekillik kısıtıyla korunur.
- Veritabanı testi gerçek bağlantı oluşturma yolunu kullanır: imzalı örnek webhook → kabul → tek mutfak bileti → tekrar webhook'ta yeni sipariş/bilet yok → kabul bildirimi denetim kaydı.
- Önizlemedeki ilk platform paketi artık onay bekletilmeden hazırlanıyor sütununda başlar. Sadece örnek olaylar değişir.
- Yerel `Yerel Demo` işletmesinde aktif platform bağlantısı bulunmadığından mevcut bağlantı ayarı değiştirilmedi; tarihî siparişler tekrar işlenmedi.

## Öncelik sırası

1. Gerçek platform ve dış kurye için onaylı sözleşme, sipariş/durum sözleşmeleri ve sandbox erişimi; kabul hatasında güvenilir tekrar ve görünür hata akışı.
2. Kurye teslim/tahsilatının vardiya ve platform hakedişiyle mutabakatı.
3. Günlük servis akışındaki uç durumların saha denemesi: bağlantı kesilmesi, tekrar webhook, kısmi ödeme, iptal/iade, vardiya devri.
4. Personel planlama, rezervasyon müsaitliği, depo teslim alma ve tedarik gibi ayrı ürün kapsamları.

Bu liste uygulama ve doğrulama kuyruğudur; tam özellik eşitliği veya canlı kullanım onayı değildir.

Doğrulama sonucu: 508/508 test geçti; ESLint, TypeScript ve `git diff --check` temiz.

## Bildirim hatası sonrası toparlanma

25 Ekim devam değişikliği: tekrar webhook, mevcut kabul olayını yeniden kullanır. Yeni adisyon, ürün veya mutfak bileti oluşturmaz. Hazırlık süresi kayıtlı kabulden okunur; yeni istekteki değerle değiştirilmez. Başarılı kabul kaydı varsa tekrar gönderim atlanır; başarısız gönderim düzelince yalnız bildirim hatası temizlenir. Ürün eşleme ve yetki incelemeleri korunur.

Bildirim denetimleri artık adisyon kimliğine bağlıdır. Aynı dış sipariş numarasının farklı şubelerde kullanılması birbirinin kabul/teslimat bildirimini bastırmaz. Eski, adisyon kimliği taşımayan denetim kayıtları yalnız kaynak platform ve numara tek bir siparişi belirliyorsa başarı kanıtı kabul edilir.

Pasif bağlantıdan gönderim yapılmaz. İptal/red/teslim/yola çıkış sonrasında eski kabul yeniden gönderilmez. Yanlış adisyona ait olay kimliği ve yetki incelemesine düşen teslim gibi olaylar dış platforma iletilmez. Başarısız durum bildiriminde aynı sync belgesinin yeniden gönderilmesi de hata işaretini temizleyebilir.

Sınırlar: Bu değişiklik zamanlayıcılı bir kuyruk eklemez; kabul tekrarı sağlayıcının webhook'u tekrar göndermesine, durum tekrarı sync belgesinin tekrarına bağlıdır. Eşzamanlı bildirimler veya ağ zaman aşımı için sağlayıcı tarafında idempotent işlem gerekir; tam olarak bir kez dış çağrı garantisi verilmez. Aynı şubede farklı platformların aynı dış numarayı kullanması için mevcut giriş tekillik indeksinin ayrıca platform kapsamına taşınması gerekir. Gerçek sağlayıcıyla test yapılmadı.

Bu devam değişikliğinin doğrulaması: 513/513 test geçti; ESLint, TypeScript ve diff boşluk kontrolü temiz.
