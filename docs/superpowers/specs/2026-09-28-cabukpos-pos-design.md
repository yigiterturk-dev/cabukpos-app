# ÇabukPOS — Restoran + Market POS tasarımı

Tarih: 2026-09-28 · Durum: onaylandı (Yiğit, 2026-09-28)

## 1. Amaç ve kapsam

Suitable POS benzeri, restoran ve market için satış noktası yazılımı; ajans panelinden (restoran-zirve) ayrı, çok kiracılı SaaS olarak satılır.

Kararlar (Yiğit, 2026-09-28):
- Tam POS tek tasarımda planlanır; uygulama modül modül, her modül test + E2E ile kendi başına çıkar (§9).
- Ortak çekirdek + iki dikey: **restoran** (masa, adisyon, mutfak, paket/platform siparişi, kurye) ve **market** (barkod, terazi, raf etiketi, hızlı kasa).
- Kasa web uygulamasıdır (PWA; PC, tablet, Android POS) ve **çevrimdışı çalışır**; kasadaki PC'de **yerel ajan** donanımı sürer.
- Mali fiş sağlayıcıdan bağımsız bir arayüzün arkasındadır; v1 bilgi fişi, sonra e-Arşiv entegratörü ve ÖKC sürücüsü.
- Ayrı uygulama (`app.cabukpos.com`), kendi Neon DB'si, çok kiracılı.

Kapsam dışı (v1): muhasebe, bordro, çok para birimi, sadakat programı, self-servis kiosk, müşteri uygulaması.

## 2. Mimari

```
[Kasa/Garson/Mutfak ekranı — PWA]  --(LAN, çevrimdışı da)-->  [Yerel ajan — kasadaki PC]
          |  IndexedDB (katalog + bekleyen satışlar)                 |  yazıcı, çekmece, terazi, ÖKC
          |                                                         |  dükkân içi eşitleme merkezi
          +-------------------(internet)--------------------> [Bulut: Next.js API + Neon Postgres]
```

- **Bulut** (`cabukpos-app` deposu): Next.js 16 + TypeScript, Drizzle, Neon Postgres. Her tabloda `tenant_id`; Postgres satır düzeyi güvenlik (RLS) istek başına `set local app.tenant_id` ile. Yönetim ekranları (ürün, fiyat, stok, rapor, kullanıcı) ve eşitleme API'si burada.
- **İstemci (PWA)**: aynı Next uygulamasının `/kasa` bölümü; service worker ile çevrimdışı açılır, veriler IndexedDB'de (Dexie). Kasa, garson ve mutfak ekranı aynı istemcinin rolleridir.
- **Yerel ajan** (`cabukpos-agent`): Node.js tek dosya (Windows servisi). İki işi var: (1) donanım — ESC/POS yazıcı (ağ 9100 ve USB/Windows kuyruğu), para çekmecesi (yazıcı darbesi), terazi (seri port), ileride ÖKC; (2) dükkân içi merkez — aynı ağdaki cihazlar ajana WebSocket ile bağlanır, siparişler internetsiz de mutfağa ve diğer kasalara gider; ajan internet gelince buluta eşitler.
- **HTTPS sorunu**: https'ten açılan PWA, LAN'daki `http://192.168.x.x`'e bağlanamaz (karışık içerik). Çözüm Plex yöntemi: her ajana `<ajan-id>.lan.cabukpos.com` alt alanı (DNS kaydı ajanın LAN IP'sini gösterir) ve DNS-01 ile alınmış Let's Encrypt sertifikası; bulut sertifikayı üretip ajana verir. Ajan yoksa (tek tablet) istemci doğrudan buluta eşitler; yalnız o durumda cihazlar arası internetsiz iletişim yoktur.
- **Ortak paketler**: platform istemcileri (Trendyol Go, Yemeksepeti) restoran-zirve'den `packages/platforms`'a, online sipariş modülüne (M6) gelindiğinde taşınır; o zamana kadar dokunulmaz.

## 3. Çekirdek veri modeli

