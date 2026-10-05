# ÇabukPOS yerel ajanı

Kasadaki bilgisayarda çalışır; fiş yazıcısını, para çekmecesini ve teraziyi kasaya (tarayıcı) açar. Fişin içeriğini kasa üretir (ESC/POS baytı), ajan yalnız iletir.

## Kurulum (Windows)
1. Node.js LTS kur (nodejs.org).
2. Yönetim → Donanım → "Ajan ekle" → eşleme kodu.
3. Aynı sayfadaki **Windows kurulum betiğini indir** bağlantısını çalıştırın; betik ajanı indirir, eşler ve oturum açılışına ekler.
4. Betik kullanılamıyorsa manuel olarak `cabukpos-agent.cjs` indirip `node cabukpos-agent.cjs pair KOD` ve `node cabukpos-agent.cjs install` komutlarını çalıştırın.
5. Donanım'da yazıcıyı tanımla (bir dakika içinde ajana iner), `node cabukpos-agent.cjs test-print` ile Türkçe deneme fişi.

Mac/Linux: aynı komutlar; `install` yok, `node cabukpos-agent.cjs run` servis yöneticisine eklenir.

## Yazıcı bağlantıları
| Tür | Adres | Not |
|---|---|---|
| Ağ | `192.168.1.50` ya da `…:9100` | Ethernet/Wi-Fi termal yazıcı |
| Windows paylaşımı | paylaşım adı (ör. `XP80`) | USB yazıcıyı Windows'ta paylaş → `copy /b` ile ham bayt |
| CUPS | yazıcı adı | `lp -o raw` |
| Aygıt dosyası | `/dev/usb/lp0` | Linux USB |

Türkçe karakter: PC857 (`ESC t 13`, XPrinter/Epson). Bozuk çıkarsa "Türkçesiz" seç. Çekmece yazıcının RJ11 çıkışına bağlıdır (`ESC p 0 25 250`).

## Terazi
Seri port (`COM3`, 9600) ya da ağ (IP:port). İstek: ENQ (çoğu CAS/Dibal ECR modu), `W`, ya da sürekli gönderen terazi. Yanıt `ST,GS,+ 0.750kg` / `0.750 kg` / `750 g` biçimlerinden çözülür; `US` kararsız sayılır.

## Güvenlik
- Ajan ↔ bulut: ajan jetonu (Bearer). Eşleme kodu tek kullanımlık, 15 dk.
- Kasa ↔ ajan: bulutun `hubKey` ile imzaladığı bilet (30 gün, her katalog çekişinde yenilenir); ajan çevrimdışı doğrular. İptal edilen cihazlar heartbeat'le iner. CORS yalnız bulut kökeni.
- Ajan yalnız `127.0.0.1`'i dinler (http; tarayıcılar localhost'u güvenli sayar). LAN'dan (tablet, ikinci kasa) erişim için sertifika gerekir.

## LAN sertifikası (tablet / ikinci kasa)
Ajan `<id>.lan.cabukpos.com` için Let's Encrypt DNS-01 sertifikası alır; DNS kayıtlarını bulut yazar (`/api/agent/dns`, yalnız ajanın kendi adı). Gerekenler (bulut env): `CF_API_TOKEN` (Zone.DNS edit) + `CF_ZONE_ID` — cabukpos.com DNS'i Cloudflare'de olmalı. Yoksa 501 → ajan yalnız localhost'ta çalışır. Sertifika varsa https `port+1`'de (17655) açılır. LE sınırı: kayıtlı alan adı başına haftada 50 yeni sertifika.
