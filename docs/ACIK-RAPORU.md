# ÇabukPOS açık raporu — 61 madde iş kuyruğu (2026-10-02)

En iyi POS (Adisyo/Menulux/Square sınıfı) ile kıyas sonucu. **Kural:** yukarıdan aşağı,
kendi alanına düşen ilk açık `[ ]`'i al → yap → commit → `[x]` + sha yaz → sıradakine geç.
Sahip sütunu öneridir; çakışmayı panodaki sahiplik tablosu çözer. Durum: `[x]` bitti, `[~]` başlandı.

## P0 — Satışa çıkış için zorunlu

- [ ] 18 | Mali | ÖKC/ETMOS mali cihaz entegrasyonu; fişler yasal mali belge değil | Mali müşavir + ajan
- [ ] 17 | Mali | Gerçek e-Arşiv entegratörü (Foriba/Uyumsoft/Paraşüt) sandbox+canlı | İnsan hesabı + ajan
- [ ] 11 | Faturalama | PayTR otomatik yenileme / kayıtlı kart — [ENGEL: PayTR kart saklama sözleşmesi (insan) + `tenants.cardToken` kolonu (müdür)] | Lead
- [x] 12 | Faturalama | ~~Başarısız ödeme dunning akışı~~ ✅ gecikme 1/3/5. gün + kilit + haftalık e-posta akışı
- [ ] 57 | Ops | Sentry/APM iskeleti + uptime izleme | Müdür
- [ ] 33 | Büyüme | Sadakat programı, hediye kartı, kupon motoru (şema+UI) | Ajan-1+Lead
- [ ] 32 | Büyüme | Gerçek SMS (Netgsm/İletimerkezi) + WhatsApp gönderim sağlayıcısı | İnsan hesabı + ajan
- [ ] 44 | Panel | Şube oluşturma/geçiş UI + şube bazlı veri kapsamı | Ajan-1
- [x] 1 | Güvenlik | ~~2FA (TOTP)~~ ✅ `lib/auth/totp.ts` + `/yonetim/guvenlik` sayfası + giriş akışı kod doğrulama
- [x] 4 | Güvenlik | ~~Kayıtta e-posta doğrulama~~ ✅ `/dogrula` sayfası + kayıtta otomatik e-posta + panel banner'ı + yeniden gönderme
- [x] 13 | Faturalama | ~~Katmanlı planlar (şube/terminal başına fiyat)~~ ✅ taban 1 şube + 1 terminal dahil, ek birim env'den; ödeme anı şube/terminal fotoğrafı (`billing_payments.stores/devices`) (`a56d184`)
- [ ] 14 | Faturalama | Abonelik e-Arşiv faturası (SaaS kendi faturası) | Lead
- [ ] 15 | Faturalama | Abonelik iptal/iade akışı | Lead
- [ ] 28 | Platform | Getir/Yemeksepeti gerçek API bağlantısı (sandbox driver hazır) | İnsan hesabı + Ajan-1

## P1 — Rekabet gücü

