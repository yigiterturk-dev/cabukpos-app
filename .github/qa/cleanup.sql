-- CabukPOS — QA test verisi temizligi
-- SADECE QA/STAGING veritabaninda calistirin. Production'da KULLANMAYIN.
--
-- CI, her kosuda `qa-<run>-<attempt>@example.test` hesabi acar. Bu script o
-- hesaplarin tenant'larini ve cascade ile bagli tum verilerini siler.
-- Kullanim: psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -f cleanup.sql

BEGIN;

CREATE TEMP TABLE qa_tenants ON COMMIT DROP AS
  SELECT DISTINCT tenant_id AS id
    FROM users
   WHERE email LIKE 'qa-%@example.test';

DELETE FROM users WHERE email LIKE 'qa-%@example.test';

-- Sadece QA tenant'ina ait ve baska kullanici birakmayan kayitlari sil.
DELETE FROM tenants t
 WHERE t.id IN (SELECT id FROM qa_tenants)
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id);

DO $$
BEGIN
  IF to_regclass('public.login_attempts') IS NOT NULL THEN
    EXECUTE 'DELETE FROM login_attempts WHERE key LIKE ''%@example.test%''';
  END IF;
END $$;

COMMIT;

-- Dogrulama:
-- SELECT count(*) FROM users WHERE email LIKE 'qa-%@example.test';  -- 0 olmali
