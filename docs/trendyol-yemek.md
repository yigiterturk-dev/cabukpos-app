# Trendyol Yemek (Go) entegrasyonu

Trendyol Yemek siparişleri webhook ile değil, polling ile alınır: resmî dokümanda
POS’a webhook yoktur, tek kaynak `GET .../packages` ucudur. `lib/platform/trendyol-yemek.ts`
uçları ve başlıkları dokümandan birebir kullanır; uydurma uç yoktur.

## Akış

- 2 dakikada bir `/api/cron/trendyol-yemek` yalnız `Created` durumundaki paketleri
  çeker (sayfa başına 50). `TRENDYOL_YEMEK_ENABLED=1` değilse ağa çıkmaz.
- Aynı şube + `trendyol_yemek` + `externalId` ikinci kez yazılmaz; ingest advisory
  kilit ve benzersiz indeks kullanır. Paket, ortak platform siparişi/adisyon
  olarak düşer.
- Ürün eşlemesi `product_platform_codes` üzerinden yapılır; eşlenmeyen satır
  adisyonda işaretlenir ve toplamı bozmaz.
- Ödeme türü: `PAY_WITH_CARD` → kart, `PAY_WITH_MEAL_CARD` → yemek kartı,
  `PAY_WITH_ON_DELIVERY` → nakit, diğer/boş → online.
- Gel-al (`isStorePickup`) siparişler de adisyona düşer; kurye gerektirmez.
- Otomatik kabul (`TRENDYOL_YEMEK_AUTO_ACCEPT=1`) adisyonu açar ve mutfak
  biletlerini istasyonlara gönderir. Kasadan/yönetimden kabul ve red mevcut
  platform akışını kullanır.

## Yapılandırma

| Değişken | Açıklama |
| --- | --- |
| `TRENDYOL_YEMEK_ENABLED` | `1` değilse entegrasyon kapalı. |
| `TRENDYOL_YEMEK_API_BASE` | Varsayılan `https://api.tgoapis.com`. |
| `TRENDYOL_YEMEK_SUPPLIER_ID` | Tedarikçi kimliği (zorunlu). |
| `TRENDYOL_YEMEK_STORE_ID` | Mağaza kimliği (zorunlu). |
| `TRENDYOL_YEMEK_API_KEY` / `_SECRET` | HTTP Basic anahtarı (zorunlu). |
| `TRENDYOL_YEMEK_AGENT` / `_EXECUTOR` | `x-agentname` / `x-executor-user` başlıkları (zorunlu). |
| `TRENDYOL_YEMEK_TENANT_ID` / `_STORE_ID` | Siparişin yazılacağı ÇabukPOS kiracı/şube kimliği. |
| `TRENDYOL_YEMEK_AUTO_ACCEPT` | `1` ise gelen sipariş otomatik kabul edilir. |

Anahtar yoksa istemci Türkçe eksik alan hatası verir ve istek atmaz. Jetonlar
yalnız sunucu ortamındadır; repoya yazılmaz.

## Platform bağlantısı şartı

Kabul, red ve durum bildirimi mevcut `notifyPlatform` yolundan gider; bu yol
şube için etkin bir `platform_connections` kaydı arar. Yönetim → Platformlar
ekranından ilgili şubeye “Trendyol Yemek (Go)” bağlantısı eklenmelidir. Sipariş
çekme bu kayda bağlı değildir; eksikse sipariş düşer ama kabul/red platforma
bildirilemez ve olay `review` alanında hata olarak görünür.

Webhook adresi bu platformda kullanılmaz; bağlantı formunun ürettiği adres ve
imza anahtarı yalnız diğer platformlar içindir.

## Uçlar ve durumlar

- Çekme: `GET /integrator/order/meal/suppliers/{supplierId}/packages?storeId=...&packageStatuses=Created&page=0&size=50`
- Kabul: `PUT .../packages/picked` (`packageId`, `preparationTime`)
- Yola çıkış: `PUT .../packages/{packageId}/manual-shipped`
- İptal/red: `PUT .../packages/unsupplied` (`packageId`, isteğe bağlı `itemIdList`)
- Test siparişi (yalnız STAGE): `POST /integrator/meal-test-order/orders/meal`

“Alındı” ve “iptal” bildirimleri desteklenir. “Teslim edildi” için doğrulanmış bir
uç olmadığından sürücü bu durumu göndermez; mevcut kodda hata olarak yükselir ve
olaya `review` yazılır. Bu, kasadaki teslim onayını engellemez.

## Doğrulama ve sınırlar

`tests/trendyol-yemek.test.ts` paket ayrıştırmayı (savunmalı alan okuma), çoklu
statü parametresini, sayfalama çağrısını, ödeme türü eşlemesini, ürün satırı →
ortak sipariş dönüşümünü ve HTTP hata metnini kapsar. Gerçek Trendyol Yemek
sandbox hesabıyla uçtan uca sipariş çekme/kabul/iptal denenmedi; yayın öncesi
sandbox doğrulaması gerekir. Polling aralığı 2 dakikadır; kaçırılan paket olursa
sonraki tur `Created` listesini yeniden çeker, tekilleştirme sayesinde çift kayıt
oluşmaz.
