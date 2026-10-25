# Kalan bağımsız akışlar — 25 Ekim 2026

Başlangıç `30fe836`. Kullanıcı sıradaki işleri sürdürmemizi istedi. Yerel kapsam: kısmi tedarik teslimi, SKT satış kontrolü, personelin kendi PIN’iyle devam kaydı ve telefon ekranları. Mevcut PIN, cihaz eşlemesi ve açık mali vardiya korunur.

## Uygulama

- Kısmi tedarik: `/yonetim/tedarik`. `procurement_receipts` her teslimi ayrı istek UUID’si, miktar, parti, SKT, alış fişi ve aktörle saklar. Sipariş satırları değişmez; kalan miktar teslimlerden hesaplanır. `siparis → kismi → teslim`; kalan miktar iptali `kismi_iptal` olur ve önceki stok geri alınmaz. Başlık kilidi fazla/eşzamanlı teslimi engeller. Aynı teslim kimliği aynı içerikte tek işlem, farklı içerikte hata üretir. Eski teslimler yeni tabloya sahte kayıtla doldurulmaz; eski `teslim` durumunda tarihsel tam teslim kabul edilir.
- SKT: `lib/core/stock-expiry.ts`, `lib/stock-expiry.ts`, `lib/offline/stock-expiry.ts`. Girilmiş SKT’si **bugünden önce** olan ve pozitif miktarı kalan parti engel oluşturur; SKT günü sonuna kadar geçerlidir. Ürünün kendisi, reçetesi ve seçenek hammaddeleri kontrol edilir. Aynı üründe geçerli parti de bulunsa önce geçmiş parti ayrılıp imha kaydı yapılır; hangi fiziksel partinin satıldığını varsaymayız.
- Çevrimiçi satış öncesi `/api/kasa/stock-check` güncel stoktan kontrol yapar. Eşleşme ve Origin zorunlu; gövde doğrulanır. Sunucuya ulaşılamıyorsa sessizce izin verilmez. Çevrimdışında son katalogdaki `expirySafety` ve cihaz günü kullanılır; eski katalog yenilenmeden işlem açılmaz, katalog gününden geri cihaz saati reddedilir. Katalogdan sonra başka cihazda oluşan stok/parti değişikliği çevrimdışı cihaza anında ulaşamaz. Yeni katalog eşitlemesi gereklidir.
- Önceden fiilen tamamlanmış satışın eşitlemesi SKT nedeniyle silinmez/reddedilmez; belge ve tahsilat korunup `sales.review` uyarısı eklenir. Bu, yeni kasadaki satış öncesi engeli kaldırmaz. Etiketsiz, SKT’si girilmemiş fiziksel ürünün tarihi bilinemez.
- Personel: `/kasa/devam` eşlenmiş cihazda isim + kendi PIN’iyle durum/giriş/çıkış sağlar. PIN her istekte sunucuda doğrulanır; kalıcı saklanmaz. Yalnız kendi kaydını değiştirebilir. Şube cihaz kimliğinden alınır; başka şubenin açık giriş kimliği verilmez ve kapatılamaz. Tek açık giriş kuralı bütün şubelerde sürer. Giriş istek UUID’si ve çıkış oturum kimliği kayıp yanıt tekrarını korur; eski giriş isteği kapatılmış oturumu yeniden açmaz. İnternet gerekir; mali kasa vardiyası açılıp kapanmaz. Origin, cihaz eşleşmesi, personel ve cihaz bazlı hız sınırı vardır.
- Görsel deneme: geliştirme önizlemesindeki Personel giriş/çıkış aynı `StaffClock` bileşenini kullanır. `previewOnly` hiçbir ağ isteği/kayıt yapmaz. Üretimde önizleme kapalıdır. Gerçek PIN akışı ayrı HTTP testiyle doğrulandı.

## Doğrulama

| Kontrol | Sonuç / kanıt |
| --- | --- |
| `npm test` | **560/560**; `/private/tmp/cabukpos-four-full-final.log` |
| `npm run qa:static` | Lint/TypeScript; `/private/tmp/cabukpos-four-static-final.log` |
| `npm run build` | Ayrı kaynak kopyasında üretim derlemesi; `/private/tmp/cabukpos-four-build-final.log` |
| Gerçek HTTP | `scripts/smoke-local-remaining-workflows.ts`; `/private/tmp/cabukpos-four-http.log` |
| 390 px telefon | Tedarik teslim formu, parti formu, hakediş formu, devam kartları, rezervasyon ayarları, müşteri formu ve PIN formu önizlemesi: belge genişliği 390, içerik genişliği 390 |
| Gerçek telefon işlemi | 6 kg kalana 7 kg reddi, düzeltip 2 kg teslim: kalan 4 kg; önceki alanlar hatada korundu |
| Görseller | `/private/tmp/cabukpos-partial-mobile.png`, `/private/tmp/cabukpos-staff-clock-mobile.png` |

