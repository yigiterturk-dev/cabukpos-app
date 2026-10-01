# ÇabukPOS

Restoran ve market için satış noktası (POS). Çok kiracılı; Postgres FORCE RLS.

```bash
npm ci
createdb cabukpos && createdb cabukpos_test
cp .env.example .env.local   # değerleri doldur
npm run db:push && npm run db:rls
npm run db:push:test && npm run db:rls:test
npm test
npm run dev
```

Uygulama `cabukpos_app` rolüyle bağlanır (süper kullanıcı değil, RLS'yi atlamaz); şema işleri `MIGRATE_DATABASE_URL` ile. Tasarım: `docs/superpowers/specs/`, ilerleme: `docs/PROGRESS.md`.

Production doğrulama kapısı: `npm test`, `npm run qa:static`, `npm run build`.
Build, CI ve yerel doğrulamada aynı sonucu almak için Webpack ile sabitlenmiştir.
Yerel production E2E için build sonrası çalışan bir production sunucusuna karşı `BASE=http://localhost:3800 npm run e2e:critical` çalıştırın.
GitHub Actions aynı kapıları temiz bir PostgreSQL 16 üzerinde çalıştırır; operasyon ve rollback notları `docs/OPERATIONS.md` içindedir.
