# ÖKC entegrasyon yolu haritası (2026-10-06)

Karar: **Yol A — e-ÖKC/VÖRC çözücü üzerinden (bulut API)** ile başla. Fiziksel ÖKC SDK'sı (Yol B) yalnız müşteri talebi gelirse.

## Neden Yol A

- Hedef müşteri (yemek/içecek, perakende) GİB'de zaten VÖRC kapsamında → e-ÖKC standart; fiziksel cihaz devri kapandı
- Donanım masrafı ve üretici iş ortaklığı süreci yok; e-Arşiv de aynı hesaptan kesilir
- Kod tarafı hazırdır: `OkcProvider` arayüzü + `fake-okc` sandbox (#18) → gerçek sağlayıcı **tek dosya**; `FiscalProvider` (M8) hattı da aynı desende

## Kiracı/anahtar modeli — teklif aşamasında netleşecek kritik soru

e-ÖKC'de GİB tarafında **mükellef-çözücü sözleşmesi** gerekir. İki model:
- **BYOK:** her kiracı kendi çözücü hesabını açar, API anahtarını Yönetim → Mali'ye girer (biz de saklarız). Satış döngüsü uzun ama yasal yük kiracıda.
- **Toplu sözleşme:** biz çözücüyle anlaşırız, kiracılarımızı bizim hesabımız altında açarız (churn/mesuliyet bize). Teklifte "alt mükellef açma + toplu fiyat" sorulur.

Varsayım: önce **BYOK** ile canlıya çık (ilk pilot müşteri kendi hesabını açar), toplu sözleşmeyi sonra pazarlık et.

## Teklif alınacak firmalar (VÖRC/e-ÖKC + e-Arşiv çözücüleri)

Paraşüt, Uyumsoft, İzibiz, Nilvera, Foriba(vdf), Logo, Mikro — ve üretici yanı: Hugin/Pavo/Ödeal'in e-ÖKC yazılım ürünleri. İkisinden sandbox iste: **Paraşüt + Uyumsoft** (API dokümantasyonu kamuya açık, küçük işletme segmentine yakın).

### Sorulacak sorular (aynı liste hepsine)
1. e-ÖKC + e-Arşiv paket fiyatı: aylık sabit + belge başı? Yıllık taahhüt?
2. REST API: fiş kesme, **iptal/iade** (fiscal_refunds hattımız için şart), Z/gün sonu raporu, durum sorgulama — uç listesi + doküman
3. Webhook/geri bildirim var mı, yoksa polling mi (bizde cron + outbox retry hazır)
4. Sandbox: gerçek GİB bağlantısı olmadan test mümkün mü?
5. Alt mükellef açma: BYOK mu, bizim hesap altında toplu mu; fiyat farkı
6. KDV/tevkifat özel fiş tipleri, çoklu vergi dairesi — market dikeyi için
7. Sözleşme: SaaS olarak "yazılımımız üzerinden kesim"e izin var mı (beyaz etiket kısıtı)

## Kod tarafı — anahtar gelince yapılacaklar (tek oturum)

1. `lib/fiscal/okc-<saglayici>.ts`: `OkcProvider` implementasyonu (kesim, iptal, Z raporu, durum) — `getOkc`'e ek
2. `fiscalSettings.okcProvider` enum'una sağlayıcı ekle + env: `OKC_API_URL`, `OKC_API_KEY` (BYOK'ta kiracı bazlı şifreli saklama — `lib/billing/card-vault.ts` deseninde AES-GCM)
3. İade: `fiscal_refunds` ile iade fişi/iade e-Bileti eşlemesi; VKN'li alıcıda alıcının iade faturası akışı (iade tutanağı modülü hazır)
4. Test planı (launch kapısındaki madde): sandbox kesim, iptal, e-posta, ETTN+QR (3 sn bütçe — gecikirse e-posta, M8 desen)
5. Mali > Ayarlar'daki canlı ping gerçek uca bağlanır

## Mali müşavir onay listesi (paralel yürüt)

- Bilgi fişi ↔ mali belge ayrımı (docs/MALI-UYUM-GATE.md)
- İade tutanağı metni (bekliyordu) + iade e-Bileti politikası
- ÖKC kullanım/entegrasyon sorumluluğunun işletme bazında yazılı hâli (launch kapısı maddesi)

## Sıra

1. Yiğit: Paraşüt + Uyumsoft'a üstteki sorularla teklif/sandbox talebi (1-2 gün)
2. Mali müşavir onayları paralel
3. Sandbox anahtarı gelince: sürücü + testler tek oturumda; canlıya launch kapısıyla
4. Yol B (fiziksel SDK): yalnız müşteri talebi + üretici onayı gelirse — mimari değişmeden ajan sürücüsü
