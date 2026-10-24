-- PostgreSQL 16+. Maintenance-window migration; see docs/platform-order-scope-migration.md.
-- No rows are deleted or rewritten. Preserve old protection until replacement is valid.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create unique index if not exists tab_events_platform_order_v2_uq
  on tab_events (store_id, (coalesce(payload->'source'->>'platform', '')), (payload->'source'->>'externalId'))
  where type = 'order' and payload->'source'->>'externalId' is not null;
drop index if exists tab_events_platform_order_uq;
commit;
