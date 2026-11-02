# netcup canlı sunucu

Neon kotası yüzünden 2026-10-29'da Vercel+Neon'dan netcup'a taşındı.

- Kod: `/opt/cabukpos` (`git archive HEAD | ssh netcup 'tar -x -C /opt/cabukpos'`), sırlar `/opt/cabukpos/.env` (0600, Git'te yok).
- DB: host Postgres `cabukpos` (sahip, migration/RLS) + `cabukpos_app` (uygulama, nobypassrls). Her iki rolün `timezone=UTC` (Neon ile aynı).
- Yayın: `cd /opt/cabukpos && docker compose -f ops/netcup/app/docker-compose.yml up -d --build`
- Şema/RLS: `MIGRATE_DATABASE_URL` ile `scripts/db-rls.mjs` (drizzle push sonrası şart).
- Caddy: `/opt/legafetch/caddy/Caddyfile` → `172.18.0.1:3228`; ufw `172.18.0.0/16 → 3228`.
- Cron'lar: `/opt/cron-tetik/tetik.py` (`cabukpos` tabanı).