- [ ] 2 | Güvenlik | CSRF koruması (server action'lara token) | Lead
- [ ] 3 | Güvenlik | Kayan oturum yenileme + aktivite rotasyonu | Lead
- [ ] 7 | Güvenlik | JWT audience'ları için ayrı anahtarlar | Lead
- [ ] 8 | Güvenlik | Hassas işlemde re-auth; cihaz oturumu rotasyonu | Lead
- [ ] 9 | Güvenlik | Aktif oturum listesi + tüm cihazlardan çıkış | Lead
- [ ] 10 | Güvenlik | API rotaları için merkezi auth guard (middleware genişletme) | Lead
- [ ] 16 | Faturalama | Çoklu para birimi altyapısı | Lead
- [ ] 19 | Mali | B2B e-Fatura zarf akışı + GİB durum sorgulama | Lead
- [ ] 20 | Mali | Logo/Mikro/Paraşüt muhasebe export + e-Defter | Ajan-1
- [ ] 21 | Ops | ~~Fiscal backlog escalation~~ ✅ (cron 6 saate çekildi)
- [ ] 22 | Offline | Yönetim paneli offline + Background Sync | Ajan-1
- [ ] 23 | Offline | Sekme kapalıyken outbox boşaltımı (periodic wake) | Lead
- [ ] 24 | Offline | Cihaz re-pair'de veri kaybı UX düzeltmesi | Lead
- [ ] 25 | Offline | Fiş çakışması çözüm politikası | Lead
- [ ] 26 | Offline | 14 gün prune + push-crash dayanıklılığı | Lead
- [ ] 27 | Sync | Bulut→istemci gerçek zamanlı push (SSE/poll) | Ajan-1
- [ ] 29 | Platform | Menü/fiyat/stok marketplace'e geri push | Ajan-1
- [ ] 30 | Platform | Webhook URL kimliklendirme iyileştirme | Ajan-1
- [ ] 31 | Entegrasyon | Muhasebe/ERP/e-ticaret bağlantıları | Müdür
- [ ] 34 | Büyüme | Pazarlama izin çıkışı gerçek sağlayıcıya bağlama | Ajan-1
- [ ] 35 | Büyüme | Advisor'a tahmin/ML katmanı | Müdür
- [ ] 36 | Yazıcı | ESC/POS logo/raster + barkod + çok marka | Lead
- [ ] 37 | Ön yüz | QR menü, self-order kiosko, müşteri ekranı | Ajan-1
- [ ] 38 | Ön yüz | Nakit satışta e-makbuz/SMS fişi | Lead
- [ ] 39 | Teslimat | Kurye takibi (GPS/ETA veya durum zaman çizelgesi) | Ajan-1
- [ ] 40 | Rapor | Kohort/retansiyon, RFM, tahmin, gün dilimi | Müdür
- [ ] 41 | Rapor | Zamanlanmış/e-posta rapor + PDF/Excel export | Ajan-1
- [ ] 42 | Rapor | Muhasebe formatlarında export (bkz. 20) | Ajan-1
- [ ] 43 | Rapor | Çok şubeli konsolide rapor | Müdür
- [ ] 45 | Panel | i18n altyapısı (TR/EN) | Ajan-1
- [ ] 46 | Panel | Bildirim merkezi + dark mode + tercihler | Ajan-1
- [ ] 47 | Panel | PWA tamamlama (install prompt, yonetim offline) | Ajan-1
- [ ] 48 | Kasa | Para kırılımı sayımı + safe-drop akışı | Lead

## P2 — Olgunluk

- [ ] 49 | Şema | Rezervasyon, masa birleştirme, bahşiş | Ajan-1
- [ ] 50 | Şema | Fiyat listesi / happy hour | Lead
- [ ] 51 | Stok | Sayım oturumu (sapma onayı) + zayi raporu | Lead
- [ ] 52 | Teslimat | Mesafe bazlı ücret + saat dilimleri | Ajan-1
- [ ] 54 | Kalite | CI-standardı E2E + mobil viewport testleri | Müdür
- [ ] 55 | Güvenlik | RLS'siz tablolara DB seviyesinde koruma | Müdür
- [ ] 60 | Pazar | Onboarding sihirbazı + yardım merkezi + kullanıcı dokümanı | Ajan-1
- [ ] 61 | Pazar | Fiyatlandırma sayfası | Lead

## Tamamlananlar (bu dalda)

- [x] 5, 6 — HIBP sızma şifre kontrolü + hesap kilitleme (`31d8e06`)
- [x] 56 — Kök + yonetim error/loading iskeletleri
- [x] 58 — Haftalık CI restore provası job'ı
- [x] 59 — robots.txt + sitemap + launch noindex kapısı
- [x] 21 — Fiscal backlog alarmı + cron 6 saat (`backlogAlarm`)
- [x] 1, 4 (ön hazırlık) — `users.emailVerifiedAt` + `users.totpSecret` şema
- [x] 28 (ilk adım) — Getir/Yemeksepeti sandbox adaptör arayüzü
- [x] 53 (kısmi) — auth/platform/schema birim testleri
