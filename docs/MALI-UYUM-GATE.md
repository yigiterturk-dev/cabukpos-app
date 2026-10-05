# Mali uyum kapısı — ÇabukPOS pilotu

Bu belge ürünün hukuki uygunluk garantisi değildir. İlk pilot işletme açılmadan
önce işletmenin mali müşaviri ve seçilen e-belge/ÖKC sağlayıcısı tarafından
imzalanmalıdır. ÇabukPOS, entegratör ve cihaz onayı olmadan kendi çıktısını
"mali fiş" olarak sunmaz.

## Resmî kaynaklardan doğrulanan sınırlar

- GİB'in YN ÖKC bilgi fişi teknik kılavuzu, e-Arşiv faturası düzenlenen satışta
  işlem anında YN ÖKC'den bilgi fişi düzenlenebilen akışı açıklar. Bu nedenle
  bilgi fişi ile e-Arşiv faturası aynı belge gibi pazarlanmamalıdır: [YN ÖKC
  Bilgi Fişleri Teknik Kılavuzu](https://ynokc.gib.gov.tr/UploadedFiles/Files/bilgi_fisi_teknik_kilavuzu_24072020.pdf).
- GİB'in güncel 483 Sıra No'lu VUK Tebliği, YN ÖKC'nin diğer yazılım sistemleriyle
  entegre çalışabilmesini ve bazı fatura belgelerinin ÖKC dışındaki sistemlerden
  düzenlenebilmesini düzenler; işletmenin hangi akışa tabi olduğu cihaz ve
  mükellefiyet bilgisine göre ayrıca doğrulanmalıdır: [GİB güncel 483 Tebliği](https://ynokc.gib.gov.tr/UploadedFiles/Files/483_SIRA_NOLU_VERGI_USUL_KANUNU_GENEL_TEBLIGI_guncel_27092024.pdf).
- e-Arşiv teknik kılavuzu, e-Arşiv belgesinin teknik alanlarını ve UBL-TR/
  `EARSIVFATURA` profilini tanımlar; sahte sağlayıcı veya yalnızca uygulama içi
  `/f/<token>` görünümü gerçek e-Arşiv yerine geçmez: [GİB e-Arşiv Teknik
  Kılavuzu v1.18](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-Arsiv_Teknik_Kilavuzu_V.1.18.pdf).

## Üründeki güvenli varsayılan

- Bilgi fişi çıktısı "mali değeri yoktur" uyarısıyla ayrıdır.
- Production ortamında sahte e-Arşiv ve sahte ÖKC sağlayıcıları fail-closed'dur.
- Gerçek entegratör/ÖKC bağlantısı olmadan yönetim arayüzü işletmeyi e-Arşiv veya
  mali fiş moduna geçirmez; işletme bilgi fişiyle devam edebilir.
- İade akışı, e-Arşiv satışında tam/kısmi iade için tutanak veya alıcının iade
  faturası gerektiren durumu ayrı izler; bu akış da mali müşavir onayı olmadan
  "tamamlandı" sayılmaz.

## Pilot öncesi imza kapıları

1. İşletmenin mükellefiyetine göre bilgi fişi, e-Arşiv, e-Fatura ve YN ÖKC
   sorumluluğu yazılı olarak belirlendi.
2. Gerçek e-Arşiv entegratörü seçildi; sandbox kesim, iptal, e-posta ve hata/
   yeniden deneme kayıtları saklandı.
3. Gerçek ÖKC üreticisi/entegratörü ve bağlantı sorumluluğu belirlendi; cihazda
   satış, iade, yeniden basım ve bağlantı kesintisi denendi.
4. Termal çıktı üzerinde bilgi fişi, e-Arşiv ve iade tutanağı ayrımı mali müşavir
   tarafından onaylandı.

Bu kapılar kapanmadan ÇabukPOS pazarlama metni yalnızca "POS operasyonu + bilgi
fişi altyapısı" olarak kalır; "yasal mali belge/ÖKC yerine geçer" iddiası
kullanılamaz.
