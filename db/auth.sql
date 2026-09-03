-- Pre-auth (giriş öncesi) yardımcı fonksiyonları — SECURITY DEFINER.
--
-- SORUN: db/rls.sql, businesses + users tablolarına da FORCE ROW LEVEL SECURITY koydu.
-- Login akışı, app.business_id HENÜZ set edilmemişken e-postadan kullanıcıyı bulmayı
-- gerektirir → tenant_isolation policy bunu bloklar (fail-closed). Signup'ta da
-- business satırı daha oluşmadan onu okuyup/yazmak gerekir.
--
-- ÇÖZÜM: Bu iki pre-auth yolunu SECURITY DEFINER fonksiyonlara kapsülle. Fonksiyon,
-- tanımlayanın (owner/BYPASSRLS) yetkisiyle çalışır ve SADECE auth için gereken
-- minimum işi yapar. Böylece RLS'i genel olarak gevşetmeden, kontrollü ve dar bir
-- yüzeyle pre-auth lookup/insert mümkün olur. Giriş SONRASI tüm sorgular yine
-- normal (RLS + app.business_id scope) yoldan gider.
--
-- search_path sabitlenir (güvenlik: SECURITY DEFINER fonksiyonlarında zorunlu pratik).

-- 1) Login lookup: e-postadan kullanıcıyı getir (business_id henüz yokken).
--    Sadece auth için gereken alanları döndürür.
CREATE OR REPLACE FUNCTION auth_get_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  email text,
  password_hash text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.business_id, u.email, u.password_hash, u.role
  FROM users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

-- 2) Signup: business + owner user'ı TEK işlemde oluştur, business uuid döndür.
--    bookingSlug çakışmasını -2, -3 ... son ekiyle kendi içinde çözer.
--    E-posta zaten varsa anlaşılır bir hata fırlatır (unique index zaten korur).
CREATE OR REPLACE FUNCTION auth_create_business_and_owner(
  p_business_name text,
  p_email text,
  p_password_hash text,
  p_booking_slug text,
  p_sector text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_slug text;
  v_suffix int := 2;
BEGIN
  -- E-posta benzersizlik kontrolü (net hata mesajı için)
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'email_taken' USING ERRCODE = 'unique_violation';
  END IF;

  -- bookingSlug benzersizleştir
  v_slug := p_booking_slug;
  WHILE EXISTS (SELECT 1 FROM businesses WHERE booking_slug = v_slug) LOOP
    v_slug := p_booking_slug || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  INSERT INTO businesses (name, sector, booking_slug)
  VALUES (p_business_name, p_sector, v_slug)
  RETURNING id INTO v_business_id;

  INSERT INTO users (business_id, email, password_hash, role)
  VALUES (v_business_id, lower(p_email), p_password_hash, 'owner');

  RETURN v_business_id;
END;
$$;

-- ============================================================================
-- KRİTİK GÜVENLİK: EXECUTE yetkisini PUBLIC'ten al.
--
-- SORUN: SECURITY DEFINER fonksiyonları varsayılan olarak PUBLIC'e EXECUTE açar.
-- Bu, giriş yapmış `app_tenant` rolünün (veya herhangi bir rolün) bu fonksiyonları
-- doğrudan çağırıp HERHANGİ bir kullanıcının password_hash / business_id'sini okumasına
-- (auth_get_user_by_email) ya da keyfi business+owner oluşturmasına izin verirdi.
--
-- ÇÖZÜM: PUBLIC ve app_tenant'tan EXECUTE'u REVOKE et. Fonksiyonlar yalnızca owner
-- bağlantısı (neondb_owner) tarafından çağrılır — auth akışı `db.execute` ile owner
-- bağlantısı üzerinden gider, bu yüzden işlev bozulmaz. (withTenant `SET LOCAL ROLE
-- app_tenant` ile geçtiğinden, o role bu fonksiyonlara erişemesin.)
REVOKE EXECUTE ON FUNCTION auth_get_user_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth_create_business_and_owner(text, text, text, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION auth_get_user_by_email(text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION auth_create_business_and_owner(text, text, text, text, text) FROM app_tenant;

-- Owner bağlantı rolüne açıkça GRANT (fonksiyon sahibi zaten çalıştırabilir; bu netlik için).
GRANT EXECUTE ON FUNCTION auth_get_user_by_email(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION auth_create_business_and_owner(text, text, text, text, text) TO neondb_owner;
