# Büyüme Merkezi entegrasyon API'si

Bu sözleşme, ayrı satılan Büyüme Merkezi'nin tenant içindeki ÇabukPOS verisine
bağlanması içindir. API mesaj göndermez; yalnızca PII'siz özet okur ve harici
sağlayıcının ölçüm sonuçlarını geri alır.

Makine-okunur kaynak: `docs/growth-api.openapi.yaml`.

## Kimlik doğrulama

`Authorization: Bearer cpk_...` başlığı gerekir. Anahtarın kapsamı `growth`
olmalıdır; `stats` anahtarı growth uçlarında `403 forbidden_scope` alır. Anahtar
tenant'a bağlıdır, dakikada en fazla 60 istek kabul edilir. Yönetici oturumu da
aynı uçları kullanabilir.

Başarılı yanıtlar `Cache-Control: no-store` ile döner. Kimlik doğrulama, scope,
tenant ve rate-limit hataları sırasıyla `401`, `403`, `403` ve `429` olabilir.

## Feature pack

`GET /api/growth/feature-pack`

Tenant'a ait toplu sayıları döndürür. `tenantId`, ad, telefon, e-posta, müşteri
ID'si ve ham sipariş satırı içermez.

## Kampanya listesi

GET /api/growth/campaigns

Tenant içindeki son 50 kampanyayı PII'siz kimlik, segment, durum, hedef sayısı ve
ölçüm özetleriyle döndürür. Kampanya adı, mesaj metni, müşteri kimliği ve müşteri iletişim
bilgileri dönmez. Yanıt Cache-Control: no-store ile gelir; okuma tenant audit
log'una yazılır.

## Kampanya taslağı

`POST /api/growth/campaigns`

Harici Büyüme Merkezi'nin ÇabukPOS içinde PII taşımadan taslak oluşturmasını
sağlar. Gönderim yapmaz; hedef sayısını tenant içinde, yalnız iletişim izni olan
segmentten hesaplar.

```json
{ "name": "30 gün geri kazanım", "message": "Sizi özledik…", "segment": "dormant_30" }
```

Başarı `201` ile `{ "id": "<uuid>", "audienceCount": 12, "status": "taslak" }`
döner. Segmentler `dormant_30`, `active_30`, `all_consented` değerleridir.
Mesaj gönderimi ve sağlayıcı bağlantısı bu uçta yoktur.

## Kampanya durumu

`GET /api/growth/campaigns/:campaignId`

Tenant'a ait kampanyanın PII'siz durumu, hedef sayısı ve ölçüm oranlarını döndürür.
Mesaj metni, müşteri kimliği ve müşteri iletişim bilgileri dönmez.

```json
{
  "campaign": {
    "id": "7d8d8f8c-7f0f-4f0c-9d52-2f6eaa5a3b42",
    "segment": "dormant_30",
    "audienceCount": 120,
    "status": "taslak",
    "approvedAt": null,
    "createdAt": "2026-10-01T12:00:00.000Z"
  },
  "metrics": {
    "sent": 0,
    "delivered": 0,
    "converted": 0,
    "optOut": 0,
    "failed": 0,
    "revenue": 0,
    "deliveryRate": null,
    "conversionRate": null,
    "optOutRate": null
  }
}
```

`minCohortSize`, tenantlar arası benchmark için alt sınırdır; `scope: tenant_only`
nedeniyle işletme kendi küçük cohort verisini kendi içgörüsü için kullanabilir.
Tenantlar arası karşılaştırma yapılacaksa ayrıca opt-in, anonimleştirme ve hukuk
incelemesi gerekir. Tutarlar kuruş cinsindedir. İlk MVP yalnız `restoran`
tenant'larında açıktır;
başka dikeyler `403 unsupported_vertical` alır.

## İçgörüler

`GET /api/growth/insights`

Feature pack üzerinden baseline advisor veya yapılandırılmış Laya adapter çıktısı
döner. Laya yoksa `provider: "baseline", fallback: "not_configured"`; Laya
hatası/bozuk cevabı varsa `provider: "baseline", fallback: "remote_error"` olur.
Başarılı Laya cevabı en fazla 20 doğrulanmış içgörü içerir; ham Laya yanıtı ve
token loglanmaz.

## Kampanya ölçüm olayı

