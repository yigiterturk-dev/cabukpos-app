-- PostgreSQL 16+; additive release. Run with db/rls.sql in ONE transaction:
-- psql "$RELEASE_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
--   -f db/releases/2026-10-24-hq-stock.sql -f db/rls.sql
-- Apply before deploying the application. No DROP, DELETE or data backfill.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Existing production restores can predate branch-specific kitchen routing.
-- These tables must exist before the current RLS script references them.
create table if not exists public.category_station_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint category_station_routes_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  store_id uuid not null constraint category_station_routes_store_id_stores_id_fk references public.stores(id) on delete cascade,
  category_id uuid not null constraint category_station_routes_category_id_categories_id_fk references public.categories(id) on delete cascade,
  station_id uuid constraint category_station_routes_station_id_stations_id_fk references public.stations(id) on delete set null
);
create unique index if not exists category_station_routes_store_category_uq on public.category_station_routes(store_id, category_id);
create table if not exists public.product_station_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint product_station_routes_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  store_id uuid not null constraint product_station_routes_store_id_stores_id_fk references public.stores(id) on delete cascade,
  product_id uuid not null constraint product_station_routes_product_id_products_id_fk references public.products(id) on delete cascade,
  station_id uuid constraint product_station_routes_station_id_stations_id_fk references public.stations(id) on delete set null
);
create unique index if not exists product_station_routes_store_product_uq on public.product_station_routes(store_id, product_id);

alter type public.stock_kind add value if not exists 'transfer';
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'store_kind' and n.nspname = 'public') then
    create type public.store_kind as enum ('sube', 'depo');
  end if;
end $$;

alter table public.users add column if not exists store_id uuid
  constraint users_store_id_stores_id_fk references public.stores(id) on delete restrict;
alter table public.stores add column if not exists kind public.store_kind not null default 'sube';
alter table public.stores add column if not exists royalty_bps integer;
alter table public.stores add column if not exists monthly_fee integer;
alter table public.stock_movements add column if not exists transfer_id uuid;

create table if not exists public.store_product_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint store_product_settings_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  store_id uuid not null constraint store_product_settings_store_id_stores_id_fk references public.stores(id) on delete cascade,
  product_id uuid not null constraint store_product_settings_product_id_products_id_fk references public.products(id) on delete cascade,
  active boolean not null default true,
  min_stock integer,
  updated_at timestamptz not null default now()
);
create unique index if not exists store_product_settings_uq on public.store_product_settings(store_id, product_id);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint stock_transfers_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  from_store_id uuid not null constraint stock_transfers_from_store_id_stores_id_fk references public.stores(id) on delete cascade,
  to_store_id uuid not null constraint stock_transfers_to_store_id_stores_id_fk references public.stores(id) on delete cascade,
  note text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint stock_transfer_lines_tenant_id_tenants_id_fk references public.tenants(id) on delete cascade,
  transfer_id uuid not null constraint stock_transfer_lines_transfer_id_stock_transfers_id_fk references public.stock_transfers(id) on delete cascade,
  product_id uuid not null constraint stock_transfer_lines_product_id_products_id_fk references public.products(id) on delete cascade,
  qty_milli integer not null
);
create unique index if not exists stock_transfer_lines_uq on public.stock_transfer_lines(transfer_id, product_id);
