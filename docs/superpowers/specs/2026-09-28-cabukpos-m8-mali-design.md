# ÇabukPOS M8 — Mali belge katmanı (bilgi fişi + e-Arşiv, sahte sağlayıcı)

Ana spec: `2026-09-28-cabukpos-pos-design.md` §7. Yiğit kararları (2026-09-28):
1. Gerçek entegratör yok → **arayüz + `info` + `fake-earsiv` sürücüsü**; gerçek entegratör (Paraşüt/Uyumsoft/İzibiz) anahtar gelince tek sürücü dosyası.
2. Kapsam = **işletme ayarı + fatura isteği**: kanal başına (`kasa`, `masa`, `paket`, `platform`) belge türü `info` | `earsiv` (varsayılan hepsi `info`); kasiyer satışta "Fatura" derse o satış ayardan bağımsız e-Arşiv olur.
3. Teslim = **fişte ETTN + QR, gecikirse e-posta**: kasa çevrimiçiyse 3 sn bekler; kesilemezse fişte "Faturanız e-postayla gönderilecek".

Kapsam dışı: ÖKC sürücüsü (üretici onayı), gerçek entegratör, e-Fatura (VKN'li mükellefe v1'de de e-Arşiv kesilir), iade faturası üretimi.

## Veri
- `fiscal_settings (tenant pk, provider text default 'fake-earsiv', series char(3) default 'CBP', counter int default 0, channel_modes jsonb default {kasa:'info',masa:'info',paket:'info',platform:'info'}, fake_fail boolean default false, updated_at)`. `fake_fail` yalnız sahte sürücüde: açıkken her `issue` hata döner (test/demo).
- `fiscal_doc_status` enum: `pending`, `issued`, `error`, `cancelled`, `cancel_rejected`.
- `fiscal_documents (id, tenant, sale_id unique, kind 'earsiv', status, buyer jsonb {taxId, name, email?, address?}, ettn uuid null, number text null, url text null, token text unique (24 karakter rastgele, herkese açık sayfa), attempts int default 0, last_error text null, email_sent_at ts null, created_at, issued_at null)`.
  - `info` belgeler için kayıt açılmaz (bilgi fişi = bugünkü fiş).
- RLS: iki tablo da kiracı politikası; `db-rls.mjs`'e eklenir (+ SEQUENCE izni gerekmez, uuid/pk).
- Herkese açık sayfa ve cron kiracı bağlamı olmadan çalışır → iki `SECURITY DEFINER` fonksiyon (db-rls.mjs içinde): `fiscal_doc_by_token(token)` (belge + satış satırları + işletme adı/adresi/vergi no), `fiscal_pending_tenants()` (bekleyen/hatalı, `attempts < 5` belgesi olan kiracılar).
- İşletmenin vergi bilgisi: `tenants` ekleri `tax_id text null`, `tax_office text null`, `address text null` (e-Arşiv satıcı alanı; boşsa e-Arşiv modu kaydedilemez).

## Sürücü arayüzü (`lib/fiscal/`)
```ts
interface FiscalProvider {
  issue(doc: IssueInput): Promise<{ ok: true; ettn: string; number: string; url?: string } | { ok: false; error: string; retryable: boolean }>;
  cancel(doc: { ettn: string; issuedAt: Date }): Promise<{ ok: true } | { ok: false; error: string }>;
}
```
- `IssueInput`: satıcı (tenant vergi bilgisi), alıcı, satırlar (ad, miktar, birim fiyat, KDV oranı), KDV dökümü (`sales.vat`), toplam, satış anı, numara.
- `fake-earsiv`: `fake_fail` ise `{ok:false, retryable:true}`; değilse ETTN = `crypto.randomUUID()`, `url` yok (sayfa bizim `/f/<token>`). `cancel`: satıştan 7 günden eski ise red (gerçek e-Arşiv iptal süresi taklidi).
- `getProvider(name)`: kayıt defteri; bilinmeyen ad → hata.
- Numara: `series + yıl + 9 hane sıra` (16 karakter, GİB biçimi); `counter` aynı işlemde `update … returning` ile artar, yalnız başarılı kesimde kullanılır (başarısız denemede numara yakılmaz: numara önce alınır, hata olursa işlem geri alınır).
- Saf yardımcılar (`lib/core/fiscal.ts`, birim testli): `validateTaxId` (VKN 10 hane algoritması, TCKN 11 hane algoritması; `11111111111` nihai tüketici geçerli), `docModeFor(channel, settings, invoiceRequested)`, `formatNumber(series, year, n)`, `nextRetryDue(attempts, lastTry)` (1, 5, 15, 60 dk; 5. denemeden sonra durur).

