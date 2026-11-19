# CabukPOS — Yemeksepeti ve Migros entegrasyon açığı raporu

Tarih: 14 Kasım 2026
Kapsam: `lib/platform/yemeksepeti.ts`, `lib/platform/migros.ts`, `lib/platform/types.ts`,
`lib/platform/ingest.ts`, `lib/platform/notify.ts`, `lib/platform/outbound.ts`,
`lib/core/platform.ts`
Amaç: POS/entegrasyon partner başvurusu öncesi teknik hazırlık farkını görünür kılmak.

## Sonuç

Mevcut iki adaptör **gerçek sağlayıcı sözleşmesi değil**, tüm platformlar için ortak
varsayılmış bir "sandbox" sözleşmesi kullanıyor: `{orders:[...]}` gövdesi,
`x-<platform>-signature` HMAC başlığı, `/orders/{id}/accept|reject|status` uçları,
`PUT /stores/{id}/catalog`. Bu, platformların yayımladığı şartnameyle uyuşmuyor.
Kod "çalışıyor" görünse de gerçek sandbox'a bağlanınca sipariş almaz.

Karar: Adaptörler "sandbox sürücüsü" olarak kalabilir; canlı için ayrı bir
**partner modu** ve ortak bir **webhook olay modeli** gerekir.

## Yemeksepeti — mevcut kod vs resmî Partner API v2

| Alan | Mevcut kod | Resmî şartname | Yapılacak |
|---|---|---|---|
| Kimlik | `Authorization: Bearer <sabit anahtar>` (`yemeksepeti.ts:57`) | OAuth2 client credentials; `POST /v2/oauth/token`; JWT, `expires_in` 7200 sn; 50 istek/dk | Token istemcisi + bağlantı başına önbellek/yenileme |
| Adres | BYOK `base` | Üretim `https://yemeksepeti.partner.deliveryhero.io`, sandbox `https://sandbox.partner.deliveryhero.io` | Mod bazlı sabit host; keyfi base yalnız sandbox sürücüsünde |
| Webhook gövdesi | `{orders:[...]}` (`yemeksepeti.ts:20`) | Tek sipariş nesnesi: `order_id`, `external_order_id`, `order_code`, `client.chain_id/store_id`, `customer.*`, `items[].pricing`, `payment.*`, `status`, `transport_type`, `order_type`, `cancellation` | Gerçek gövde şeması + alan eşlemesi |
| Webhook güvenliği | `x-ys-signature` + timestamp HMAC (`:49`) | Vendor Portal'da tanımlı statik token; 4xx/5xx'te 5 kez tekrar | Statik token doğrulama; hızlı 2xx; tekrar politikası |
| Sipariş durumu | `/accept`, `/reject`, `/status` (`:54-72`) | `PUT /v2/chains/{chain_id}/orders/{order_id}`; `status`: `READY_FOR_PICKUP`, `DISPATCHED`, `CANCELLED`, `UPDATE_CART` | Tek "update order" çağrısı; `chain_id` kimlikte |
| Teslimat sahibi | Filtre yok | `transport_type`: `VENDOR_DELIVERY` / `LOGISTICS_DELIVERY`; `order_type`: `DELIVERY` / `PICKUP` | Platform kuryeli ve gel-al siparişleri içe alma |
| Ürün durumu | Sipariş düzeyi | Güncellemede ürün bazlı `items[].status` | Ürün bazlı durum eşlemesi |
| Katalog | `PUT /stores/{id}/catalog`, `{items}`, senkron `{ok,failed}` (`:77-81`) | `PUT /v2/chains/{chain}/vendors/{vendor}/catalog`, `{products:[{sku,price,active,quantity}]}`, `202` + job webhook | Katalog alanları + asenkron job sonucu |
| Kapıda ödeme | `payment_type: cash/card/ticket` (`:16`) | `payment.type` (`PAID`), `collect_at_pickup`, `order_total`, `container_charge` | `IncomingOrder`'a tahsilat tutarı; sessiz sıfırlama yok |
| Müşteri verisi | Açık varsayım | Doküman örneklerinde telefon/adres maskeli, koordinat `0` olabilir | Sandbox'ta `VENDOR_DELIVERY` için açık mı doğrula; değilse reddet/incelemeye al |
| Teslim süresi | `deadline: null` (`:35`) | `promised_for`, `accepted_for` | `deadline` eşlemesi |
| Mağaza eşlemesi | `conn.storeId` iç kimlik | `client.chain_id` + `client.store_id` | Dış mağaza/zincir eşleme tablosu |
| Hazırlık süresi | `accept(..., prepMin)` | Update order'da hazırlık süresi alanı yok | `prepMin` yerine "mutfak hazır → READY_FOR_PICKUP" akışı |
| Tekrar | Anında hata | 5 kez webhook tekrarı | Outbox/retry; aynı olayı ikinci kez işlememe zaten var |

