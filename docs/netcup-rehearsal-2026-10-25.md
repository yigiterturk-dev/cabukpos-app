# Netcup izole sürüm provası — 25 Ekim 2026

Sonuç: **PASS**, tamamlanma `2026-10-25T15:08:55Z` (İstanbul 18:08:55). Bu çalışma canlı yayın değildir. Canlı veritabanına migration veya iş kaydı yazılmadı; gerçek sağlayıcı çağrısı yapılmadı.

## Sürüm ve kanıt

- Uygulama başlangıcı `098e337`; prova araçlarıyla kaynak paketi `ec6cc11`.
- Linux üretim derlemesi `d8ebfae` kaynak paketinde, kilit dosyasıyla `npm ci` ve `npm run build` çıkış 0. `ec6cc11` yalnız prova araçlarını değiştirdi; uygulama ve bağımlılık girdilerinin aynı olduğu `git diff --exit-code d8ebfae ec6cc11 -- . ':!ops/netcup' ':!tests/test_release_bundle.py'` ile doğrulandı. Aynı Linux `node_modules` ve `.next` çıktıları kullanıldı.
- Next.js build ID: `Ii_Fn0GBhMbptZxdSAKo_`.
- Node 22 imajı: `node@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9`.
- Taze şifreli yedek: `cabukpos-20261025T145814Z-b0d9c4.dump.enc`; yedek işi `2026-10-25T14:58:17Z` başarılı. HMAC kontrolünden sonra geçici PostgreSQL 18'e geri yüklendi.
- Tam SQL + RLS SHA-256: `f25bf6060d3d3263e38542c30f2f2bc6f1a2c6c508d7e7f655cb3ca57e5fee9a`.
- VPS kanıtları: `/var/lib/cabukpos-ops/release-status.json`, `release-evidence.json`; paket ve güvenli aşama günlüğü `/opt/cabukpos-ops/releases/ec6cc11/`.

## Doğrulanan kapılar

1. `ops/netcup/release-manifest.json` içindeki **10 migration** sıralı tek işlemde, içteki bağımsız BEGIN/COMMIT sınırları kaldırılarak uygulandı. Her migration ve güncel `db/rls.sql` paket hash'ine dahildir. Aynı paket ikinci kez uygulandı ve geçti.
2. Migration'ların sonuna zorunlu hata eklendi; COMMIT gerçekleşmedi. Şema parmak izi (sütunlar, varsayılanlar, indeksler, politikalar, RLS bayrakları, enum etiketleri ve fonksiyonlar) ve mali/kayıt toplamları ilk durumla eşleşti.
3. Her başarılı geçişte önceden var olan **tüm public tabloların satır sayıları**, satış toplamları ve stok hareket miktar toplamı korundu.
4. **63 tabloda FORCE RLS** etkin. Uygulama rolü superuser/BYPASSRLS değil; işletme bağlamı yokken ve ilgisiz işletmede sıfır kayıt, kendi işletmesinde beklenen kayıt sayıları görüldü. `brand_products` kapsamı `brands` üzerinden doğrulandı.
5. Üretim Next.js sunucusu uygulama DB rolüyle açıldı; `/api/ready` ve `scripts/runtime-audit.mjs` geçti.
6. Geçici iki işletme üzerinde `ops/netcup/release_smoke.mjs` geçti:
   - 10 kg siparişte 4 + 6 kg kısmi mal kabulü, eşzamanlı tekrarın tek fiş üretmesi ve fazla teslimin reddi;
   - sevkiyatta teslimden önce hedef stoğun değişmemesi, eşzamanlı teslim tekrarının tek stok kredisi;
   - son uygun masada rezervasyon tekrarı ve kapasite engeli, personel planı ve platform hakediş kaydı;
   - PIN giriş/çıkış HTTP akışı, eşleşmesiz cihaz/yanlış Origin/yanlış PIN reddi ve eski giriş tekrarının kapalı kalması;
   - geçmiş SKT için HTTP satış engeli, katalog SKT verisi ve imha sonrası kontrol;
   - PIN onayı, yetki kaldırıldıktan sonra önceden verilmiş onay token'ının işlemi yetkilendirememesi;
   - platform sipariş kimliğinin platform bazında tekilliği ve ikinci işletmeden yeni tablolara erişim/yazım reddi.
7. Geçici işletmeler ve hız sınırı kayıtları silindi. İş akışları öncesi/sonrası **bütün public tabloların kayıt sayıları** ve mali toplamlar eşleşti.
8. PostgreSQL `--network=none`, uygulama aynı kapalı ağ alanında ve host portu olmadan çalıştı. Prova sonrasında oluşturulan uygulama, veritabanı ve derleme konteynerleri kalmadığı doğrulandı. Global görevler ve mevcut servisler değiştirilmedi.

## Araç doğrulaması ve sınırlar

Python paket/işlem sınırı testleri 3/3; prova betiği ESLint çıkış 0. İş kuralı kodu değişmediği için önceki 560 test tekrar çalıştırılmadı; burada gerçek yedek şeması üzerinde ek servis/API akışları çalıştırıldı. İlk denemede doğrudan `tenant_id` varsayan prova sorgusu marka ürünleri için düzeltildi; uygulama RLS politikası değiştirilmedi.

Yayın önerisi **staged**: bu sonuç teknik geçiş provasıdır. Gerçek ödeme, ÖKC/e-Arşiv, Windows kasa/yazıcı ve saha doğrulaması kapsam dışıdır. Canlı trafik altında kilit süresi ölçülmedi. Paket 5 saniyelik dış kilit sınırı koyar; bazı migration'lar 3 saniyeye daraltır. Uzun işlemler ve aktif trafik canlı ön kontrolde ayrıca incelenmelidir.

Test edilen rollback, migration işleminin **commit öncesi başarısızlıkla geri alınmasıdır**. Yeni özelliklerle iş kaydı üretildikten sonra eski uygulamaya yazımlı dönüşün güvenli olduğu iddia edilmez. Böyle bir durumda ileri düzeltme veya ayrıca doğrulanmış izole yedekten kurtarma gerekir.

Canlı uygulama yapılacaksa bu paketin `ops/netcup/apply_release.py` sürümü kullanılmalı; global eski araç yalnız önceki paketi tanır. Canlı yazma için `--apply` gerekir ve bu provada kullanılmadı. Taze yedek/prova kanıtı kapısı bir saattir; süre aşılırsa önce yedek ve prova yenilenir. Prova paketleri korumalı dizinde tutulur; gizli ortam dosyaları kaynak paketine alınmadı.
