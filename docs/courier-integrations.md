# Dış kurye (YNR) entegrasyonu

Yalnız telefonla gelen paket adisyonları dış kurye sağlayıcısına (YNR) sevk edilir.
Masa ve platform siparişleri dışarıda kalır: platform siparişinin kuryesi platformdan
gelir. Yapılandırma yoksa hiçbir ağ isteği yapılmaz; mevcut kuryesiz akış bozulmaz.

## Akış

- Mutfakta son bilet “hazır” olunca (`kitchen` olayı) sipariş kurye havuzuna verilir.
  Biletlerin tamamı hazır/teslim değilse `dispatchReady=false` ile “mağaza hazırlıyor”
  olarak açılır; teslim noktası yine zorunludur.
- Adisyon iptalinde kurye tarafı kapatılır. Kurye paketi almışsa (`outAt` dolu)
  sipariş sessizce iptal edilmez; `postPickupFlag=true` ile incelemeye bırakılır.
- Saatlik `/api/cron/courier` hazır olup gönderilememiş adisyonları son 24 saat
  içinde yeniden dener. Aynı adisyon için 3 başarısız denemeden sonra durur;
  adres çözülemeyen kayıt her saat tekrar denenmez. HTTP 400 (masa/platform/eksik
  alan) tekrar denenmez.
- 5 dakikada bir `/api/cron/courier-status` açık işlerin durumunu (kurye adı, ETA,
  kapıda tahsilat) tazeler. Sonuç `courier_jobs` tablosuna yazılır.
- Kasa paket panosu `/api/kasa/courier` ile son 24 saatin işlerini 30 saniyede bir
  okur ve sipariş kartında rozet olarak gösterir. Durum tazeleme adisyonun kendi
  teslim durumunu değiştirmez; yolda/teslim onayı kasadaki mevcut akıştadır.

## Yapılandırma

Tüm anahtarlar sunucu ortamındadır; yönetim ekranına yazılmaz.

| Değişken | Açıklama |
| --- | --- |
| `YNR_API_BASE` | Sağlayıcı taban adresi (sonda `/` kabul edilir). |
| `YNR_TOKEN` | Bearer jetonu. Boşsa entegrasyon kapalıdır. |
| `YNR_PROVIDER` | Gönderen kimliği; varsayılan `cabukpos`. |
| `YNR_ACCOUNTS_JSON` | `{"<storeId>": "<YNR hesap kimliği>"}` eşlemesi. |
| `YNR_PICKUPS_JSON` | `{"<storeId>": {"address": "...", "lat": 41.0, "lng": 29.0}}` alım noktası. |
| `YNR_DRY_RUN` | `1` ise ağa çıkılmaz; sahte başarı ve `dry_run` durumu döner. |
| `GEOCODE_USER_AGENT` | Nominatim isteklerinde kullanılan tanıtıcı (varsayılan `cabukpos/1.0`). |

Şube eşlemesi eksikse sevk reddedilir; istemci tarafından alım koordinatı
değiştirilemez. Alım noktası sunucudaki `YNR_PICKUPS_JSON` değeridir.

## Adres çözümleme

Teslim noktası zorunludur. `lib/geo/geocode.ts` Nominatim’e sunucu tarafından
sorar: 6 saniye zaman aşımı, saniyede en fazla bir istek, Türkiye sınırı dışındaki
cevaplar geçersiz. Başarısız çözüm 60 saniye önbelleklenir. Adres çözülemezse
sevk 422 ile durur ve audit’e yazılır; sahte koordinat üretilmez.

## Tekilleştirme ve hata davranışı

YNR aynı `(provider, accountId, externalOrderId)` üçlüsü için ikinci kayıt açmaz;
`externalOrderId` adisyon kimliğidir. Bu nedenle olay tekrarı ve saatlik tur
güvenlidir. Ağ isteği DB işleminin dışında yapılır; sonuç `audit_log`’a
`courier.dispatch` / `courier.cancel` olarak yazılır. Sağlayıcıya ulaşılamaması
veya beklenmeyen cevap kullanıcı akışını kilitlemez; hata loglanır ve tur bir
sonraki çalışmada yeniden dener.

## Veritabanı

`db/releases/2026-10-31-courier-jobs.sql` yalnız yeni ve boş `courier_jobs`
tablosunu ekler. Mevcut tablolara/verilere dokunmaz; `(tenant_id, tab_id)`
birincil anahtarı, şube/güncelleme indeksi, FORCE RLS ve kiracı politikası
vardır. Uygulama rolüne `select/insert/update/delete` verilir. Geri dönüşte
tabloyu silmek gerekmez; eski sürüm bu tabloyu okumaz.

## Cron ve sıra

Uçlar `CRON_SECRET` olmadan 401 döner. Canlıda zamanlama netcup’taki
`/opt/cron-tetik/tetik.py` üzerinden yapılır. Uygulama canlıya alındıktan sonra
`JOBS` listesine şu satırlar eklenir:

```python
("cabukpos", "0 * * * *", "/api/cron/courier"),
("cabukpos", "*/5 * * * *", "/api/cron/courier-status"),
("cabukpos", "*/2 * * * *", "/api/cron/trendyol-yemek"),
```

Sıra: yedek/restore kanıtı → migration → yeni uygulama → uçların tetik listesine
eklenmesi. Tetikler uygulamadan önce eklenirse 404 döner. Ayrıntı ve güvenli
release adımları için [OPERATIONS.md](OPERATIONS.md).

## Doğrulama ve sınırlar

`tests/courier-ynr.test.ts` gövde eşlemesini, kapıda ödeme tutarını, masa/platform
reddini, boş/geçersiz alanları, tekilleştirme anahtarını, dry-run’ı ve HTTP hata
metnini kapsar. Gerçek YNR sandbox hesabıyla uçtan uca sevk/iptal/durum denemesi
henüz yapılmadı; saha doğrulaması ayrıca gerekir. `courier_jobs` satırları
otomatik silinmez; büyüme operasyonel olarak izlenmelidir.
