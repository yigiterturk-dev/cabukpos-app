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

Yeni tablo `integration_keys` (RLS'li, `business_id` ile ayrışır; `db-rls.mjs`'e eklenir):

| alan | tür | not |
|---|---|---|
| id | uuid pk | |
| business_id | uuid fk | |
| name | text | ör. "Zirve Ajans" |
| prefix | text | anahtarın ilk 8 karakteri, listede gösterim için |
| key_hash | text unique | sha256(anahtar), hex |
| created_at | timestamptz | |
| last_used_at | timestamptz null | uçta en fazla dakikada bir güncellenir |
| revoked_at | timestamptz null | |

Anahtar biçimi: `cpk_` + 32 bayt base64url. Düz metin yalnız üretim anında bir kez gösterilir, saklanmaz.

Anahtar arama RLS bağlamı olmadan yapılmalı (işletme henüz bilinmiyor) → M8'deki desenle
`SECURITY DEFINER` fonksiyon `integration_key_lookup(hash)` → `(id, business_id)` yalnız
`revoked_at is null` satırlar için; sahibine `definer_read` politikası.

### Yönetim ekranı

Yönetim → **Entegrasyonlar** (Nav'da Abonelik'ten sonra). Yalnız admin (işletme sahibi):
- "Ajans erişimi oluştur" (ad girilir) → anahtar bir kez, kopyala düğmesiyle gösterilir.
- Liste: ad, `cpk_xxxx…`, oluşturma, son kullanım, durum; "İptal et" (geri alınamaz).
- Anahtar yönetimi `requireAdmin` (okuma değil, yazma işlemi) — abonelik kilidi (`requireWriter`) bu sayfayı da kilitler; ancak **uç okuması kilitte de çalışır** (veri müşterinindir).

### Uç

`GET /api/v1/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `Authorization: Bearer cpk_…` → hash → lookup. Yok/iptal → `401 {"error":"unauthorized"}`.
- Aralık: `from <= to`, en fazla 92 gün; aksi `400`.
- Sınır: anahtar başına dakikada 60 istek (`login_attempts` benzeri sayaç ya da mevcut ratelimit yardımcısı) → `429`.
- Sorgu, işletmenin RLS bağlamında (`withBusiness`) M9a rapor SQL'inin yanında yeni `dailyStats(tx, range)` fonksiyonu.
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
- `lib/platforms/cabukpos`: `createCabukposClient` — `capabilities = ["orderStats"]`; `testConnection` = son 1 günü çeker, `business.name` döner; `listOrderStats` = uç; 92 günden uzun aralığı parçalar. `401` → `PlatformError("auth")`, `429` → `PlatformError("rate_limit")`.
- Taban adres env `CABUKPOS_API_URL` (varsayılan `https://app.cabukpos.com`).
- Mevcut senkron + `order_stats` olduğu gibi; yalnız toplamlar yazılır. Kanal kırılımı gösterimi sonraya (YAGNI).
- Ajans paneli canlı değil → bu taraf yalnız kod + test.

## Test

ÇabukPOS birim (DB):
- `dailyStats`: bölünmüş adisyon tek sipariş; iade düşer ve sayılır; platform siparişi hariç; 23:30 İstanbul satışı doğru günde; kanal toplamı = orderCount.
- Anahtar: üret → lookup bulur; iptal → bulmaz; A işletmesinin anahtarı B verisini göremez.
- Uç: 401 / 400 (ters/uzun aralık) / 200 biçimi.

Ajans birim: sahte `fetch` ile istemci (başarı, 401→auth, 429→rate_limit, 92+ gün parçalama).

E2E `e2e/m9c.mjs`: giriş → Entegrasyonlar'da anahtar üret → satış yap → uç 200 ve satış sayılmış → iptal → 401. Regresyon: M9a, M9b.

## Canlıya alma

ÇabukPOS: `scripts/prod-push.sh 1..5` (şema → rls → kontrol: `integration_keys` relrowsecurity t + lookup fonksiyonu → main → canlı E2E), Yiğit `!` ile tek tek. Yeni env yok.
