# İlerleme — ÇabukPOS

Spec: docs/superpowers/specs/2026-09-28-cabukpos-pos-design.md · Planlar: docs/superpowers/plans/2026-09-28-cabukpos-m1-cekirdek-kasa.md, …-m2-cevrimdisi.md, …-m3-market.md
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
PRODUCTION (2026-09-28): Neon projesi `cabukpos` (orange-moon-25841597, org agen, eu-central-1); `cabukpos_app` rolü SQL ile açıldı (neonctl ile açılan rol neon_superuser → BYPASSRLS, kullanma). Vercel env: DATABASE_URL (app rolü) + AUTH_SECRET yenilendi. main'e birleşti, canlı E2E (`BASE=https://cabukpos-app.vercel.app node e2e/m1.mjs`) M1 OK. Şema değişikliğinde sahip URL'si: `npx neonctl connection-string --project-id=orange-moon-25841597`. Sıradaki: M2 (çevrimdışı).

Not: sunucu `node --env-file=.env.local node_modules/.bin/next start -p 3800`; plan kodu `python3 scripts/plan-extract.py <yol>` ile çıkarılır.

## M2 — Çevrimdışı kasa
- [x] Şema `sales.review`, `sales.synced_at`; `lib/sync` (belge şemaları + bulutta uygulama), testli
- [x] `/api/sync/catalog` (içerik özetli katalog + cihaz + açık vardiya), `/api/sync/push` (FIFO, idempotent, 409 eşleme değişti)
- [x] İstemci: Dexie (`lib/offline`), eşitleme motoru (artan bekleme), `KasaApp` (PIN cihazda, vardiya/satış/fiş/gün sonu yerel)
- [x] Service worker `public/sw.js` + ilk yüklemede statik ısıtma; manifest
- [x] E2E `e2e/m2.mjs` → "M2 OK"; `e2e/m1.mjs` yeni akışa uyarlandı → "M1 OK"

**M2 BİTTİ (2026-09-28)** yerelde: npm test 17/17, eslint + tsc temiz, E2E M1 OK + M2 OK.
Kaldırılan: kasiyer çerezi, `/kasa/fis/[id]`, `/kasa/gun-sonu`, `lib/kasa/sale.ts` (hepsi KasaApp + lib/sync'e taşındı).
⚠️ `drizzle-kit push` RLS'yi KAPATIYOR (şemada tanımlı değil) → `db:push`/`db:push:test` artık ardından RLS'yi uyguluyor. Prod'da şema değişikliğinden sonra MUTLAKA `MIGRATE_DATABASE_URL=<sahip> node scripts/db-rls.mjs` + `relrowsecurity` kontrolü.
Sonra (M4+): uygulama simgeleri (kurulabilir PWA için 192/512 png), reddedilen belgeler için yönetim ekranı, `sales.review` listesi.

## M3 — Market (dal `m3-market`, `m2-cevrimdisi` üstünde)
- [x] Saf çekirdek: `lib/core/scan.ts` (EAN-13, terazi etiketi 27/28/29+PLU+gram, `5*` çarpan, kg), `stock.ts` (son sayım mutlak + sonrası), `ean13.ts`, `refund.ts`; gün sonu iadeyi düşer
- [x] Şema: `products.kind/plu/track_stock/quick/price_changed_at/label_printed_at`, `sale_status += iade`, `sales.refund_of/approved_by`, `stock_movements` (RLS)
- [x] Eşitleme: `refund` belgesi (fazla iade / bilinmeyen asıl satış / ödeme farkı / müdür olmayan onay → review), satış/iade stok hareketi, `GET /api/sync/sale?no=`
- [x] Yönetim: ürün formu (tür, PLU, stok takibi, hızlı tuş), `/yonetim/stok` (alış/fire/sayım), `/yonetim/etiketler` (A4 3×8, EAN-13 SVG)
- [x] Kasa: okutma çözümü, elle tartım, market ızgarası = hızlı tuşlar, iade ekranı (kasiyerse müdür PIN'i), iade fişi
- [x] E2E `e2e/m3.mjs` → "M3 OK"; M1 OK + M2 OK

**M3 BİTTİ (2026-09-28)** yerelde: npm test 33/33, eslint + tsc temiz, build, E2E M1 + M2 + M3 OK.
v1 sınırları: terazi etiketi yalnız ağırlık kodlu (fiyat kodlu M4'te gerçek teraziyle); teraziden okuma ve termal etiket M4 (ajan); maliyet M7.
Prod: M2 ile birlikte bekliyor. Sıra: `m2-cevrimdisi` → main, sonra `m3-market` → main. Her şema push'undan sonra `db-rls.mjs` + `relrowsecurity` kontrolü (yeni tablo `stock_movements` dahil).
Açık kalan (M2'den): uygulama simgeleri (192/512 png), yönetimde reddedilen belgeler ve `sales.review` listeleri — iade review'ları da bu listeye düşecek.

## Çalıştırma
- DB: yerel Postgres (`.env.local`: DATABASE_URL uygulama rolü, MIGRATE_DATABASE_URL sahip). Şema `npm run db:push`, RLS `npm run db:rls` (test DB: `db:push:test`, `db:rls:test`).
- E2E: `npm run build` → `node --env-file=.env.local node_modules/.bin/next start -p 3800` → `node --env-file=.env.local e2e/m1.mjs`. Kayıt sınırı IP başına saatte 5 (her koşu 2 kayıt); aşılırsa yerel DB'de `delete from login_attempts where key like 'signup:%'`.
- Gün sonu kapanınca kasiyer oturumu düşer; cihazın son 15 dk içinde kapanan vardiyası /kasa/gun-sonu'da PIN'siz yazdırılabilir.
