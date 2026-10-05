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
  foreach t in array array['stores','staff','categories','products','shifts','sales','sale_lines','payments','stock_movements','audit_log','areas','tables','option_groups','options','product_option_groups','stations','tab_events','delivery_zones','customers','growth_campaigns','growth_recipient_refs','growth_campaign_events','customer_addresses','product_platform_codes','recipe_items','suppliers','purchases','purchase_lines','supplier_payments','productions','loyalty_settings','loyalty_events','gift_cards','gift_card_events','coupons','coupon_uses','reservations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- M8: mali belge
do $$ declare t text; begin
  foreach t in array array['fiscal_settings','fiscal_documents','fiscal_refunds','report_settings'] loop
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

-- #37: QR menü: herkese açık menü (aktif + satılabilir + fiyatı olan ürünler, kategorileriyle).
create or replace function public_menu_by_store(p_store uuid) returns jsonb
language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
    'tenant', t.name, 'vertical', t.vertical, 'store', st.name,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name) from categories c where c.tenant_id = st.tenant_id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'categoryId', p.category_id, 'kind', p.kind) order by coalesce(c.sort, 9999), p.sort, p.name)
      from products p left join categories c on c.id = p.category_id
      where p.tenant_id = st.tenant_id and p.active and p.sellable and p.price > 0), '[]'::jsonb)
  )
  from stores st join tenants t on t.id = st.tenant_id
  where st.id = p_store
$f$;
revoke all on function public_menu_by_store(uuid) from public;
grant execute on function public_menu_by_store(uuid) to cabukpos_app;

-- #37: müşteri sipariş ekranı: adisyon olayları (yalnız tek tab, mağaza+tab kimliğiyle).
create or replace function public_tab_events(p_store uuid, p_tab uuid) returns jsonb
language sql stable security definer set search_path = public as $f$
  select coalesce(jsonb_agg(jsonb_build_object('type', e.type, 'at', e.at, 'payload', e.payload) order by e.seq), '[]'::jsonb)
  from tab_events e where e.store_id = p_store and e.tab_id = p_tab
$f$;
revoke all on function public_tab_events(uuid, uuid) from public;
grant execute on function public_tab_events(uuid, uuid) to cabukpos_app;

-- Cron: bekleyen/hatalı belgesi ya da iptal kuyruğu olan kiracılar.
create or replace function fiscal_pending_tenants() returns setof uuid
language sql stable security definer set search_path = public as $f$
  select distinct tenant_id from fiscal_documents
  where (status in ('pending','error') and attempts < 5) or (status = 'issued' and cancel_pending)
$f$;
revoke all on function fiscal_pending_tenants() from public;
grant execute on function fiscal_pending_tenants() to cabukpos_app;

-- #41: e-posta özeti vakti gelen kiracılar (daily/weekly bayrağı + son gönderim sınırı cron'dan gelir).
create or replace function report_due_tenants(kind text, before timestamptz) returns setof uuid
language sql stable security definer set search_path = public as $f$
  select tenant_id from report_settings
  where (kind = 'gunluk' and daily or kind = 'haftalik' and weekly or kind = 'aylik' and monthly)
    and (case when kind = 'gunluk' then last_daily_at when kind = 'haftalik' then last_weekly_at else last_monthly_at end is null
         or case when kind = 'gunluk' then last_daily_at when kind = 'haftalik' then last_weekly_at else last_monthly_at end < before)
$f$;
revoke all on function report_due_tenants(text, timestamptz) from public;
grant execute on function report_due_tenants(text, timestamptz) to cabukpos_app;

-- M9a: kasa olayı
alter table register_events enable row level security;
alter table register_events force row level security;
drop policy if exists tenant_isolation on register_events;
create policy tenant_isolation on register_events using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- #50 fiyat listesi / happy hour
alter table price_lists enable row level security;
alter table price_lists force row level security;
drop policy if exists tenant_isolation on price_lists;
create policy tenant_isolation on price_lists using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
alter table price_list_items enable row level security;
alter table price_list_items force row level security;
drop policy if exists tenant_isolation on price_list_items;
create policy tenant_isolation on price_list_items using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- #51 sayım oturumu
alter table stock_counts enable row level security;
alter table stock_counts force row level security;
drop policy if exists tenant_isolation on stock_counts;
create policy tenant_isolation on stock_counts using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
alter table stock_count_lines enable row level security;
alter table stock_count_lines force row level security;
drop policy if exists tenant_isolation on stock_count_lines;
create policy tenant_isolation on stock_count_lines using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- #19 e-Fatura zarfları
alter table fiscal_envelopes enable row level security;
alter table fiscal_envelopes force row level security;
drop policy if exists tenant_isolation on fiscal_envelopes;
create policy tenant_isolation on fiscal_envelopes using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Cron kuyruğu: zarfı bekleyen/gönderilmiş zarfı sorgulanacak kiracılar da.
create or replace function fiscal_pending_tenants() returns setof uuid
language sql stable security definer set search_path = public as $f$
  select distinct tenant_id from fiscal_documents
  where (status in ('pending','error') and attempts < 5) or (status = 'issued' and cancel_pending)
  union
  select distinct tenant_id from fiscal_envelopes where status in ('hazir','gonderildi','iletildi')
$f$;

-- #55: audit_log yalnız eklenebilir (append-only). Uygulama kodu bu tabloyu hiç
-- güncellemez/silmez; DB seviyesinde de yasaklanır ki bir hata ya da ele geçirilmiş
-- oturum denetim izini silemesin. RLS yalnız satır okumayı/yazmayı kiracıya bağlar,
-- UPDATE/DELETE'i kapatmaz — bu GRANT onu kapatır.
revoke update, delete, truncate on audit_log from cabukpos_app;
grant select, insert on audit_log to cabukpos_app;

-- #55: kimlik/RLS dışı tablolarda (tokens global aranır: devices, agents, sessions,
-- login_attempts, platform_connections, integration_keys, billing_*) tenant kapsamı
-- uygulama katmanında zorunludur. Yeni bir tenant tablosu RLS'siz eklenirse
-- `tests/rls-coverage.test.ts` kapıyı kırar; bu yüzden burada yalnız append-only
-- ve drift denetimi vardır.
