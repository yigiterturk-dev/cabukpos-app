# ÇabukPOS pilot prova formu

Bu form ilk restoran pilotunda teknik akışı kanıtlamak için kullanılır. Repo testleri bu formun yerine geçmez; her kutu gerçek cihaz ve gerçek kullanıcı akışıyla işaretlenir.

## 5 dakikada saha kurulumu (işletmeci için)

**1) Bulut — telefondan, 3 dakika**
1. `cabukpos.com/kayit` → işletme adı + sektör (Restoran/Market) + e-posta + şifre.
2. Yönetim → Ürünler: "Ürün ekle" ile ürünleri gir (ad + fiyat + KDV yeterli).
3. Yönetim → Personel: kasiyere ve müdüre birer PIN ver (4-6 hane; kurye cihazı açılacaksa kurye personeli de).

**2) Kasa — kasadaki tarayıcıdan, 1 dakika**
1. Chrome ile `cabukpos.com/kasa` aç → "Kasa eşlemesini başlat".
2. Yönetim → Cihazlar → "Cihaz ekle" → ekrandaki 8 haneli kodu kasaya yaz.
3. Kasiyer PIN'i ile gir → açılış tutarını yaz → "Vardiyayı aç". Bu kadar; internet kesilse bile kasa çalışmaya devam eder.

**3) Yazıcı / çekmece / terazi — Windows PC varsa, 5 dakika**
1. Yönetim → Donanım → "Ajan ekle" → indirme bağlantısından `cabukpos-agent` kurulumunu çalıştır.
2. Kurulumda eşleme kodunu gir; Donanım ekranında ajan "çevrimiçi" görünür.
3. "+ Yazıcı ekle" → adres (ör. `192.168.1.50:9100`) → kaydet.
4. Sağlama: `node cabukpos-agent.cjs test-print` (fiş), `test-drawer` (çekmece), `test-scale` (terazi).

**4) Garson tableti / mutfak ekranı — her biri 1 dakika**
1. Yönetim → Cihazlar → "Cihaz ekle" → cihaz rolünü seç (Garson tableti / Mutfak ekranı / Kurye telefonu) → kodu tablete yaz.
2. Mutfak PIN'siz açılır; garson ve kurye personel PIN'iyle girer.

**Sorun olursa:** kasa internet olmadan da satış yapar; eşitleme bağlantı gelince kendiliğinden olur. Ekranda "incelenecek" işaretli kayıt görürsen destekle paylaş — veri kaybı değil, inceleme demektir.

## Kurulum

- [ ] İşletme adı, dikey ve şube bilgisi girildi
- [ ] En az 5 ürün ve doğru KDV oranları girildi
- [ ] Kasiyer/müdür PIN'leri oluşturuldu
- [ ] Kasa cihazı eşlendi
- [ ] Windows ajanı kuruldu ve Donanım ekranında çevrimiçi göründü
- [ ] Chrome yerel ağ erişimi verildi
- [ ] Termal yazıcıdan Türkçe deneme fişi çıktı (`node cabukpos-agent.cjs test-print`)
- [ ] Para çekmecesi açıldı (`node cabukpos-agent.cjs test-drawer`)
- [ ] Terazi varsa kararlı okuma alındı (`node cabukpos-agent.cjs test-scale`) ve ağırlıklı ürün satışı denendi (market pilotu)
- [ ] Barkod okuyucu kasada ürünü bulup satıra düşürdü

## Satış akışı

- [ ] Yoğunluk öncesi açılış tutarı girildi
- [ ] Nakit satış ve para üstü doğrulandı
- [ ] Kart satışında doğru toplam doğrulandı
- [ ] Restoransa masa/adisyon → mutfak → tahsilat akışı doğrulandı
- [ ] İade ve müdür onayı doğrulandı
- [ ] Gün sonu sayımı ve fark raporu doğrulandı

## Kopuk internet provası

- [ ] Satıştan önce internet kesildi
- [ ] Çevrimdışı satış yapıldı ve fiş alındı
- [ ] Tarayıcı yenilense de bekleyen satış korundu
- [ ] İnternet geri geldiğinde satış tek kez eşitlendi
- [ ] Yönetim raporu ile kasa fişi toplamı karşılaştırıldı

## Kapanış kanıtı

- [ ] CSV veri export alındı
- [ ] Backup alındı ve dosya doğrulandı
- [ ] Hata/alert logları kontrol edildi
- [ ] İşletme sahibi 3 iş günü kullanım sonrası kabul verdi

Pilot tarihi: ____________________

İşletme: _________________________

Sorumlu: _________________________

Notlar / açık riskler: _________________________________________________
