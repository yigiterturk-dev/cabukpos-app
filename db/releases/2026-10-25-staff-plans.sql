-- PostgreSQL 16+. New empty table only; no backfill or existing row updates.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
create table if not exists staff_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  kind text not null constraint staff_plans_kind check (kind in ('vardiya','gorev')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0,
  note text not null default '',
  status text not null default 'planlandi' constraint staff_plans_status check (status in ('planlandi','suruyor','tamamlandi','iptal')),
  revision integer not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_plans_period check (ends_at > starts_at and ends_at - starts_at <= case when kind = 'vardiya' then interval '24 hours' else interval '31 days' end),
  constraint staff_plans_break check (break_minutes between 0 and 720 and break_minutes * interval '1 minute' < ends_at - starts_at and (kind = 'vardiya' or break_minutes = 0)),
  constraint staff_plans_text check (length(title) between 2 and 120 and length(note) <= 1000 and revision > 0)
);
create index if not exists staff_plans_store_at_idx on staff_plans (tenant_id, store_id, starts_at);
create index if not exists staff_plans_staff_at_idx on staff_plans (tenant_id, staff_id, starts_at);
alter table staff_plans enable row level security;
alter table staff_plans force row level security;
drop policy if exists tenant_isolation on staff_plans;
create policy tenant_isolation on staff_plans using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on staff_plans to cabukpos_app;
commit;
