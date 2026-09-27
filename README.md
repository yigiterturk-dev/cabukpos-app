# ÇabukPOS

Restoran ve market için satış noktası (POS). Çok kiracılı; Postgres FORCE RLS.

```bash
npm install
createdb cabukpos && createdb cabukpos_test
cp .env.example .env.local   # değerleri doldur
npm run db:push && npm run db:rls
npm run db:push:test && npm run db:rls:test
npm test
npm run dev
```

Uygulama `cabukpos_app` rolüyle bağlanır (süper kullanıcı değil, RLS'yi atlamaz); şema işleri `MIGRATE_DATABASE_URL` ile. Tasarım: `docs/superpowers/specs/`, ilerleme: `docs/PROGRESS.md`.
