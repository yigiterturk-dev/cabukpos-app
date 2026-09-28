-- db/rls.sql — idempotent. Uygulama rolü süper kullanıcı değil ve RLS'yi atlamaz.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'cabukpos_app') then
    create role cabukpos_app login password 'dev-app-pass' nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema public to cabukpos_app;
grant select, insert, update, delete on all tables in schema public to cabukpos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to cabukpos_app;
grant usage, select on all sequences in schema public to cabukpos_app; -- M5: tab_events.seq
alter default privileges in schema public grant usage, select on sequences to cabukpos_app;

do $$ declare t text; begin
  foreach t in array array['stores','staff','categories','products','shifts','sales','sale_lines','payments','stock_movements','audit_log','areas','tables','option_groups','options','product_option_groups','stations','tab_events','delivery_zones','customers','customer_addresses','product_platform_codes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
