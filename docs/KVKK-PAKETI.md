# KVKK paketi — veri envanteri, avukat brief'i ve taslaklar

> **Hukuki görüş değildir.** Bu dosya avukata verilecek bilgiyi ve taslak iskeleti toplar.
> Yayına almadan önce KVKK/teknoloji avukatı onayı gerekir. Şablonu olduğu gibi kullanma.

## 1. Roller

| Taraf | Rol | Kapsam |
|---|---|---|
| ÇabukPOS (satıcı) | Veri sorumlusu | Kendi müşteri adayları, hesap sahipleri, pazarlama listesi, site/uygulama günlükleri |
| İşletme (müşteri) | Veri sorumlusu | Kendi son müşterileri, personeli, satış/fatura verileri |
| ÇabukPOS | Veri işleyen | İşletmenin POS verisini yalnız hizmet için işler |
| Alt işleyenler | Veri işleyen | Vercel, Neon, Resend, PayTR, alan adı/ağ sağlayıcısı |

## 2. Veri envanteri (avukata verilecek tablo)

| Veri | Kimin | Amaç | Nerede | Saklama |
|---|---|---|---|---|
| Ad, e-posta, şifre özeti | Hesap sahibi | Kayıt, giriş, güvenlik | Neon (users) | Hesap açık + 30 gün |
| Telefon | Hesap sahibi (kartlı ödeme) | Ödeme doğrulama, destek | Neon / PayTR | Hesap + 30 gün |
| İşletme adı, VKN, vergi dairesi, adres | Hesap sahibi | Fatura, e-Arşiv | Neon | 10 yıl (mali) |
| Abonelik/ödeme kayıtları | Hesap sahibi | Tahsilat, mutabakat, iade | Neon + PayTR | 10 yıl (mali) |
| Oturum/IP/user-agent | Hesap sahibi | Güvenlik, oturum iptali | Neon (sessions) | 2 yıl |
| Denetim kayıtları (audit_log) | İşletme | İzlenebilirlik, iade/onay kanıtı | Neon | 2 yıl önerilir |
| Personel adı + PIN özeti | İşletme | Kasa girişi, yetki | Neon | İşletme silene kadar |
| Son müşteri ad/telefon/adres/not | İşletme | Sipariş, teslimat, sadakat | Neon | İşletme silene kadar |
| Satış, ürün, stok, fiş | İşletme | POS işleyişi, rapor | Neon + cihaz IndexedDB | 10 yıl (mali) |
| Pazarlama izni + tarih/kaynak | Son müşteri | Pazarlama SMS/WhatsApp | Neon | İzin geri alınınca sil |
| Pazarlama kampanya hedefleri | Son müşteri | Kampanya gönderimi | Neon (growth_recipient_refs) | Kampanya + 30 gün |
| Hata/telemetri | Hesap sahibi | Hata ayıklama | Vercel/Neon (opsiyonel OTLP) | 30–90 gün |
| Yedekler | Hepsi | Felaket kurtarma | Şifreli yedek deposu | 30 gün |
| Çerez: cz_session, cz_device | Hesap sahibi | Oturum, cihaz eşleme | Tarayıcı | Oturum/cihaz ömrü |

**Özel nitelikli veri işlenmiyor** (sağlık, biyometri, din, sendika vb.). Yalnız mali kayıtta VKN/TCKN olabilir; işletme sağlıyorsa aydınlatmada belirt.

## 3. Alt işleyen listesi

| Sağlayıcı | Hizmet | Konum | Not |
|---|---|---|---|
| Vercel Inc. | Barındırma/CDN | ABD/AB | Yurt dışı aktarım |
| Neon Inc. | PostgreSQL | ABD/AB | Yedekler şifreli |
| Resend | İşlem e-postası | ABD | Yalnız gerekli alıcı |
| PayTR | Ödeme | Türkiye | Kart verisi bize gelmez |
| Cloudflare / registrar | DNS, e-posta kayıtları | ABD/AB | Trafik meta verisi |
| İşletmenin seçtiği entegratör | e-Arşiv/e-Fatura | Türkiye | İşletme sorumlu |

Avukata sor: yurt dışı aktarım için **standart sözleşme** mi, taahhütname mi; hangi sağlayıcılar için ayrıca bildirim gerekir.

## 4. Avukat brief'i — sorulacaklar