Genel testlere kısmi teslim ve yarış, tekrar kimliği değişikliği, kalan iptali, yanlış PIN, başka şube/kiracı sınırı, mali vardiyaya dokunmama, SKT günü/gece değişimi, reçete/seçenek, imha sonrası engelin kalkması, çevrimiçi bağlantı hatası ve tamamlanmış mali belgeyi uyarıyla koruma dahildir.

HTTP smoke yalnız loopback ve tam yerel demo DB adıyla çalışır; geçici ayrı test işletmesi oluşturur ve kendi verilerini temizler. Gerçek işletmenin kullanıcı/PIN/cihaz/verileriyle çalışmaz. Demo seed `scripts/seed-remaining-workflows-demo.ts` yalnız Yerel Demo işletmesinde örnek sipariş/teslim ekler. İlk 4 kg ardından tarayıcıda 2 kg teslim alındı; 4 kg kaldı.

İlk denemede kesilen tablet kontrolü sonraki turda tamamlandı. 768 px tablet formları ve 1024 px menü geçişi doğrulandı; ayrıntılar aşağıdadır. Dış kurye/banka sağlayıcı bağlantıları, bu sürümün Netcup canlı geçişi ve mali cihaz/saha doğrulaması bu çalışmada yapılmadı.

## Migration ve yayın

PostgreSQL 16+; yerelde 16.13, küçük demo/test hacmi. Canlı hacim ve kilit süresi ölçülmedi. `db/releases/2026-10-25-partial-procurement.sql` yeni tablo/indeks/RLS/grant ekler; eski sipariş satırlarını veya miktarlarını değiştirmez. `lock_timeout=3s`, `statement_timeout=15s`, transaction içinde uygulanır. Yerel test ve demo DB'lerinde iki kez uygulandı. Kiracı izolasyonu hem kaynak kapsam testiyle hem DB işlemleriyle doğrulandı.

Canlı sıra: önce önceki beş özellik migration’ı (`docs/feature-completion-migrations.md`), sonra bu partial-procurement migration’ı, sonra yeni uygulama. Katalog eşitlemesiyle SKT verisi kasalara iletilmeli; eski çevrimdışı kodun anında güncellenmiş olduğu varsayılmamalı. İlk kısmi teslimden sonra eski uygulamaya yazımlı dönüş güvenli sayılmaz; eski kod yeni durum/teslim geçmişini yönetmez. Yeni tabloyu silen rollback yoktur; ileri düzeltme veya ayrıca doğrulanmış izole yedekten kurtarma kullanılır. Canlı yayın önerisi bu ön kontrollerle **staged** olarak kalır.


## Tablet doğrulaması ve yerleşim düzeltmesi

Başlangıç `6410027`; yalnız görünüm ve gezinme değişti, stok/tahsilat/PIN verisi değiştirilmedi. 768 px portrede 232 px sabit yan menü formu daraltıyordu. Yönetim sabit menüsü ve açılır menünün CSS/JavaScript eşikleri birlikte 1024 px (`lg`, `64rem`) yapıldı. 768 px tablet içerik için bütün genişliği kullanır; 1024 px ve üzeri sabit menüye geçer. Ana içeriğin mevcut padding davranışı korunur.

Teslim formunda 640–1023 px aralığında miktar/parti iki sütun, SKT tam satır; 1024 px üzerinde üç sütun vardır. Sipariş kartında alınan ve kalan miktar artık form açılmadan görünür. İptal edilen kalan miktar “İptal edilen” olarak etiketlenir; sipariş notu hesaplanan güncel özetten ayrı etiketlidir.

- 768 px: tedarik kısmi teslim formu, parti/SKT formu, hakediş formu, devam kartları, rezervasyon ayarları, müşteri rezervasyonu ve personel PIN formunun geliştirme önizlemesi kontrol edildi; her birinde belge/içerik genişliği 768/768.
- Açılır menü açıldı; Escape kapattı ve odağı “Menüyü aç” düğmesine geri verdi.
- Menü açıkken 768 → 1024 geçişi denendi: menü kapandı, body kaydırma kilidi temizlendi, sabit yan menü 232 px göründü; belge/içerik 1024/1024.
- Tedarik ekranında 390/390 ve normal 1470/1470 ölçümü de geçti. Geçici viewport ayarı sıfırlandı; deneme sayfası normal boyutta bırakıldı.
- Güncel demo kartında alınan **6 kg**, kalan **4 kg** ve tarihsel teslim alınmış siparişte alınan **5 kg**, kalan **0 kg** görüldü. Bu turda yeni teslim kaydı yapılmadı.
- Lint ve TypeScript: `npm run qa:static`, `/private/tmp/cabukpos-tablet-static.log`, çıkış 0.
- Üretim derlemesi: bağımsız kaynak kopyasında `npm run build`, `/private/tmp/cabukpos-tablet-build.log`, çıkış 0.
- Önceki 560/560 işlem testi bu turda tekrar çalıştırılmadı; iş kuralları, veri modeli ve yazma yolları değişmedi. Sayıların kaynağı mevcut testli `remainingProcurement` hesabıdır; gerçek tarayıcıda kayıtlı verilerle doğrulandı.
- Görsel kanıt: `/private/tmp/cabukpos-tablet-delivery.png`.