## Migros Yemek — mevcut kod vs saha modeli

Resmî API dokümanı kamuya açık değil. Restoran panelindeki akış ve entegratör
firmaların yayımladığı adımlar şunu gösteriyor:

1. Restoran: **Restoran Bilgileri → POS Entegrasyonları → POS firması seç → oluştur**.
2. Panel **Zincir ID + Restoran ID + API Key** üretir.
3. POS firması bu üç bilgiyle Migros'a bağlanır.

| Alan | Mevcut kod | Saha modeli | Yapılacak |
|---|---|---|---|
| Kimlik | `base` + `key` (`credentials.ts`) | `chainId`, `restaurantId`, `apiKey` | Kimlik şemasını sağlayıcıya göre ayır |
| Webhook | `x-migros-signature` HMAC (`migros.ts:48`) | Sözleşmeye bağlı; varsayım yapılamaz | Partner sözleşmesindeki imza/token yöntemini uygula |
| Uçlar | `/orders/{id}/accept|reject|status`, `/stores/{id}/catalog` | Sözleşmeyle gelir; kamuya açık değil | Doküman gelince birebir eşle |
| Teslimat | Filtre yok | İki model: **Migros kuryesi** / **restoran kuryesi** | Sipariş bazında teslimat sahibini oku; Migros kuryeliyi içe alma |
| Durum | `picked/delivered/cancelled` | Bilinmiyor | Sözleşme sonrası eşle |
| Katalog | `{items}` | Bilinmiyor | Sözleşme sonrası eşle |

**Migros için sonuç:** Kod hazır sayılamaz. Panelden alınan üç kimlik ve partner
sözleşmesi olmadan yalnız "sandbox iskeleti" vardır.

## Ortak modelde eksikler

`IncomingOrder` (`lib/core/platform.ts:8`) şu alanları taşımıyor:

- `externalCode` — kuryenin restoranda söylediği `order_code`
- `collectAmount` — kapıda tahsil edilecek tutar (kuruş)
- `deliveryOwner` — `platform` / `vendor`
- `chainId` / `vendorId` — dış mağaza eşlemesi
- `promisedAt` — platformun vaat ettiği teslim zamanı
- `eventType` — `create` / `update` / `cancel`

Ayrıca:

- `parseWebhook` yalnız `IncomingOrder[]` döndürüyor; aynı siparişin
  `READY_FOR_PICKUP`, `DISPATCHED`, `CANCELLED` olayları modellenemiyor.
- `pushCatalog` senkron `{ok,failed}` bekliyor; Yemeksepeti `202 + job` döndürüyor.
- `credentials.ts` yalnız `{base,key}` biliyor; OAuth ve üçlü Migros kimliği yok.
- Dış çağrılar için zamanlanmış kuyruk yok; hata `review` bayrağına yazılıyor.

## Öncelik

**P0 — başvurudan önce**
1. Kimlik şemasını ayır: `sandbox`, `partner-oauth`, `migros-pos`.
2. Webhook olay modeli: `create/update/cancel` + teslimat sahibi filtresi.
3. `IncomingOrder`'a `externalCode`, `collectAmount`, `deliveryOwner`, `promisedAt` ekle.
4. Yemeksepeti partner modu: OAuth, update order, katalog job.
5. Dış mağaza/zincir eşleme tablosu.

**P1 — pilot**
6. Outbox/retry ve idempotent dış çağrı.
7. Migros sözleşmesi gelince adaptörü birebir yaz.
8. Sandbox uçtan uca kanıt: sipariş → kabul → mutfak → kurye → durum → katalog.