## Akış
1. **Kasa:** ödeme ekranında "Fatura" düğmesi → form: VKN/TCKN, unvan/ad soyad, e-posta, adres (VKN'de zorunlu). Satış belgesine `invoice` alanı eklenir (değişmez satışın parçası, giden kutusuyla eşitlenir). Kanal modu `earsiv` ve fatura istenmemişse alıcı = `11111111111` / "Nihai Tüketici", e-posta isteğe bağlı sorulur (boş geçilebilir).
2. **Eşitleme (`/api/sync/push`):** satış eklenirken `docModeFor` → `earsiv` ise aynı işlemde `fiscal_documents` `pending` kaydı (idempotent: `sale_id unique`). İadede (`refundOf`) asıl satışın `issued` belgesi varsa `cancel` kuyruğu (aşağıda).
3. **Hemen kesim:** kasa satışı çevrimiçi eşitlediyse `POST /api/fiscal/issue {saleId}` çağırır, en çok 3 sn bekler. Yanıt `issued` → fişe `e-Arşiv No`, `ETTN`, QR (`<APP_URL>/f/<token>`) basılır; zaman aşımı/hata/çevrimdışı → fişte "Faturanız e-postayla gönderilecek" (e-posta yoksa "Faturanızı <APP_URL>/f/<token> adresinden alabilirsiniz"; token satış anında istemcide üretilir ve satışla gelir, böylece çevrimdışı fişe de basılabilir).
4. **Yeniden deneme:** (a) her `/api/sync/push` sonunda kiracının vadesi gelmiş en çok 5 `pending`/`error` belgesi işlenir; (b) `GET /api/cron/fiscal` (`CRON_SECRET` başlığı) `fiscal_pending_tenants()` üzerinden aynı işi yapar — `vercel.json` cron (Hobby planında günlük; Pro'da 5 dk); (c) yönetimde "Yeniden dene". 5 denemeden sonra `error` kalır, yalnız elle denenir.
5. **E-posta:** kesilen belgede `buyer.email` varsa ve `RESEND_API_KEY` tanımlıysa Resend ile bağlantılı e-posta (`/f/<token>`), `email_sent_at` işlenir. Anahtar yoksa gönderilmez, belge durumu etkilenmez; yönetimde "e-posta gönderilmedi" işareti.
6. **İptal (iade):** iade satışı eşitlenince asıl belge `issued` ise: **tam iade** (iade toplamı = asıl toplam) → `cancel` denenir → `cancelled`, sağlayıcı reddederse `cancel_rejected`; **kısmi iade** → iptal denenmez, doğrudan `cancel_rejected` + `last_error = 'kısmi iade'`. `cancel_rejected` = yönetimde "iade faturası gerekli" listesi (elle çözülür).

## Ekranlar
- **Yönetim → Ayarlar → Mali belge:** işletme vergi no/dairesi/adresi, seri (3 büyük harf), kanal başına `Bilgi fişi | e-Arşiv` seçimi (native select yok, bölümlü düğme), sahte sağlayıcıda "Hata simülasyonu" anahtarı.
- **Yönetim → Mali belgeler:** liste (tarih, fiş no, alıcı, tutar, durum, numara); süzgeç (durum); satır eylemleri: yeniden dene, e-postayı yeniden gönder, sayfayı aç. Üstte hata / iptal reddi sayacı.
- **Gün sonu (vardiya raporu):** "Kesilemeyen e-Arşiv: N" satırı (sıfırsa gizli).
- **`/f/<token>`:** herkese açık, yazdırılabilir e-Arşiv görünümü (satıcı, alıcı, satırlar, KDV dökümü, toplam, ETTN, numara, durum). `pending/error` → "Faturanız hazırlanıyor". Sahte sürücüde üstte "TEST — mali değeri yoktur" bandı. `noindex`.

## Hata yönetimi
- Satış hiçbir durumda mali katman yüzünden engellenmez ya da geri alınmaz.
- `retryable:false` hata (ör. geçersiz alıcı) → hemen `error`, otomatik deneme yok.
- Sürücü istisnası = `retryable:true` hata.
- Aynı belge için eşzamanlı iki kesim: `update … set status='pending' where status in ('pending','error') returning` ile satır kilidi (`for update skip locked`), ikincisi atlar.

## Test
- Birim: `validateTaxId` (geçerli/geçersiz VKN, TCKN, nihai tüketici), `docModeFor`, `formatNumber`, `nextRetryDue`, sahte sürücü (başarı, `fake_fail`, 7 gün iptal reddi).
- E2E `e2e/m8.mjs`: ayarda paket = e-Arşiv + vergi bilgisi → paket satışı → `issued`, numara `CBP2026000000001`, fişte ETTN → `/f/<token>` 200 ve TEST bandı → `fake_fail` açık, kasa satışı + "Fatura" (VKN) → fişte "e-postayla" → `error`, `attempts=1` → hata kapat, yönetimde yeniden dene → `issued` → iade → `cancelled` → gün sonu sayacı 0. Regresyon: M1, M6.
