# Platform sipariş kimliğinin kapsamı

## Sorun ve değişiklik

Eski kimlik `(şube, dış sipariş numarası)` idi. İki platform aynı numarayı kullandığında ikinci sipariş tekrar sayılabiliyordu. Kiosk tekrar isteği de başka platformun adisyonunu döndürebiliyordu.

Yeni kimlik `(şube, platform, dış sipariş numarası)`. `lib/platform/ingest.ts` ve `lib/kiosk.ts` hem kilit hem tekrar sorgusunda bu kapsamı kullanır. Kilit anahtarı JSON dizisidir; alanların içindeki ayraçlar anahtarları karıştırmaz. Yeni `tab_events_platform_order_v2_uq` indeksi aynı kuralı veritabanında korur. Platform alanı bulunmayan eski kayıtlar boş platform kapsamına alınır; aynı kapsamdaki tekrar koruması sürer.

SQL: `db/releases/2026-10-25-platform-order-scope.sql`. İşlem içinde önce yeni indeks kurulur, ardından eski indeks kaldırılır. Satır silme, güncelleme ve backfill yok. Hata durumunda işlem bütünüyle geri alınır. Normal indeks kurulumu yazan işlemleri bekletebilir; bu SQL büyük, yoğun tabloya kesintisiz geçiş için tasarlanmamıştır.

## İnceleme sonucu

**Yerelde belirtilen koşullar için hazır. Canlı için aşamalı geçiş gerekiyor.**

25 Ekim 2026 yerel kanıtı: PostgreSQL 16.13. Demo `tab_events`: 363 satır, indeksler dahil 311.296 bayt; test tablosu boş, fiziksel boyut 131.072 bayt. İki uygulama toplamı demo için 20 ms, test için 13 ms sürdü. Her iki veritabanında migration iki kez çalıştırıldı; tüm olay satırlarının sıralı içerik özeti ve sayısı aynı kaldı. Eski indeksin kaldırıldığı, yenisinin bulunduğu doğrulandı. Kullanıcı PIN'i, eşleme ve örnek sipariş durumları değiştirilmedi.

Canlı tablonun boyutu, trafik, disk alanı, replikasyon gecikmesi ve bakım penceresi ölçülmedi. Canlıya uygulama yapılmadı. Migration tarayıcısı kilit/indeks değişikliklerini aday risk olarak işaretler; bu belge ilgili değişikliğin bağlamlı incelemesidir.

## Canlı geçiş sırası

1. Geri yüklemesi doğrulanmış yedek ve webhook tekrar/buffer mekanizması bulunmalı. Gelen siparişleri kaybetmeden alımı ve ilgili yazıcıları kısa bakım penceresine almak gerekir. Sağlayıcının tekrar garantisi bilinmiyorsa geçiş bekletilir.
2. Ön kontrolleri yapın; eski kurala göre tutarlı verinin yeni, daha geniş kapsama uyması beklenir. Beklenmeyen yinelenme veya geçersiz indeks varsa incelemeden devam etmeyin.
3. Alım duruyorken tüm uygulama örneklerini yeni sorgu/kilit koduna geçirin ve SQL'i veritabanı sahibiyle çalıştırın. Eski ve yeni alım kodunun eşzamanlı çalışmasına izin vermeyin. Eski sorgu yeni indeksten sonra da farklı platformu tekrar sayabilir.
4. İndeksi doğrulayın. İki test platformunda aynı numara → iki adisyon; aynı platformdan tekrar → tek adisyon; kiosk tekrarında aynı kiosk adisyonu kontrollerini yapın.
5. Sipariş alımını açın; buffer'ı tekrar işleyin. Benzersizlik hatalarını, gelen/oluşturulan/tekrar sayılarını, bekleyen bildirimleri ve kilitleri izleyin. Kilit beklemesi 3 saniye veya SQL 30 saniyeyi aşarsa migration kendini iptal eder; sebebi çözmeden süre sınırını artırmayın.

Yoğun tabloda alternatif: yeni indeksi `CREATE UNIQUE INDEX CONCURRENTLY` ile ayrı adımda kurup geçerliliğini doğrulamak, tüm alım kodu değiştikten sonra eski indeksi bakım adımında kaldırmak. Bu yol ayrıca prova ve geçiş planı gerektirir; burada uygulanmadı.

```sql
select current_setting('server_version');
select count(*), pg_total_relation_size('tab_events') from tab_events;
select store_id, coalesce(payload->'source'->>'platform', '') as platform,
       payload->'source'->>'externalId' as external_id, count(*)
from tab_events
where type = 'order' and payload->'source'->>'externalId' is not null
group by 1, 2, 3 having count(*) > 1;
select indexname, indexdef from pg_indexes
where tablename = 'tab_events' and indexname like 'tab_events_platform_order%';
select c.relname, i.indisvalid, i.indisready, i.indisunique
from pg_index i join pg_class c on c.oid = i.indexrelid
where c.relname = 'tab_events_platform_order_v2_uq';
```

## Geri dönüş sınırı

Migration başarısız olursa işlem eski indeksi korur. Başarılı geçişten sonra farklı platformlarda aynı numaralar yazılmış olabilir; eski indeksi yeniden kurmak artık başarısız olabilir. Sipariş silerek geri dönüş yapılmaz. Yeni indeks ve kimlik kapsamını koruyan ileri düzeltme tercih edilir. Eski uygulamaya veya yedeğe dönüşün güvenli olduğu iddia edilmiyor; alımın durdurulması, yeni siparişlerin korunması ve mutabakat için ayrı prova gerekir.

## Test kapsamı

`tests/platform-identity-db.test.ts`: aynı şube ve numarada iki platformun ayrı adisyon/bilet/bildirim oluşturması, sekiz eşzamanlı isteğin iki sipariş oluşturması, doğrudan yinelenen yazının PostgreSQL tarafından reddi ve kiosk tekrarının doğru adisyona bağlanması. Sağlayıcı kabul çağrısı test içinde değiştirilir; gerçek platforma istek atılmaz. Önceki onay tekrarı ve kiosk testleri de çalıştırıldı.

Sonuç: 517/517 test geçti. ESLint, TypeScript ve `git diff --check` temiz.
