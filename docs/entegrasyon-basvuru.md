# Online Sipariş Entegrasyonları — Başvuru Rehberi

> Durum: Uygulama tarafı hazır (webhook + normalizasyon + adisyon akışı).
> Canlı akış için **iki platformun da resmi integratör/partner onayı** gerekiyor.
> Bu belge başvuru sürecini ve teknik hazırlıkları listeler.

---

## 1) Trendyol Go / Uber Eats (Trendyol Yemek + Getir Yemek çatısı)

- **Portal:** https://developers.tgoapps.com
- **Kapsam:** Trendyol Yemek ve Getir Yemek siparişleri bu çatı altında birleşti.
  Uber Eats geçişi sürüyor → sipariş modeli değişiyor; **onaydan önce portal güncellemesini takip et.**
- **Kimler başvurur:** POS/sipariş yazılımları (bizim durumumuz) "integratör" olarak başvurur.
  Tek tek restoranlar değil — restoranlarımız platformda kendi mağazasını açar, siparişler
  entegratör kanalından bize düşer.

### Gerekenler (başvuru paketi)
| Belge / Bilgi | Not |
|---|---|
| Tüzel kimlik | Vergi levhası + imza sirküleri (şahıs şirketi kabul, kurumsal tercih edilir) |
| Vergi kimlik no (VKN) + Mersis | — |
| Banka / IBAN bilgisi | Komisyon/rapor mutabakatı için |
| Şirket e-posta + teknik kişi | Sırf kişisel Gmail ile değil, @cabukpos.com kullan |
| Entegratör profil bilgileri | Şirket adı, logosu, iletişim, hizmet verdiği sektörler |
| **Webhook adresi** | `https://app.cabukpos.com/api/integrations/tgo` (app canlıya alınca) |
| Test ortamı çıktıları | Sipariş alma → KDS'ye düşme → durum güncelleme ekran kayıtları/videoları |
| Güvenlik beyanı | Secret doğrulama, idempotensi, rate limit (kodda hazır) |

### Süreç
1. Portalde "integratör/restoran entegrasyonu" başvuru formu → firma bilgileri
2. Teknik ekip erişimi + sandbox/test anahtarı
3. Uyum testleri: sipariş alma, durum güncelleme (kabul/hazırlanıyor/teslim), iptal senaryosu
4. Menü eşleme örneği + canlıya alma onayı

---

## 2) Yemeksepeti

- **Portal:** https://developer.yemeksepeti.com
- **Kapsam:** Partner API (katalog, sipariş, outlet yönetimi) + POS Partner akışları; sandbox ortamı var.
- **Başvuru:** Portaldeki iş ortağı/POS partner formu → entegrasyon ekibi onayı → sandbox erişimi.

### Gerekenler
Yukarıdaki listeyle aynı + Yemeksepeti'ne özel:
- Sipariş yönetimi kullanım senaryolarının (picking/durum güncelleme) dokümanına göre test çıktıları
- Menü/katalog eşleme tablosu (bizdeki Ürünler ↔ Yemeksepeti ürünleri)

---

## 3) Aksiyon planı

- [ ] **Domain:** `app.cabukpos.com` CNAME → `cname.vercel-dns.com` (DNS panelinde)
- [ ] Kurumsal e-posta kutusu doğrula (başvurularda kullanılacak)
- [ ] TGO portalinden başvuru formunu doldur (belgeler yukarıda)
- [ ] Yemeksepeti partner başvurusunu gönder
- [ ] Onay + sandbox anahtarı gelince: `/entegrasyonlar` sayfasından secret gir → etkinleştir
- [ ] Gerçek örnek payload'ları `tests/integrations.test.ts`'e ekle (alan eşlemeleri birebir doğrulanır)
- [ ] İlk canlı siparişte KDS akışını izle (bekliyor → hazırlandı)

## Teknik notlar (onay gelince kontrol edilecekler)

- TGO: sipariş durum callback'lerinin tam endpoint'i portal dokümanından doğrulanacak
  (`lib/integrations/parse.ts` savunmacı yazıldı; alan adları örnek payload ile teyit edilir)
- Yemeksepeti: Partner API auth akışı (token) + katalog push — portal spec'ine göre tamamlanır
- İki platformda da: iptal/iade akışı ve kesinti (retry/idempotensi) senaryoları test edilecek
