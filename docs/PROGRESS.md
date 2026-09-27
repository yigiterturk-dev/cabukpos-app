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
- [x] T9 Kasa: eşleme, PIN, vardiya açma (E2E ile tarayıcıda doğrulandı)
- [x] T10 Satış ekranı + idempotent satış (E2E: karma ödeme, para üstü)
- [x] T11 Bilgi fişi 80 mm (/kasa/fis/[id]), gün sonu (/kasa/gun-sonu), /yonetim/raporlar (+ayrıntı), E2E e2e/m1.mjs → "M1 OK"

**M1 BİTTİ (2026-09-28).** Kapanış kapısı: npm test 12/12, eslint + tsc temiz, E2E M1 OK (yerel DB).
Sıradaki: production kurulumu kararı (Neon `cabukpos_app` rolü + env) → main'e birleştirme; sonra M2 (çevrimdışı).

Not: sunucu `node --env-file=.env.local node_modules/.bin/next start -p 3800`; plan kodu `python3 scripts/plan-extract.py <yol>` ile çıkarılır.

## Çalıştırma
- DB: yerel Postgres (`.env.local`: DATABASE_URL uygulama rolü, MIGRATE_DATABASE_URL sahip). Şema `npm run db:push`, RLS `npm run db:rls` (test DB: `db:push:test`, `db:rls:test`).
- E2E: `npm run build` → `node --env-file=.env.local node_modules/.bin/next start -p 3800` → `node --env-file=.env.local e2e/m1.mjs`. Kayıt sınırı IP başına saatte 5 (her koşu 2 kayıt); aşılırsa yerel DB'de `delete from login_attempts where key like 'signup:%'`.
- Gün sonu kapanınca kasiyer oturumu düşer; cihazın son 15 dk içinde kapanan vardiyası /kasa/gun-sonu'da PIN'siz yazdırılabilir.
