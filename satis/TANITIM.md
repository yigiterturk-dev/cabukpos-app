# ÇabukPOS — Tek Sayfa Tanıtım

> Bu dosyayı olduğu gibi kopyalayıp gönderebilirsin. Konuşmana gerek yok.

## Tek cümle
İnternet kesilse de satışa devam eden, restoran ve market için satış noktası (POS) yazılımı.

## Ne yapıyor?
- **Kasa:** hızlı satış, karma ödeme, para üstü, bahşiş
- **Çevrimdışı çalışır:** internet gitse bile fiş basılır, bağlantı gelince otomatik eşitlenir
- **Restoran:** masa/adisyon, mutfak ekranı, paket servis, kurye takibi, rezervasyon
- **Market:** barkod, terazi (kg), raf etiketi (EAN-13), stok, reçete, alış/tedarikçi
- **Raporlar:** günlük/haftalık/aylık ciro, personel, kârlılık, müşteri (RFM/kohort), CSV/PDF
- **Donanım:** termal yazıcı, para çekmecesi, barkod okuyucu, terazi (yerel ajan)
- **Çok şubeli:** tek panelden tüm şubeler; şube başına kasa/garson/mutfak tableti
- **QR menü + kiosk:** müşteri telefonundan sipariş
- **Güvenlik:** 2FA, oturum yönetimi, KVKK uyumlu yasal metinler

## Neden farklı?
1. **Çevrimdışı gerçek:** internet kesintisinde satış durmaz (çoğu bulut POS durur).
2. **Tek sistem, iki dikey:** restoran da market de aynı yazılımda; ikinci işletmede yeni yazılım öğrenilmez.
3. **Açık ve taşınabilir:** verin JSON/CSV olarak indirilir; kilitli değilsin.
4. **Her şey dahil fiyat:** masa, mutfak, paket, kurye ekstra modül ücreti yok.

## Durum
- Çalışan ürün, yayında: https://cabukpos-app.vercel.app
- 344 otomatik test, tarayıcı uçtan uca testleri (kasa, restoran, market, offline, iade, mali, abonelik)
- Pilot müşteri aranıyor.

## Fiyat taslağı (env ile ayarlanır, örnek)
| Paket | Aylık | Yıllık |
|---|---|---|
| Temel (1 şube, 1 kasa) | 599 ₺ | 5.990 ₺ |
| Ek şube | 199 ₺ | 1.990 ₺ |
| Ek terminal | 99 ₺ | 990 ₺ |
- **14 gün ücretsiz deneme, kart istenmez.**

## İletişim
- E-posta: [buraya kendi e-postanı yaz]
- WhatsApp: [buraya numaranı yaz]
