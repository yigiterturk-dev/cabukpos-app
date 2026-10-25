begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists attendance (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
 store_id uuid not null references stores(id) on delete cascade, staff_id uuid not null references staff(id) on delete cascade,
 starts_at timestamptz not null default now(), ends_at timestamptz, recorded_by text not null, ended_by text,
 constraint attendance_period check (ends_at is null or ends_at >= starts_at)
);
create unique index if not exists attendance_open_staff on attendance(tenant_id, staff_id) where ends_at is null;
alter table attendance enable row level security;
alter table attendance force row level security;
drop policy if exists tenant_isolation on attendance;
create policy tenant_isolation on attendance using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select,insert,update,delete on attendance to cabukpos_app;
commit;
