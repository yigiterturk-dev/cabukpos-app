# ÇabukPOS pilot prova formu

Bu form ilk restoran pilotunda teknik akışı kanıtlamak için kullanılır. Repo testleri bu formun yerine geçmez; her kutu gerçek cihaz ve gerçek kullanıcı akışıyla işaretlenir.

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
