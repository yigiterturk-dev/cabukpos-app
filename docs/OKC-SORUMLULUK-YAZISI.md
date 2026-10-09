# ÖKC kullanım ve entegrasyon sorumluluğu — işletme bazında yazılı hâli (TASLAK)

Launch kapısı maddesi: "ÖKC kullanım/entegrasyon sorumluluğu işletme bazında
yazılı olarak netleştirildi" (`docs/LAUNCH-CHECKLIST.md`). Bu şablon her pilot
işletme için doldurulur; işletme yetkilisi ve mali müşavir imzalar.
Dayanak: `docs/MALI-UYUM-GATE.md` (imza kapıları 1 ve 3) + `docs/OKC-YOL-HARITASI.md`
(Yol A: e-ÖKC/VÖRC çözücü, bulut API).

> **Taslak uyarısı:** Bu metin hukuki danışman onayı olmadan imzaya sunulmaz.
> [SÖZLEŞME/HUKUK NOTU] alanları hukuk müşaviri tarafından tamamlanır.

## 1. Taraflar

- **Yazılım sağlayıcı:** ÇabukPOS ([ŞİRKET ÜNVANI], [VKN])
- **İşletme (Kullanıcı):** [İŞLETME ÜNVANI], [VKN/TC], [ADRES]
- **e-ÖKC/e-Belge çözücüsü:** [ÇÖZÜCÜ FİRMA] — hesap sahibi: [ ] İşletme (BYOK)
  / [ ] ÇabukPOS toplu sözleşmesi (alt mükellef)

## 2. Sorumluluk ayrımı

| Konu | Sorumlu |
| --- | --- |
| ÖKC/e-Belge mükellefiyetinin tespiti (VÖRC kapsamı, Vergi No, mükellef tipi) | İşletme + mali müşavir |
| Çözücü hesabının açılması ve API anahtarının gerçek sahipliği | [BYOK: İşletme / Toplu: ÇabukPOS] |
| Çözücü abonelik bedelleri | [İşletme / ÇabukPOS + işletmeye yansıtır] |
| Yazılım üzerinden fiş/e-Bilet kesimi, iade fişi, Z raporu çekimi | ÇabukPOS (teknik ifa) — **yasal sorumluluk belge mükellefini izler** |
| API anahtarının şifreli saklanması, erişim ve iptal | ÇabukPOS (AES-256-GCM, Yönetim → Mali; erişim sahip/müdür) |
| Kesilemeyen/reddedilen belgelerin takibi ve yeniden deneme | ÇabukPOS (cron + outbox; alarm eşiği: 5/gün backlog) |
| Belge saklama ve ibraz yükümlülüğü (VUK) | İşletme (ÇabukPOS yedekleri yardımcı kopyadır, VUK karinesi sağlamaz) |
| Bağlantı kesintisinde bilgi fişi + sonradan mali belge akışı | İşletme (işletim) / ÇabukPOS (yazılım akışı) |
| GİB ceza/ihtar süreçleri | İşletme |

## 3. İşletmenin beyanı

1. Mali müşavirimle birlikte VÖRC/e-ÖKC mükellefiyetimi teyit ettim; ÇabukPOS'a
   verdiğim (veya toplu sözleşme altında benim adıma açılan) çözücü hesabının
   mükellef bilgilerimle eşleştiğini beyan ederim.
2. ÇabukPOS'un "POS operasyonu + bilgi fişi altyapısı" sunduğunu; mali belge
   (e-Arşiv/e-ÖKC) ancak bağlı olduğum çözücü üzerinden ve kendi mükellefiyetimle
   kesildiğini anladım. ÇabukPOS, mali belge muafiyeti veya beyan yükümlülüğümü
   üstlenmez.
3. İade işlemlerinde tutanak / alıcının iade faturası gerekliliklerini
   (`/yonetim/mali/iade` akışı) uygulamak birinci derecede benim sorumluluğumdadır.

## 4. ÇabukPOS'un taahhüdü

1. Çözücü API anahtarını yalnızca bu işletmenin belge kesimi için kullanır,
   şifreli saklar; anahtar iptal talebinde 1 iş günü içinde erişimi keser.
2. Kesim hatalarını işletmenin panelinde görünür kılar; 5/gün ve üzeri fiscal
   backlog'ta alarm üretir.
3. Belge verilerini işletme hesabı kapanırsa 30 gün sonra yasal saklama
   süreleri dışında siler (Kullanım koşulları ile uyumlu).

## 5. İmzalar

| | İşletme yetkilisi | ÇabukPOS yetkilisi | Mali müşavir (teyit) |
| --- | --- | --- | --- |
| Ad Soyad | | | |
| Tarih | | | |
| İmza | | | |

Ek: doldurulmuş örnek ilk pilot işletmede bu dosyanın kopyası `docs/pilot/`
altında saklanır (imzalı taranmış nüsha, repo'ya konmaz).
