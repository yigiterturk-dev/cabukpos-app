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
  foreach t in array array['stores','staff','categories','products','shifts','sales','sale_lines','payments','stock_movements','audit_log','areas','tables','option_groups','options','product_option_groups','stations','tab_events','delivery_zones','customers','customer_addresses','product_platform_codes','recipe_items','suppliers','purchases','purchase_lines','supplier_payments','productions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- M8: mali belge
do $$ declare t text; begin
  foreach t in array array['fiscal_settings','fiscal_documents','fiscal_refunds'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- FORCE RLS tablo sahibini de bağlar → SECURITY DEFINER fonksiyonlar (sahibi = bu betiği çalıştıran rol) okuyabilsin.
do $$ declare t text; begin
  foreach t in array array['fiscal_documents','fiscal_settings','sales','sale_lines','stores'] loop
    execute format('drop policy if exists definer_read on %I', t);
    execute format('create policy definer_read on %I for select to %I using (true)', t, current_user);
  end loop;
end $$;

-- Herkese açık fatura sayfası: kiracı bağlamı olmadan tek belge (token = 24 karakter rastgele).
create or replace function fiscal_doc_by_token(p_token text) returns jsonb
language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
    'status', d.status, 'number', d.number, 'ettn', d.ettn, 'buyer', d.buyer, 'issuedAt', d.issued_at, 'createdAt', d.created_at,
    'provider', fs.provider,
    'sale', jsonb_build_object('receiptNo', s.receipt_no, 'total', s.total, 'vat', s.vat, 'createdAt', s.created_at),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'qtyMilli', l.qty_milli, 'unitPrice', l.unit_price, 'vatRate', l.vat_rate, 'total', l.total) order by l.name) from sale_lines l where l.sale_id = s.id), '[]'::jsonb),
    'seller', jsonb_build_object('name', t.name, 'taxId', t.tax_id, 'taxOffice', t.tax_office, 'address', t.address),
    'store', jsonb_build_object('name', st.name, 'address', st.address)
  )
  from fiscal_documents d
  join sales s on s.id = d.sale_id
  join tenants t on t.id = d.tenant_id
  join stores st on st.id = s.store_id
  left join fiscal_settings fs on fs.tenant_id = d.tenant_id
  where d.token = p_token and length(p_token) = 24
$f$;
revoke all on function fiscal_doc_by_token(text) from public;
grant execute on function fiscal_doc_by_token(text) to cabukpos_app;

-- Cron: bekleyen/hatalı belgesi ya da iptal kuyruğu olan kiracılar.
create or replace function fiscal_pending_tenants() returns setof uuid
language sql stable security definer set search_path = public as $f$
  select distinct tenant_id from fiscal_documents
  where (status in ('pending','error') and attempts < 5) or (status = 'issued' and cancel_pending)
$f$;
revoke all on function fiscal_pending_tenants() from public;
grant execute on function fiscal_pending_tenants() to cabukpos_app;

-- M9a: kasa olayı
alter table register_events enable row level security;
alter table register_events force row level security;
drop policy if exists tenant_isolation on register_events;
create policy tenant_isolation on register_events using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