**P2 — sertifikasyon**
9. Yük/limit testi, hata enjeksiyonu, KVKK veri akışı, destek SLA'sı.

## 14 Kasım — uygulananlar

- `lib/platform/yemeksepeti-partner.ts`: resmî Partner API modu.
  - OAuth2 client credentials + token önbelleği (`expires_in`).
  - Statik webhook jetonu (`authorization` / `x-webhook-token`).
  - `VENDOR_DELIVERY` + `RECEIVED` filtresi; `LOGISTICS_DELIVERY` ve `PICKUP` yok sayılır.
  - `PUT /v2/chains/{chain}/orders/{order}`: `READY_FOR_PICKUP`, `DISPATCHED`, `CANCELLED`.
  - `PUT /v2/chains/{chain}/vendors/{vendor}/catalog` + `202` job kabulü.
  - `order_code`, `collect_at_pickup`, `promised_for` eşlemesi.
- `parseEvent` + `applyPlatformEvents`: gelen `CANCELLED` webhook'u açık adisyonu kapatır;
  paket alınmışsa sessizce silmez, inceleme işareti bırakır.
- `PlatformOrderStatus` → `ready` eklendi; mutfak "hazır" olayı `READY_FOR_PICKUP` olarak
  platforma bildirilir. `accept` çağrısı Partner API'de ağ isteği yapmaz.
- `ConnectionCredentials`: `sandbox` / `partner` / `migros` ayrımı; AES-256-GCM şifreli.
- Yönetim → Pazaryerleri: Yemeksepeti Partner ve Migros kimlik formları.
- `IncomingOrder`: `externalCode`, `collectAmount`, `deliveryOwner`, `promisedAt`.
- Migros modu kimlik kaydını kabul eder, ancak şartname gelmeden canlı istek atmaz.

Kalanlar: Migros sözleşmesi/şartnamesi, READY güncellemesinde ürün bazlı `items`,
dış çağrı outbox/retry, gerçek sandbox uçtan uca kanıtı.

Ek: katalog job sonucu webhook'u `platform.catalog.job` audit kaydına yazılıyor.
`scripts/ys-partner-smoke.mjs` (paket: `npm run ys:smoke`) gerçek webhook ucuna
sipariş, iptal veya katalog job olayı gönderip yanıtı doğrular.

## Kaynaklar

- Yemeksepeti Partner API v2.0.2: `developer.yemeksepeti.com/api-specifications`
- Sandbox: `developer.yemeksepeti.com/en/documentation/sandbox-sandbox-testing`
- Partner Picking: `developer.yemeksepeti.com/en/documentation/pos-partner-picking-how-to-integrate`
- Migros Yemek POS entegrasyonu (saha adımları): Restomenum, PaketServiste, AKINSOFT yardım dokümanları
- Migros teslimat modelleri: Restegre, RestoKurye (2026)

Not: Bu rapor bir uyumluluk iddiası değildir; canlı sözleşme, sandbox kimliği ve
uçtan uca test olmadan hiçbir satır "entegre" sayılmaz.

## YNR Kurye köprüsü (14 Kasım)

- **Ayar:** Yönetim → Pazaryerleri → **YNR Kurye** kartı. `platform_connections` içinde
  `platform="ynr"` satırı; base + token AES-256-GCM şifreli. Alternatif: `YNR_BASE_URL`,
  `YNR_TOKEN`.
- **Gönderim:** Platform/telefon siparişi CabukPOS'a düşünce `dispatchReady=false` ile
  `POST /api/integrations/orders`; mutfak "hazır" olunca aynı dış kimlikle `true`.
- **İptal:** `POST /api/integrations/orders/cancel`; paket alınmışsa `postPickupFlag=true`.
- **Durum:** `GET /api/cron/ynr` (CRON_SECRET) → `GET /api/integrations/orders/status`
  polling; `picked`/`delivered`/`cancelled` CabukPOS adisyonuna ve platforma yansır.
- **Koordinat:** Teslim koordinatı yoksa (0 veya maskeli) YNR'ye gönderilmez;
  `ynr.skip` audit kaydı düşer.
- **Sınır:** YNR token'ı bu şubeye bağlı restoran hesabına ait olmalı. Status polling
  dakikada bir çalışacak şekilde zamanlanmalı.