`POST /api/growth/campaigns/:campaignId/events`

İstek gövdesi:

```json
{ "type": "converted", "externalId": "provider-event-123", "recipientRef": "hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "amount": 12500 }
```

`type` değerleri: `sent`, `delivered`, `converted`, `opt_out`, `failed`.
`externalId` kampanya içinde idempotent anahtardır. İlk kayıt `201`, duplicate
kayıt `200 { "duplicate": true }` döner. `amount` yalnız `converted` için
ölçülür ve kuruştur; diğer event'lerde sıfırlanır.

`opt_out` için tenant içi müşteri UUID'si zorunludur:

```json
{ "type": "opt_out", "externalId": "provider-optout-123", "customerId": "<tenant-ici-uuid>" }
```

Bu olay müşterinin pazarlama iznini kapatır ve `provider_opt_out` kaynağıyla
kaydeder. Diğer event türlerinde `customerId` kabul edilmez. Kampanya tenant'a
ait değilse veya opt-out müşteri tenant'a ait değilse kayıt yapılmaz.

## İzinli hedef referansları

GET /api/growth/campaigns/:campaignId/audience

Growth anahtarı sahibi, kampanyanın izinli hedeflerini sayfalı olarak yalnız
hmac-sha256 recipientRef değerleri halinde okuyabilir. Telefon, ad, müşteri UUID'si
ve mesaj dönmez. recipientRef, aynı growth anahtarıyla sağlayıcının kendi
normalize telefonundan ürettiği referansla eşleştirilir. limit en fazla 500'dür;
nextCursor ile devam edilir. Normalizasyon: rakam olmayan karakterleri sil;
10 haneli ve 0 ile başlamayan numaraya 90 ekle; 0 ile başlayan 11 haneli
numarada ilk 0'ı 90 ile değiştir; 90 ile başlayan 12 haneli numarayı olduğu
gibi kullan. Diğer biçimler reddedilir.
Kampanya işletme sahibi tarafından onaylanmadıysa bu uç 403 döner; taslak
onayı olmadan hedef listesi veya gönderim akışı açılamaz.

## Sağlayıcı webhook'u

sent, delivered ve converted olaylarında recipientRef alanı zorunludur:
Growth anahtarıyla üretilmiş, PII içermeyen ve sabit hmac-sha256:<64 küçük hex>
biçiminde bir alıcı referansı.
Bu referans olmadan olay kabul edilmez; oranlar kişi bazlı yanlış pozitif
üretmemek için yalnız eşleşebilir referanslarda hesaplanır.

POST /api/growth/webhooks/events

Sağlayıcı bu uçta aynı growth anahtarını Bearer olarak ve
x-cabukpos-timestamp (Unix saniye) ile x-cabukpos-signature (hex HMAC-SHA256)
başlıklarını gönderir. İmza, timestamp + "." + ham gövde metninin growth
anahtarıyla imzalanmış halidir. Timestamp beş dakikadan eski/yeni ise istek
reddedilir. Gövde 64 KB ile sınırlıdır ve olay externalId ile idempotenttir.

## Veri ve operasyon sınırları

- ÇabukPOS gönderim sağlayıcısı değildir; SMS/WhatsApp/e-posta yollamaz.
- İşletme sahibi taslağı onaylamadan iletişim akışı açılmaz.
- Feature pack ve advisor okumaları tenant audit log'una yazılır.
- Event yazımları tenant audit log'una yazılır; token, ham yanıt ve müşteri telefonu yazılmaz.
- Tenantlar arası benchmark veya ham veri paylaşımı bu MVP'nin dışındadır.

## Sandbox smoke provası

Staging üzerinde imza, ilk kabul ve duplicate idempotency için şu komut
çalıştırılabilir:

    ALLOW_GROWTH_SMOKE=1 \
    GROWTH_SMOKE_BASE=https://staging.example.com \
    GROWTH_SMOKE_KEY=cpk_... \
    GROWTH_SMOKE_CAMPAIGN_ID=staging-kampanya-uuid \
    npm run growth:webhook:smoke

Komut production alias'ını reddeder, anahtarı ekrana yazmaz ve yalnızca
staging/localhost hedeflerine izin verir. Smoke testi iki ölçüm isteği yazdığı
için production veritabanında çalıştırılmamalıdır.
