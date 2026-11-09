\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE cabukpos_app;
SELECT set_config('app.tenant_id', :'tenant_a', true);
SELECT set_config('app.test_tenant_b', :'tenant_b', true);
DO $$
DECLARE
  a int;
  b int;
BEGIN
  SELECT count(*) INTO a FROM products;
  SELECT count(*) INTO b FROM products WHERE tenant_id = current_setting('app.test_tenant_b')::uuid;
  IF a = 0 THEN RAISE EXCEPTION 'RLS: tenant A bos gorunuyor'; END IF;
  IF b <> 0 THEN RAISE EXCEPTION 'RLS LEAK: tenant B gorunur (% satir)', b; END IF;
  BEGIN
    UPDATE products SET tenant_id = current_setting('app.test_tenant_b')::uuid
     WHERE tenant_id = current_setting('app.tenant_id')::uuid;
    RAISE EXCEPTION 'RLS WRITE LEAK: capraz yazma basarili';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
ROLLBACK;