1. Mevcut `/yasal/kvkk` metni aydınlatma + gizlilik için yeterli mi; veri sorumlusu/veri işleyen ayrımı doğru mu?
2. **VERBİS** kaydı bu ölçekte gerekli mi (çalışan sayısı, mali bilanço, özel nitelikli veri)?
3. Yurt dışı aktarım (Vercel/Neon/Resend) için hangi araç seçilmeli; metne nasıl yazılmalı?
4. Müşteriyle imzalanacak **DPA** ve son müşteri **aydınlatma metni** taslağı.
5. Pazarlama SMS/WhatsApp için **açık rıza** ayrımı; hizmet SMS'i (fiş, sipariş durumu) rıza gerektirir mi?
6. İhlal bildirimi (72 saat), veri sahibi başvurusu ve silme süreçleri.
7. Saklama süreleri: satış 10 yıl, log 2 yıl, pazarlama izni, yedek 30 gün yeterli mi?
8. İşletme kapanınca veri silme/anonimleştirme ve mali kayıt istisnası nasıl işlenecek?

## 5. DPA taslak iskeleti (avukat dolduracak)

1. **Taraflar:** ÇabukPOS (işleyen) / İşletme (sorumlu), vergi bilgileri, iletişim.
2. **Konu ve süre:** Hizmet süresi boyunca POS verisinin işlenmesi.
3. **Talimat:** İşletme yalnız hizmet için işleme talimatı verir; ÇabukPOS talimat dışı işlemez.
4. **Gizlilik:** Personel gizlilik taahhüdü; erişim en az yetki.
5. **Güvenlik:** Şifreleme, RLS, erişim günlüğü, yedek şifreleme, sızma testi/denetim.
6. **Alt işleyenler:** Liste ekte; değişiklikte önceden bildirim; işletmenin itiraz hakkı.
7. **Yurt dışı aktarım:** Standart sözleşme/taahhüt; aktarım ülke ve alıcı listesi.
8. **Veri sahibi talepleri:** İşletmeye destek; makul süre; ücret.
9. **İhlal:** 72 saat içinde bildirim; etki, alınan önlem, iletişim.
10. **İade/silme:** Sözleşme sonunda veri dışa aktarma + silme/anonimleştirme; mali saklama istisnası.
11. **Denetim:** Yıllık öz değerlendirme; işletmenin makul denetim hakkı.
12. **Sorumluluk ve süre:** KVKK md. 12 kapsamı; alt işleyen sorumluluğu.
13. **Ekler:** Alt işleyen listesi, teknik-idari tedbirler, veri kategorileri.

## 6. İşletme → son müşteri aydınlatma taslağı (QR menü/SMS)

Başlıklar yeterli; avukat cümleleri yazacak:

- Veri sorumlusu: **[işletme adı, adres, e-posta]**
- İşlenen veri: ad, telefon, adres, sipariş, sadakat notu
- Amaç: siparişin alınması, teslimat, fiş/fatura, sadakat
- Hukuki sebep: sözleşmenin ifası; mali kayıt için hukuki yükümlülük
- Aktarım: kurye, ödeme kuruluşu, e-Arşiv entegratörü, ÇabukPOS (veri işleyen)
- Saklama: mali kayıt 10 yıl; pazarlama izni geri alınınca silinir
- Haklar: KVKK md. 11; başvuru e-postası
- Pazarlama: yalnız açık rıza ile; her mesajda çıkış linki

Bu metni işletme kendi adına yayınlar. ÇabukPOS panelinde **şablon** olarak sunulabilir; sorumluluk işletmede kalır.

## 7. Uygulama kontrol listesi

- [ ] `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_TAX_OFFICE`, `LEGAL_TAX_ID`, `LEGAL_EMAIL`, `LEGAL_PHONE`, `LEGAL_KEP` env'leri dolu (şu an boş → sayfalarda `[şirket kuruluşunda eklenecek]`)
- [ ] Avukat onaylı metinler `/yasal/*` sayfalarına işlendi, `LEGAL_UPDATED` tarihi güncellendi
- [ ] Her pilot müşteriyle DPA imzalandı (PDF arşivi)
- [ ] Kayıt formunda aydınlatma + kullanım koşulları linki var
- [ ] QR menüde işletme aydınlatma linki/alanı var
- [ ] Pazarlama SMS/WhatsApp yalnız `marketingConsent` + çıkış linkiyle
- [ ] Veri sahibi başvuru e-postası ve 30 gün yanıt süreci tanımlı
- [ ] İhlal müdahale planı: tespit → 72 saat bildirim → etki analizi → düzeltme
- [ ] Yedeklerin şifreli ve 30 günde silindiği kanıtlı
- [ ] VERBİS kararı avukat tarafından yazılı
