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

Tablet 768 px boyutuna geçişte tarayıcı kontrol bağlantısı koptu; tablet doğrulandı iddiası yoktur. Telefon ölçümü ve görseller kesintiden önce tamamlandı. Dış kurye/banka sağlayıcı bağlantıları, bu sürümün Netcup canlı geçişi ve mali cihaz/saha doğrulaması bu çalışmada yapılmadı.

## Migration ve yayın

PostgreSQL 16+; yerelde 16.13, küçük demo/test hacmi. Canlı hacim ve kilit süresi ölçülmedi. `db/releases/2026-10-25-partial-procurement.sql` yeni tablo/indeks/RLS/grant ekler; eski sipariş satırlarını veya miktarlarını değiştirmez. `lock_timeout=3s`, `statement_timeout=15s`, transaction içinde uygulanır. Yerel test ve demo DB'lerinde iki kez uygulandı. Kiracı izolasyonu hem kaynak kapsam testiyle hem DB işlemleriyle doğrulandı.

Canlı sıra: önce önceki beş özellik migration’ı (`docs/feature-completion-migrations.md`), sonra bu partial-procurement migration’ı, sonra yeni uygulama. Katalog eşitlemesiyle SKT verisi kasalara iletilmeli; eski çevrimdışı kodun anında güncellenmiş olduğu varsayılmamalı. İlk kısmi teslimden sonra eski uygulamaya yazımlı dönüş güvenli sayılmaz; eski kod yeni durum/teslim geçmişini yönetmez. Yeni tabloyu silen rollback yoktur; ileri düzeltme veya ayrıca doğrulanmış izole yedekten kurtarma kullanılır. Canlı yayın önerisi bu ön kontrollerle **staged** olarak kalır.