Para her yerde tamsayı kuruş. Satır adı/fiyatı/KDV'si satışa kopyalanır (ürün sonradan değişse de fiş değişmez).

- `tenants` (işletme, dikey: restoran|market), `stores` (şube), `devices` (kasa/tablet/mutfak ekranı; eşleme kodu → iptal edilebilir cihaz jetonu; cihaz başına fiş öneki)
- `users` (yönetim e-posta+şifre), `memberships` (kullanıcı × şube × rol: sahip, müdür, kasiyer, garson, mutfak), kasa girişi için 4-6 haneli **PIN** (hash cihaza da iner, çevrimdışı doğrulanır; 5 yanlışta kilit)
- `categories`, `products` (tür: adet | tartılı; barkodlar dizi; KDV oranı %1/%10/%20; fiyat; stok takibi açık/kapalı), `product_options` (restoran: seçenek grupları, ör. "acı/az acı", ekstra ücretli)
- `sales` (id istemcide üretilen UUID; `device_id` + cihaz içi sıra no = boşluksuz fiş no; kanal: kasa|masa|paket|platform; durum: açık|kapandı|iptal|iade; toplamlar KDV oranı bazında), `sale_lines`, `payments` (nakit|kart|yemek kartı|karma; para üstü)
- `shifts` (kasa açılış tutarı, kapanış sayımı, fark) — gün sonu raporu. Mali Z raporu değildir, ÖKC'den gelir.
- `stock_movements` (satış, iade, alış, sayım, fire; stok = hareketlerin toplamı), `recipes` (restoran: ürün → hammadde miktarları)
- `tables`, `table_sessions` (restoran), `kitchen_tickets` (mutfak istasyonu, durum: yeni|hazırlanıyor|hazır)
- `fiscal_documents` (tür: bilgi|earsiv|okc; durum: bekliyor|kesildi|hata; sağlayıcı referansı)
- `catalog_version` (kiracı başına artan sayaç; eşitlemede "şundan sonrası")

## 4. Eşitleme

- **Katalog aşağı** (bulut → cihaz): `GET /api/sync/catalog?since=<sürüm>` değişen ürün, fiyat, kullanıcı-PIN, masa kayıtlarını döner; cihaz IndexedDB'ye yazar.
- **Satış yukarı** (cihaz → bulut): satışlar değişmez belgeler olarak "giden kutusuna" yazılır; `POST /api/sync/sales` toplu, **idempotent** (UUID ile upsert). Bulut tamamlanmış satışı asla reddetmez: silinmiş ürün ya da eksi stok olsa bile kaydeder ve incelemeye işaretler.
- **Açık adisyon** (restoran, çok cihaz): masa durumu ajan üzerinden anlık yayılır; ajan yoksa bulut üzerinden (SSE). Aynı masada çakışma: satır ekleme birleşir (her satır ayrı kimlikli), masa kapatma ilk gelen kazanır, sonraki cihaza "masa kapandı" döner.
- Çevrimdışı göstergesi her ekranda; bekleyen satış sayısı görünür. Yeniden deneme artan beklemeyle yapılır.

## 5. Dikeyler

**Market**: barkod okuyucu klavye gibi çalışır (odak her zaman arama/barkod alanında); tartılı ürün etiket barkodu (27/28/29 öneki, ürün kodu + gram/fiyat) çözülür; ajanla terazi okuma; hızlı ürün tuşları; iade (fiş no ile); raf etiketi yazdırma (fiyat değişen ürünler); stok girişi (alış), sayım, fire.

**Restoran**: masa planı (bölge × masa), adisyon (masaya satır ekle, not, seçenek), mutfağa gönder → istasyona göre mutfak ekranı ve/veya mutfak yazıcısı; hesap bölme (kişi başı eşit / ürün seçerek), ikram ve indirim (yetkiye bağlı, denetim kaydında); paket sipariş (müşteri, adres, kurye ata, yolda/teslim); reçeteden hammadde düşümü.

## 6. Online sipariş merkezi (restoran)

