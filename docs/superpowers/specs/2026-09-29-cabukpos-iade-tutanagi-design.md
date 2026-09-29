# ÇabukPOS — e-Arşiv'li satışta iade belgesi (iade tutanağı)

Tarih: 2026-09-29 · Dal: `iade-tutanak` · Onay: Yiğit (yaklaşım A)

## Sorun

M8'de e-Arşiv faturası kesilmiş satışın **tam iadesi** faturayı iptal eder; **kısmi iade** yalnız `cancel_rejected`
("iade faturası gerekli") işaretler, belge üretmez. Nihai tüketiciye kesilen e-Arşiv'de satıcı iade faturası kesemez;
iade **iade tutanağı** ile belgelenir. Alıcı VKN'li mükellefse iade faturasını **alıcı** keser, satıcı onu kaydeder.

## Kararlar

1. Kısmi iade (ve iptali sağlayıcıca reddedilen tam iade) → belge türü alıcıya göre:
   - TCKN / nihai tüketici → `tutanak`: kasada termal basılır, müşteri imzalar. Oluşunca çözülmüş sayılır.
   - VKN → `alici_faturasi`: tutanak basılmaz; müdür alıcının iade faturası no + tarihini girince çözülür.
2. Tutanak no = iade fiş no (kasa çevrimdışıyken de çalışır; ayrı seri yok).
3. Asıl fatura kısmi iadede `issued` kalır (geçerli). `cancel_rejected` yalnız gerçek iptal reddinde oluşur.
4. Mevzuat notu: tutanak metni taslaktır; mali müşavir bir kez onaylamalı (Yiğit işi).

## Veri

Yeni tablo `fiscal_refunds` (RLS, `tenant_id`; M-dönemi RLS kalıbı + SEQUENCE yok):

| Alan | Tür | Not |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid | |
| `refund_sale_id` | uuid unique → sales | idempotent eşitleme |
| `fiscal_doc_id` | uuid → fiscal_documents | asıl fatura |
| `kind` | text `tutanak` \| `alici_faturasi` | |
| `buyer_invoice_no` / `buyer_invoice_date` | text / date null | yalnız `alici_faturasi` |
| `resolved_at` | timestamptz null | tutanakta oluşturma anı |
| `created_at` | timestamptz | |

## Akış

1. **Kasa sorgusu:** `LookedUpSale`'e `fiscal: { number, ettn, buyerKind: "tckn" \| "vkn" } \| null` eklenir
   (bulut `lookupSale` fiscal_documents'tan `issued` belgeyi okur; yerel satışta kasadaki fiş bilgisinden).
   Belge `issued` değilse (bekliyor/hata) `null` — iade mevcut kuralla (belge iptali/tamamlanmadan iade) işler.
2. **Kasa iade kaydı:** `fiscal` doluysa ve iade kısmiyse (kasada kalan tüm satırlar iade edilmiyorsa):
   - `tckn` → iade fişinin ardından termal **İADE TUTANAĞI** (`lib/core/refundNote.ts`, saf): başlık, satıcı unvan/VKN,
     asıl fatura no + ETTN + tarih, iade fiş no = tutanak no, iade kalemleri (ad, miktar, birim fiyat, KDV, tutar),
     KDV kırılımı, toplam, iade yöntemi; "Müşteri ad soyad / TCKN / İmza" boş çizgileri; "Satıcı imza".
   - `vkn` → iade fişine not: "Alıcı iade faturası düzenleyecektir. Fatura: <no>".
   Tam iadede tutanak basılmaz (fatura iptal edilir); iptal reddedilirse yönetimden A4 tutanak basılır.
3. **Eşitleme (`onRefund`):**
   - Kısmi + `issued` → `fiscal_refunds` ekle (tür alıcı taxId'den `validateTaxId`), belge `issued` kalır.
   - Tam + `issued` → mevcut `cancelPending` (değişmez). `cancelOne` reddederse `cancel_rejected` + `fiscal_refunds` ekle.
   - Aynı iade ikinci kez gelirse `refund_sale_id` unique → çakışmada yok say.
4. **Yönetim:**
   - Raporlar → İncelenecek: çözülmemiş `alici_faturasi` satırları ("Alıcının iade faturası bekleniyor", asıl fatura no,
     iade tutarı) + satır içi form (Fatura no, Tarih) → `resolveBuyerInvoice` server action (requireWriter) → çözüldü.
   - Mali → Belgeler: belgenin yanında "İade" rozeti; tutanak satırı → `/yonetim/mali/iade/<id>` A4 yazdırılabilir tutanak
     (aynı `refundNote` içeriği; `window.print`).

## Hata durumları

- Kasa çevrimdışı + yerelde olmayan fiş → mevcut "İnternet gelince" hatası (değişmez).
- Satıcı VKN/unvanı yoksa (mali ayar eksik) → e-Arşiv zaten kesilmemiştir → `fiscal` null.
- Yazıcı yoksa tutanak ekranda gösterilir + "Yazdır" (tarayıcı), fiş davranışıyla aynı.

## Test

- Birim: `refundNote` içeriği (kalemler, KDV kırılımı, tutanak no), tür seçimi (`tckn`/`vkn`), `onRefund` kısmi/tam/red
  (DB testi), `resolveBuyerInvoice` doğrulaması (no boş olamaz, tarih asıl satıştan önce olamaz).
- E2E `e2e/iade.mjs`: paket kanalı e-Arşiv → satış `issued` → kısmi iade → kasada "İADE TUTANAĞI" görünür, bulutta
  `fiscal_refunds` tutanak çözülmüş → VKN'li satış → kısmi iade → İncelenecek'te satır → no+tarih gir → kapanır.
  Regresyon: m3 (iade), m8.

## Kapsam dışı

Entegratörde IADE tipli e-Arşiv, ÖKC fişli satış iadesi, iade e-postası.
