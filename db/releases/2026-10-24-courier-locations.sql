-- PostgreSQL 16+, additive migration: empty new table, no existing business data changes.
-- Apply before the new location endpoints. Old app versions do not use this table.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists courier_locations (
  tenant_id uuid not null references tenants(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  session_id uuid not null,
  active boolean not null default false,
  latitude_e6 integer not null constraint courier_latitude_range check (latitude_e6 between -90000000 and 90000000),
  longitude_e6 integer not null constraint courier_longitude_range check (longitude_e6 between -180000000 and 180000000),
  accuracy integer not null constraint courier_accuracy_range check (accuracy between 0 and 100000),
  observed_at timestamptz not null,
  primary key (tenant_id, store_id, staff_id)
);
alter table courier_locations enable row level security;
alter table courier_locations force row level security;
drop policy if exists tenant_isolation on courier_locations;
create policy tenant_isolation on courier_locations using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on courier_locations to cabukpos_app;
commit;
