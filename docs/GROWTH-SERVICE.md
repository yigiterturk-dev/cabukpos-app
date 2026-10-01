# ÇabukPOS + Büyüme Merkezi

## Ürün sınırı

ÇabukPOS restoranın operasyon omurgasıdır: satış, masa, paket, stok, personel
ve müşteri verisinin kiracıya ait kaynağıdır. Büyüme Merkezi ayrı satılan bir
hizmettir: bu veriyi müşteri geri kazanımı ve ciro artışı için aksiyona çevirir.

POS içindeki `/yonetim/buyume` sayfası ürünün teaser ve aktivasyon kapısıdır.
Kasiyer ekranına kampanya karmaşası eklenmez.

## İlk ücretli paket — doğrulanmış MVP kapsamı

- **Geri kazanım:** 30 gündür gelmeyenler, son 30 günde aktif olanlar ve tüm izinli
  müşteriler. 60/90 gün segmentleri sonraki ürün kapısıdır.
- **Kampanya:** tenant içinde taslak adı, mesajı ve segmenti; gönderim kapalıdır.
  Kanal, başlangıç/bitiş ve otomatik zamanlama henüz satış vaadi değildir.
- **Gönderim:** signed webhook ve provider sözleşmesi hazırdır; WhatsApp/SMS/e-posta
  adaptörü, sandbox provası ve açık işletme onayı olmadan hiçbir mesaj gönderilmez.
- **Ölçüm:** idempotent sent/delivered/converted/failed/opt_out olayları,
  anahtarlı recipientRef ve kampanya ciro metrikleri.
- **Öneri:** yalnız gözlenen feature-pack verisine dayalı baseline/Laya içgörüsü;
  kanıtsız ek ciro veya dönüşüm garantisi verilmez.

## Mimari sözleşme

- Kaynak gerçeklik ÇabukPOS veritabanıdır; Büyüme Merkezi tenant kimliğini
  kendisi üretmez.
- Büyüme API'si yalnız gerekli PII'siz özetleri ve sağlayıcı eşleştirmesi için
  growth anahtarıyla üretilmiş hmac-sha256 recipientRef değerlerini alır; ham
  telefon, e-posta, ad ve müşteri UUID'si harici API'ye çıkmaz.
- Her sorgu ve gönderim tenant sınırıyla korunur; müşteri verisi tenantlar
  arasında karşılaştırılmaz.
- Gönderimler idempotent, rate-limit'li ve audit log'ludur.
- KVKK iletişim izni yoksa pazarlama gönderimi yapılmaz; opt-out kalıcıdır.
- İzin değişiklikleri eski/yeni durum, kaynak ve aktörle tenant audit log'una yazılır.
- POS bağlantısı kesilse bile satış sürer; Büyüme Merkezi senkronizasyonu
  gecikir, satış akışını kilitlemez.

## Başarı ölçütleri

- Pilot işletmede 30 gün içinde geri kazanılan müşteri sayısı
- Kampanya başına ek ciro ve net katkı
- Tekrar sipariş oranı ve ortalama sepet değişimi
- Gönderim başına maliyet ve opt-out oranı

İlk sürümde tam otomatik kampanya göndermek yerine segment + taslak + ölçüm
ile başlanır. Gerçek gönderim sağlayıcısı, staging smoke kanıtı, açık işletme
onayı ve yasal izin doğrulanmadan açılmaz.
