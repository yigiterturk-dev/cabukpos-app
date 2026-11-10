-- PostgreSQL 16+, additive migration: dış ödeme özeti (YanındaPOS → ÇabukPOS).
-- Yeni ve boş tablo; mevcut satış/fiş/ödeme kayıtlarına dokunmaz. Mali belge üretmez.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists external_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  source text not null,
  external_id text not null,
  amount integer not null,
  currency text not null default 'TRY',
  method text not null default 'other',
  paid_at timestamptz not null,
  reference text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists external_payments_idempotency_uq on external_payments (tenant_id, source, external_id);
create index if not exists external_payments_tenant_idx on external_payments (tenant_id, paid_at);
alter table external_payments enable row level security;
alter table external_payments force row level security;
drop policy if exists tenant_isolation on external_payments;
create policy tenant_isolation on external_payments using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on external_payments to cabukpos_app;
commit;
