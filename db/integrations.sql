-- Online sipariş entegrasyonları (TGO/Uber Eats, Yemeksepeti) — altyapı tabloları.
--
-- ADDITIVE: mevcut tablolara dokunmaz.
-- - integration_orders: platformdan gelen HAM siparişler (denetim + idempotensi + hata ayıklama)
-- - integration_credentials: işletme başına platform kimlik bilgisi (webhook secret + şube ref)
--
-- NOT: db:push ÇALIŞTIRMA — bu dosya psql ile uygulanır (bkz. README uyarısı).

CREATE TABLE IF NOT EXISTS integration_orders (
  id text PRIMARY KEY,
  platform text NOT NULL,
  external_id text NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'received', -- received | mapped | failed
  payload jsonb NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_orders_platform_external_uq UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS integration_orders_business_created_idx
  ON integration_orders (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_credentials (
  platform text NOT NULL,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  secret text NOT NULL,
  branch_ref text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, business_id)
);

-- RLS: kiracı izolasyonu (db/rls.sql ile aynı desen)
ALTER TABLE integration_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integration_orders;
CREATE POLICY tenant_isolation ON integration_orders
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integration_credentials;
CREATE POLICY tenant_isolation ON integration_credentials
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);
