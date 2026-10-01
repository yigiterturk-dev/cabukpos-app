# Büyüme Merkezi — veri ve Laya sözleşmesi

## Temel ilke

ÇabukPOS gerçeğin kaynağıdır; Laya yorumlayan katmandır. Laya satış toplamı,
müşteri segmenti veya izin durumu uyduramaz. Her öneri hesaplanabilir bir veri
paketine, zaman aralığına ve kanıta bağlanır.

## Akış

1. ÇabukPOS tenant sınırı içinde anonimleştirilmiş/azaltılmış bir özellik paketi
   üretir: hedef müşteri sayısı, izinli hedef sayısı, son 30/90 gün siparişleri,
   ortalama sepet, kanal, ürün ve geçmiş kampanya sonuçları.
2. Laya yalnız bu paket üzerinde analiz yapar ve yapılandırılmış çıktı döndürür:
   `segment`, `öneri`, `kanıt`, `tahmin aralığı`, `güven`, `riskler`.
3. ÇabukPOS çıktıyı doğrular; izin yoksa hedefi reddeder, oran/sepet hesabını
   veri yokken tahmin diye etiketler.
4. İşletme sahibi taslağı onaylamadan hiçbir mesaj gönderilmez.
5. Gönderim ve sipariş sonucu kampanya olayları olarak geri yazılır; sonraki
   tahminler gerçek işletme verisiyle güncellenir.

İlk entegrasyon yüzeyi `GET /api/growth/feature-pack` uç noktasıdır. Bu uç yönetici
oturumu veya ÇabukPOS entegrasyon anahtarıyla kullanılabilir, anahtar başına
dakikada 60 istek sınırı vardır, `Cache-Control: no-store` döner ve PII yerine
sayısal tenant özeti verir. Harici Laya adaptörü bu uçtan aldığı veriyi başka
tenantlarla birleştirmeden önce ayrıca anonim/toplu benchmark kurallarını uygular.
`GET /api/growth/insights` aynı erişim sınırıyla kanıtlı fallback içgörüleri döndürür;
Laya bağlandığında `provider` alanı ve içgörü kaynağı değişir, tenant sözleşmesi
değişmez. Her iki okuma da tenant audit log'una aktör, şema sürümü ve sağlayıcı/
fallback bilgisiyle yazılır; token, ham yanıt ve PII yazılmaz.
Harici gönderim sağlayıcısı mesajı kendisi gönderir; sonuçları yalnızca
`POST /api/growth/campaigns/:id/events` ile growth anahtarı üzerinden ölçüm olayı
olarak geri yazar. `externalId` kampanya içinde idempotenttir. `opt_out` olayı
yalnız tenant içi müşteri UUID’siyle kabul edilir ve pazarlama iznini kalıcı olarak
kapatır; diğer olaylarda müşteri kimliği kabul edilmez.

## İlk sürümde yapılmayacaklar

- Kafadan sabit dönüşüm yüzdesiyle ciro vaadi
- Laya'nın doğrudan SMS/WhatsApp göndermesi
- İletişim izni olmayan müşterinin segmente alınması
- Tenantlar arası veri veya model bağlamı paylaşımı
- Kanıtsız “şu ürün kesin satar” önerisi

## Tahmin kalitesi kapısı

İlk kampanyalarda yalnız gözlenen metrikler gösterilir. En az üç sonuçlu
kampanya ve yeterli alıcı hacmi oluşmadan model tahmini “veri yetersiz” kalır;
aralık ve güven skoru ancak ölçülen sonuçlardan hesaplanır.

Laya entegrasyonu ayrı bir adaptör olarak tasarlanır. Sağlayıcı yoksa Büyüme
Merkezi segment, kanıt ve taslak üretmeye devam eder; satış akışı etkilenmez.

Laya bağlantısı hazır olana kadar `lib/growth/advisor.ts` içindeki baseline advisor
yalnız gözlenen metriklerden içgörü üretir. Bu fallback hiçbir dönüşüm yüzdesi veya
ciro vaadi uydurmaz; amaç Laya sözleşmesini gerçek sonuç verisi gelene kadar
güvenli biçimde çalışır tutmaktır.

Laya sağlayıcısı `GROWTH_ADVISOR_URL` ve `GROWTH_ADVISOR_TOKEN` ile açılır.
Production’da yalnız HTTPS kabul edilir; istek 5 saniyede zaman aşımına uğrar,
cevap şeması doğrulanır ve başarısızlıkta baseline advisor çalışır. Token ve
ham yanıt loglanmaz.

İlk MVP yalnız `restoran` tenant’larında açıktır; market tenant’ları endpoint’ten
`403 unsupported_vertical` alır. Laya’nın kanıt değerleri sonlu, pozitif ve
sınırlandırılmış sayılar olmalıdır.
