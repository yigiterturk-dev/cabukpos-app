# ÇabukPOS M9c — Ajans paneline izinli okuma

Tarih: 2026-09-29 · Durum: onaylandı (brainstorming)

## Amaç

Ajans paneli (restoran-zirve), ÇabukPOS kullanan müşterisinin günlük sipariş/ciro/iptal verisini
işletme sahibinin verdiği salt okunur anahtarla okur. Böylece aylık rapor, önce/sonra ve kampanya
etkisi ekranları POS'un gerçek salon/paket verisiyle çalışır.

## Kararlar

- **Kapsam:** yalnız günlük özet (sipariş, ciro, iptal) + kanal kırılımı. Menü/maliyet ve yazma YOK.
- **İzin:** işletme sahibi ÇabukPOS'ta anahtar üretir, ajans panele yapıştırır (Trendyol anahtarı gibi).
- **Taşıma:** ÇabukPOS okuma API'si, ajans mevcut senkron cron'u ile çeker. Webhook ve doğrudan DB okuma reddedildi.

## ÇabukPOS tarafı

### Veri

Yeni tablo `integration_keys` — **RLS dışı** (`devices` gibi: anahtar, kiracı bilinmeden hash ile aranır); her sorguda `tenant_id` koşulu, yalnız `lib/integrations/keys.ts` erişir:

| alan | tür | not |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid fk (cascade) | |
| name | text | ör. "Zirve Ajans" |
| prefix | text | anahtarın ilk 8 karakteri, listede gösterim için |
| key_hash | text unique | sha256(anahtar), hex |
| created_at | timestamptz | |
| last_used_at | timestamptz null | uçta en fazla dakikada bir güncellenir |
| revoked_at | timestamptz null | |

Anahtar biçimi: `cpk_` + 32 bayt base64url (`newDeviceToken`). Düz metin yalnız üretim anında bir kez gösterilir, saklanmaz.

### Yönetim ekranı

Yönetim → **Entegrasyonlar** (Nav'da Abonelik'ten sonra). Yalnız admin (işletme sahibi):
- "Ajans erişimi oluştur" (ad girilir) → anahtar bir kez, kopyala düğmesiyle gösterilir.
- Liste: ad, `cpk_xxxx…`, oluşturma, son kullanım, durum; "İptal et" (geri alınamaz).
- Yalnız `role = sahip`. Oluşturma `requireWriter` (abonelik kilidinde kapalı); **iptal kilitte de açık** (güvenlik); **uç okuması kilitte de çalışır** (veri müşterinindir).

### Uç

`GET /api/v1/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `Authorization: Bearer cpk_…` → hash → lookup. Yok/iptal → `401 {"error":"unauthorized"}`.
- Aralık: `from <= to`, en fazla 92 gün; aksi `400`.
- Sınır: anahtar başına dakikada 60 istek (`lib/ratelimit` `hit('apikey:<id>', 1)`) → `429`.
- Sorgu, kiracının RLS bağlamında (`withTenant`): `lib/admin/report.ts` → `dailyStatsData(tx, range)`, saf hesap `lib/core/report.ts` → `dailyStats(rows)`. İadenin kanalı asıl satışınkidir (`refund_of` join; iade satırı kendisi `kasa` yazılır).
- Yanıt:

```json
{
  "business": { "name": "Kebapçı" },
  "days": [
    { "day": "2026-09-28", "orderCount": 42, "cancelledCount": 1, "grossRevenue": 12345.5,
      "channels": { "masa": 30, "paket": 8, "kasa": 4 } }
  ]
}
```

Satışsız günler yanıtta yer almaz.

### Tanımlar

- **Gün:** `Europe/Istanbul` takvim günü.
- **grossRevenue:** o günün satış belgelerinin KDV dahil toplamı eksi aynı günkü iadeler (`refund_of` dolu satırlar; net satış). Tutarlar kuruş tamsayıdan TL'ye çevrilir.
- **orderCount:** adisyondan gelen satışlarda adisyon başına 1 (hesap bölme sayıyı şişirmez), diğer satışlarda satış başına 1.
- **cancelledCount:** o günkü iade belgesi (`refund_of` dolu) sayısı; iadeler `orderCount`'a girmez.
- **Platform hariç:** `sales.channel = 'platform'` olan satışlar (ve onların iadeleri) sayılmaz — ajans bunları Trendyol/YS bağlantısından zaten alıyor; dahil etmek çift sayım olur.
- **channels:** sipariş sayısının kırılımı: `sales.channel` enum'u: `masa` (adisyon), `paket` (kendi paket/kurye), `kasa` (hızlı satış). Toplamı `orderCount`'a eşittir.

## Ajans tarafı (restoran-zirve)

- `lib/platforms/labels.ts`: `cabukpos` eklenir ("ÇabukPOS").
- `CREDENTIAL_FIELDS.cabukpos = [{ key: "apiKey", label: "Ajans erişim anahtarı", secret: true, hint: "ÇabukPOS → Yönetim → Entegrasyonlar" }]`; şema `apiKey` `cpk_` ile başlamalı.
- `lib/platforms/cabukpos`: `createCabukposClient` — `capabilities = ["orders.stats"]`; `testConnection` = son 1 günü çeker, `business.name` döner; `listOrderStats` = uç; 92 günden uzun aralığı parçalar. `401` → `PlatformError("auth")`, `429` → `PlatformError("rate_limit")`.
- Taban adres env `CABUKPOS_API_URL` (varsayılan `https://cabukpos-app.vercel.app`; cabukpos.com DNS gelince değişir).
- `platform` pgEnum'una `cabukpos` eklenir (yerel `db:push`; panel canlı değil).
- Mevcut senkron + `order_stats` olduğu gibi; yalnız toplamlar yazılır. Kanal kırılımı gösterimi sonraya (YAGNI).
- Ajans paneli canlı değil → bu taraf yalnız kod + test.

## Test

ÇabukPOS birim (DB):
- `dailyStats`: bölünmüş adisyon tek sipariş; iade düşer ve sayılır; platform siparişi hariç; 23:30 İstanbul satışı doğru günde; kanal toplamı = orderCount.
- Anahtar: üret → lookup bulur; iptal → bulmaz; A işletmesinin anahtarı B verisini göremez.
- Uç: 401 / 400 (ters/uzun aralık) / 200 biçimi.

Ajans birim: sahte `fetch` ile istemci (başarı, 401→auth, 429→rate_limit, 92+ gün parçalama).

E2E `e2e/m9c.mjs`: kayıt → Entegrasyonlar'da anahtar üret → uç 200 (işletme adı, `days` dizi) → 400 (ters aralık) → iptal → 401. Satış sayımı DB testinde. Regresyon: M9a, M9b.

## Canlıya alma

ÇabukPOS: `scripts/prod-push.sh 1..5` (şema → rls (yeni tabloya GRANT) → kontrol: `integration_keys` var → main → canlı E2E), Yiğit `!` ile tek tek. Yeni env yok.
