begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
create table if not exists stock_lots(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id) on delete cascade,store_id uuid not null references stores(id) on delete cascade,product_id uuid not null references products(id) on delete cascade,code text not null,expires_on date,remaining int not null default 0 check(remaining>=0),created_at timestamptz not null default now());
alter table stock_lots add column if not exists purchase_id uuid references purchases(id) on delete set null;
create index if not exists stock_lots_lookup on stock_lots(store_id,product_id,expires_on);
create table if not exists stock_lot_events(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id) on delete cascade,lot_id uuid not null references stock_lots(id) on delete cascade,movement_id uuid references stock_movements(id) on delete cascade,qty_milli int not null,actor text not null,at timestamptz not null default now(),note text not null);
create table if not exists procurement_orders(id uuid primary key,tenant_id uuid not null references tenants(id) on delete cascade,store_id uuid not null references stores(id) on delete cascade,supplier_id uuid not null references suppliers(id),status text not null default 'siparis',lines jsonb not null,note text not null,created_by text not null,created_at timestamptz not null default now(),received_at timestamptz,purchase_id uuid references purchases(id));
create table if not exists platform_settlements(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id) on delete cascade,store_id uuid not null references stores(id) on delete cascade,platform text not null,from_day date not null,to_day date not null,commission_bps int not null,commission_base text not null,courier_cost int not null,adjustment int not null,actual int not null,gross int not null,online int not null,expected int not null,fingerprint text not null,note text not null,created_by text not null,created_at timestamptz not null default now());
alter table platform_settlements add column if not exists voided_at timestamptz;
do $$ declare t text; begin
 foreach t in array array['stock_lots','stock_lot_events','procurement_orders','platform_settlements'] loop
 execute format('alter table %I enable row level security',t);
 execute format('alter table %I force row level security',t);
 execute format('drop policy if exists tenant_isolation on %I',t);
 execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)$p$,t);
 execute format('grant select,insert,update,delete on %I to cabukpos_app',t);
 end loop;
end $$;
commit;