Platform siparişleri tek ekranda: sesli uyarı, kabul/red, hazırlanma süresi, otomatik mutfağa düşme ve fiş. İlk adaptör Yemeksepeti Partner API (istemci hazır, sipariş uçları eklenecek); Trendyol Go sipariş API'si entegratör onayı ister, arayüz hazır bekler; Getir ve Migros doküman gelince. Platform siparişi `sales.channel = platform` olarak aynı satış modeline girer, raporlar tek yerden çıkar.

## 7. Mali fiş

`FiscalProvider` arayüzü: `issue(sale) → { status, ref }`, `cancel(ref)`. Sürücüler:
1. `info` — bilgi fişi (mali değeri yok), ajan ya da tarayıcı ile basılır. v1.
2. `earsiv` — entegratör API'si (ilk aday API'si açık olan biri: Paraşüt, Uyumsoft veya İzibiz; anahtar gelince). Paket ve online siparişlere.
3. `okc` — ÖKC üreticisinin (GMP3) sürücüsü ajan üzerinden; üretici onayı gelince.
Kesilemeyen belge `hata` durumunda kalır, gün sonunda listelenir; satış engellenmez.

## 8. Güvenlik ve hata yönetimi

- RLS + her sorguda kiracı; cihaz jetonu iptal edilince eşitleme 401 döner, cihaz kilitlenir.
- PIN deneme kilidi, yetkili işlemler (iptal, iade, indirim, ikram, çekmece açma) rol + denetim kaydı.
- Ajan–bulut arası: ajan jetonu; ajan–cihaz arası: aynı kiracının cihaz jetonu.
- Yazıcı hatası satışı durdurmaz; fiş "yeniden yazdır" kuyruğunda bekler.

## 9. Modüller ve sıra

| # | Modül | İçerik | Bitti ölçütü |
|---|---|---|---|
| M1 | Çekirdek + kasa | kiracı/şube/cihaz eşleme, kullanıcı+PIN, ürün/kategori/KDV, hızlı satış, ödeme (nakit/kart/karma), bilgi fişi (tarayıcı 80 mm), vardiya aç/kapa + gün sonu | birim testler (sepet, KDV, yuvarlama) + E2E satış |
| M2 | Çevrimdışı | service worker, IndexedDB, katalog/satış eşitleme, idempotent API | E2E: internet kesik satış → bağlanınca bulutta tek kayıt |
| M3 | Market | barkod, tartılı barkod, iade, stok hareketleri, sayım, raf etiketi | E2E market kasası |
| M4 | Yerel ajan | ESC/POS (ağ+USB), çekmece, terazi, LAN merkezi + sertifika | sahte yazıcı/terazi ile test; gerçek cihazda Yiğit dener |
| M5 | Restoran salon | masa, adisyon, seçenekler, mutfak ekranı/yazıcısı, hesap bölme, ikram/indirim, paket + kurye | E2E iki cihaz (garson + mutfak) |
| M6 | Online sipariş | platform paketi, YS sipariş uçları, sipariş merkezi ekranı | sahte platformla E2E |
| M7 | Stok/reçete | reçete düşümü, alış, tedarikçi | birim + E2E |
| M8 | Mali | `FiscalProvider`, e-Arşiv adaptörü (sandbox) | sandbox'ta fatura |
| M9 | Rapor + abonelik | satış/ürün/personel raporları, ajans paneline izinli okuma, PayTR/iyzico abonelik | E2E |

## 10. Test

Saf çekirdek (sepet toplamı, KDV oranı bazında yuvarlama, tartılı barkod çözümü, hesap bölme, stok hesabı) birim testli; eşitleme idempotentliği test DB'sinde; E2E Playwright + sistem Chrome, çevrimdışı senaryolar `context.setOffline(true)` ile. Her modül: test + E2E → main'e commit+push.

## 11. Yiğit'in işleri (kod beklemez, paralel yürür)

ÖKC üreticisi iş ortaklığı başvurusu; e-Arşiv entegratörü seçimi ve sandbox anahtarı; Neon projesi + Vercel (`app.cabukpos.com`); PayTR/iyzico hesabı; test için bir termal yazıcı + barkod okuyucu.
