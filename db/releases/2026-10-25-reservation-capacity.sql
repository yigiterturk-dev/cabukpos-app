-- PostgreSQL 16+. Additive metadata defaults; existing reservations stay intact.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table tables add column if not exists seats integer not null default 4;
alter table reservations add column if not exists duration_minutes integer not null default 90;
create table if not exists reservation_settings (
 store_id uuid primary key references stores(id) on delete cascade,
 tenant_id uuid not null references tenants(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 enabled boolean not null default false,
 open_minute integer not null default 600,
 close_minute integer not null default 1320,
 duration_minutes integer not null default 90,
 slot_minutes integer not null default 30,
 advance_days integer not null default 30,
 constraint reservation_settings_range check (open_minute >= 0 and close_minute <= 1440 and close_minute > open_minute and duration_minutes between 15 and 360 and slot_minutes in (15,30,60) and advance_days between 1 and 90)
);
-- Identity lookup like devices/platform_connections: public token -> tenant, no customer information.
grant select, insert, update, delete on reservation_settings to cabukpos_app;
commit;
