# ÇabukPOS + Büyüme Merkezi

## Ürün sınırı

ÇabukPOS restoranın operasyon omurgasıdır: satış, masa, paket, stok, personel
ve müşteri verisinin kiracıya ait kaynağıdır. Büyüme Merkezi ayrı satılan bir
hizmettir: bu veriyi müşteri geri kazanımı ve ciro artışı için aksiyona çevirir.

POS içindeki `/yonetim/buyume` sayfası ürünün teaser ve aktivasyon kapısıdır.
Kasiyer ekranına kampanya karmaşası eklenmez.

## İlk ücretli paket

- **Geri kazanım:** 30/60/90 gündür sipariş vermeyen müşteri segmentleri.
- **Kampanya:** tek kullanımlık teklif, kanal, başlangıç/bitiş ve izin kaydı.
- **Gönderim:** WhatsApp/SMS/e-posta sağlayıcısı adaptörleri; sağlayıcı yoksa gönderim yok.
- **Ölçüm:** kampanya kodu veya takip bağlantısıyla sipariş, ciro ve maliyet.
- **Öneri:** tekrar sipariş, sepet büyütme ve düşük performanslı ürün fırsatları.

## Mimari sözleşme

- Kaynak gerçeklik ÇabukPOS veritabanıdır; Büyüme Merkezi tenant kimliğini
  kendisi üretmez.
- Büyüme servisi yalnız gerekli alanları alır: müşteri kimliği, izin durumu,
  telefon/e-posta, son sipariş zamanı, sipariş toplamı ve kampanya sonucu.
- Her sorgu ve gönderim tenant sınırıyla korunur; müşteri verisi tenantlar
  arasında karşılaştırılmaz.
- Gönderimler idempotent, rate-limit'li ve audit log'ludur.
- KVKK iletişim izni yoksa pazarlama gönderimi yapılmaz; opt-out kalıcıdır.
- POS bağlantısı kesilse bile satış sürer; Büyüme Merkezi senkronizasyonu
  gecikir, satış akışını kilitlemez.

## Başarı ölçütleri

- Pilot işletmede 30 gün içinde geri kazanılan müşteri sayısı
- Kampanya başına ek ciro ve net katkı
- Tekrar sipariş oranı ve ortalama sepet değişimi
- Gönderim başına maliyet ve opt-out oranı

İlk sürümde tam otomatik kampanya göndermek yerine segment + taslak + ölçüm
ile başlanır. Gerçek gönderim sağlayıcısı ve yasal izin doğrulanmadan açılmaz.
