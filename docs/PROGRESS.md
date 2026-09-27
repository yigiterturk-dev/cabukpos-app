# İlerleme — ÇabukPOS

Spec: docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md · Plan: docs/superpowers/plans/2026-09-28-cabukpos-m1-cekirdek-kasa.md
Eski (YanındaPOS tabanlı) kod: git etiketi `yanindapos-tabanli-v0`. Bu dal (`pos-cekirdek`) main'e, production kurulumu (Neon rolü + env) kararlaştırılınca birleşir.

## M1 — Çekirdek + kasa
- [x] T1 İskelet + test düzeni
- [x] T2 Para ve sepet çekirdeği
- [x] T3 Ödeme + vardiya özeti
- [x] T4 PIN + cihaz jetonları
- [x] T5 Şema + RLS + withTenant
- [x] T6 Kayıt, giriş, proxy
- [x] T7 Ürün/kategori yönetimi
- [x] T8 Personel PIN + cihaz eşleme
- [~] T9 Kasa: eşleme, PIN, vardiya açma — kod yazıldı (tsc/lint temiz), tarayıcıda DENENMEDİ
- [~] T10 Satış ekranı + idempotent satış — recordSale testli (2/2); ekran yazıldı, tarayıcıda DENENMEDİ
- [ ] T11 Bilgi fişi (/kasa/fis/[id]), gün sonu (/kasa/gun-sonu; closeShiftAction + loadShiftSummary HAZIR), /yonetim/raporlar, E2E e2e/m1.mjs (planda tam kod) — KALAN

Not: sunucu `node --env-file=.env.local node_modules/.bin/next start -p 3800`; plan kodu `python3 scripts/plan-extract.py <yol>` ile çıkarılır.
