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

İlk entegrasyon yüzeyi `GET /api/growth/feature-pack` uç noktasıdır. Bu uç yalnız
oturumlu yöneticiye açıktır, `Cache-Control: no-store` döner ve PII yerine sayısal
tenant özeti verir. Harici Laya adaptörü bu uçtan aldığı veriyi başka tenantlarla
birleştirmeden önce ayrıca anonim/toplu benchmark kurallarını uygular.

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
