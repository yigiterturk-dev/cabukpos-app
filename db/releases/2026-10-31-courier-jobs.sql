-- PostgreSQL 16+, additive migration: yeni boş tablo; mevcut verilere dokunmaz.
-- Eski uygulama sürümleri bu tabloyu kullanmaz.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists courier_jobs (
  tenant_id uuid not null references tenants(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  tab_id uuid not null,
  provider text not null,
  status text not null,
  courier_name text,
  eta_minutes integer,
  collection_minor integer,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, tab_id)
);
create index if not exists courier_jobs_store_idx on courier_jobs (store_id, updated_at desc);
alter table courier_jobs enable row level security;
alter table courier_jobs force row level security;
drop policy if exists tenant_isolation on courier_jobs;
create policy tenant_isolation on courier_jobs using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on courier_jobs to cabukpos_app;
commit;
