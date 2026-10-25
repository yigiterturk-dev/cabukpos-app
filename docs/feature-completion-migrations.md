# Yedi özellik — veri geçişi ve yayın sırası

Yerel doğrulama: PostgreSQL 16.13; `cabukpos_test` ve yalnız `Yerel Demo` içeren `cabukpos_preview_1792855963497`. Canlı büyüklük, trafik, replikasyon ve yedek geri yükleme süresi bu çalışmada ölçülmedi. Canlı geçiş önerisi: **staged**; aşağıdaki ön kontrollerle bakım penceresinde uygulanmalı. Yerel sonuç canlı için kilit süresi garantisi değildir.

## Sıra

1. Geri yüklenebilir veritabanı yedeği ve önceki uygulama paketini saklayın; ayrı ortamda yedek geri yükleme denemesi yapın. Sorumlu yayın operatörü Netcup kurulumunda belirlenir.
2. Webhook/cron/işçi ve eski web uygulamasının stok yazmasını bakım penceresinde durdurun. Cihazlardaki bekleyen satışları silmeyin; yeni sunucu başladıktan sonra eşitlenirler. Eski ve yeni stok yazıcılarını aynı anda çalıştırmayın: eski kod parti dağıtımını güncellemez.
3. Owner/migration rolüyle sırayla `db/releases/2026-10-25-reservation-capacity.sql`, `2026-10-25-shipment-lifecycle.sql`, `2026-10-25-attendance.sql`, `2026-10-25-inventory-settlements.sql`, `2026-10-25-staff-permissions.sql` uygulayın. Beşi de yerel demo ve test DB'sinde iki kez çalıştırıldı. Sonradan eklenen nullable `purchase_id` ve `voided_at` alanları da tekrar uygulanarak doğrulandı.
4. Yeni uygulamayı başlatın. Özel tablo geçişlerinin RLS/grant hükümlerini koruyun; temiz kurulumlarda `db/rls.sql` yeni iş tablolarını kapsar. `reservation_settings` müşteri verisi taşımayan token→tenant kimlik tablosudur; bilinçli olarak RLS dışındadır. Yönetim sorguları açık tenant/store kapsamı kullanır; müşteri verileri `withTenant` içindedir.
5. Test işletmesinde kasa satışı/iadesi, stok sayımı, tedarik teslimi, sevkiyat teslimi, personel izni, giriş/çıkış ve rezervasyon kontrolü yapın. Sonra webhook/cron ve işçileri açın.

## Veri ve kilit etkisi

- Mevcut tablolarda yalnız metadata sütunları eklenir: masa kapasitesi 4, rezervasyon süresi 90 dk, personel özel izinleri nullable (null rol varsayılanlarını korur). PostgreSQL 16 sabit varsayılanları metadata ile ekleyebilir; yine de `ALTER TABLE` kısa süreli güçlü kilit ister.
- Eski transferler **teslim** varsayılır: önceki kod hedef stoğu zaten artırdı. Yeni kod **gonderildi** durumunu açıkça yazar. Geçiş, eski hareketleri tekrar yazmaz ve hedef stoğu yeniden artırmaz. `received_at` eski transferlerde boş kalır; gerçek teslim tarihi uydurulmaz.
- Yeni tablolar başlangıçta boştur. Eski stok otomatik partiye çevrilmez; gerçek parti/SKT bilinmeden tarih uydurulmaz. Yönetici mevcut etiketsiz stoğu açıkça etiketler.
- Inventory migration yeni tablolarda indeks/RLS kurar. Tabloları dolu bir ortamda tekrar çalıştırmadan önce indeks büyüklüğünü ve kilitleri ölçün. Her dosyada `lock_timeout=3s`, `statement_timeout=15s` vardır; süre aşımında ilerletmek için timeout'ları körlemesine artırmayın.
- Çalışma zamanında stok yazıcıları ürünleri aynı ID sırasıyla kilitler; sevkiyat/alış iptali önce kendi başlık satırını, sonra ürünleri kilitler. Parti dağıtımı, mutlak sayım veya geriye tarihli hareketin güncel toplam üzerindeki gerçek etkisini kullanır.

## Ön ve son kontroller

```sql
-- Önce yazım trafiği ve uzun işlemler; uzun işlem varken yayın durdurulur.
select pid, state, xact_start, wait_event_type, wait_event
from pg_stat_activity where datname=current_database() and xact_start is not null;
select relname, pg_size_pretty(pg_total_relation_size(oid))
from pg_class where relname in ('stock_movements','stock_transfers','reservations','tables','staff');

-- Önce/sonra aynı işletme kapsamındaki stok hareketi sayıları ve stockLevels çıktısı karşılaştırılır.
-- DDL geçişi tek başına stok hareketi veya mali belge yazmamalıdır.
select count(*) from stock_movements;
select count(*) from sales;
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname in ('stock_lots','stock_lot_events','procurement_orders','platform_settlements','attendance');
select tenant_id, staff_id, count(*) from attendance where ends_at is null
group by tenant_id,staff_id having count(*)>1;
select count(*) from stock_lots where remaining<0;
```

Bu sayımlar owner rolünde işletme toplamını gösterir; uygulama rolünde ilgili `app.tenant_id` bağlamını kurun. Geçiş boyunca satış veya hareket sayısı değişirse, kilit timeout'u oluşursa, sağlık kontrolü başarısızsa ya da kiracı kapsamı/RLS testi kırılırsa yayını açmayın. Yeni yazıcıları durdurup nedeni giderin.

## Geri dönüş

İlk özellik yazısı yapılmadan önce eski uygulama kullanılabilir; eklenen sütun/tablolara dokunmayın. Yeni sevkiyat/parti kaydı üretildikten sonra eski kodla yazıma dönmek güvenli sayılmaz: yeni sevkiyatta hedef stok henüz teslim edilmemiş olabilir, eski yazıcılar parti miktarını güncellemez. Bu durumda ileri düzeltme veya doğrulanmış yedekten **ayrı ortamda** kurtarma kullanın. Yeni tabloları silen otomatik rollback yoktur; veri kaybı gerektiren dönüş denenmedi.

Migration tarayıcısı çalıştırıldı (`review-database-migrations/scripts/scan_migrations.py`); genel DDL/RLS kilit uyarıları bu sınırlarda değerlendirildi. Tarayıcı sonucu tek başına canlı yayın onayı değildir. Yerel 550 genel test ve son stok/alış/sync grubunda 31 test geçti; kanıt `docs/feature-completion.md` içindedir.
