begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create table if not exists procurement_receipts (
 id uuid primary key,tenant_id uuid not null references tenants(id) on delete cascade,
 store_id uuid not null references stores(id) on delete cascade,order_id uuid not null references procurement_orders(id) on delete cascade,
 purchase_id uuid not null references purchases(id),lines jsonb not null,note text not null,created_by text not null,created_at timestamptz not null default now()
);
create index if not exists procurement_receipts_order_idx on procurement_receipts(tenant_id,order_id);
alter table procurement_receipts enable row level security;
alter table procurement_receipts force row level security;
drop policy if exists tenant_isolation on procurement_receipts;
create policy tenant_isolation on procurement_receipts using(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) with check(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
grant select,insert,update,delete on procurement_receipts to cabukpos_app;
commit;
