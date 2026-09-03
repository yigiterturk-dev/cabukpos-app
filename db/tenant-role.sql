-- Tenant rolü — RLS'in GERÇEKTEN uygulanması için (KRİTİK).
--
-- SORUN: Neon bağlantı rolü `neondb_owner`, `rolbypassrls = true` taşır. BYPASSRLS,
-- `FORCE ROW LEVEL SECURITY` dahil tüm RLS politikalarını GÖRMEZDEN gelir. Yani
-- db/rls.sql politikaları doğru olsa da, owner ile yapılan sorgular tenant izolasyonunu
-- ATLAR (doğrulama scriptinde teyit edildi: A bağlamı B'nin satırlarını görebiliyordu).
--
-- ÇÖZÜM: BYPASSRLS taşımayan ayrı bir `app_tenant` rolü oluştur. Giriş sonrası tenant'lı
-- sorgular, transaction içinde `SET LOCAL ROLE app_tenant` ile bu role geçer (owner kendi
-- alt rolüne geçebilir). Böylece RLS politikaları gerçekten devreye girer. Pre-auth
-- SECURITY DEFINER fonksiyonları (db/auth.sql) owner olarak çalışmaya devam eder (doğru —
-- onların bypass etmesi gerekir).
--
-- NOT: Bu dosya bir RBAC değişikliğidir; ortam sahibi (Yiğit) tarafından TEK SEFER
-- uygulanmalıdır. withTenant() bu rol var olduğu anda RLS'i otomatik enforce eder.

-- 1) Rolü oluştur/güncelle (NOLOGIN: yalnız SET ROLE ile geçilir, NOBYPASSRLS: RLS uygulanır).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOBYPASSRLS NOLOGIN;
  ELSE
    ALTER ROLE app_tenant NOBYPASSRLS NOLOGIN;
  END IF;
END $$;

-- 2) Owner'ın bu role SET ROLE ile geçebilmesi için üyelik ver.
GRANT app_tenant TO neondb_owner;

-- 3) Şema + tablo yetkileri (RLS politikası içinde, ek olarak DML izni gerekir).
GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;

-- 4) İleride eklenecek tablolar için varsayılan yetkiler.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;

-- 5) app.business_id GUC'unu app_tenant da set edebilmeli (SET LOCAL için custom GUC).
--    "app." prefix'li parametreler varsayılan olarak herkesçe set edilebilir (placeholder),
--    ek bir grant gerekmez. (Postgres custom GUC kuralı.)
