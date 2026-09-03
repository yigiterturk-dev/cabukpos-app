-- OTURUM İPTALİ — "erişimi kapattım ama açık oturum içeride" açığını kapatır.
--
-- Sorun: oturum JWT'dir, yani durumsuzdur. Kullanıcı silinse, rolü düşürülse ya da
-- şifresi değiştirilse bile elindeki çerez imza geçerli olduğu sürece 30 gün çalışır.
-- Personeli işten çıkaran işletme sahibi erişimi gerçekten kesemez.
--
-- Çözüm: her kullanıcının bir "oturum başlangıcı" (session_epoch) vardır. Token'ın
-- iat (issued-at) değeri bu tarihten ESKİYSE token ölüdür. Erişimi kesmek için
-- session_epoch'u now() yapmak yeterli — o kullanıcının TÜM cihazlardaki oturumları
-- anında düşer.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_epoch timestamptz NOT NULL DEFAULT now();

-- Oturum hâlâ geçerli mi?
--
-- SECURITY DEFINER: bu kontrol oturum ÇÖZÜLÜRKEN çalışır; o an app.business_id
-- henüz set edilmemiş olabilir, dolayısıyla app_tenant users'ı göremez. Yüzey
-- kasıtla dardır: tek boolean döner, kullanıcı verisi sızdırmaz.
--
-- Kullanıcı yoksa (silinmiş) → false. Yani silme de oturumu öldürür.
CREATE OR REPLACE FUNCTION auth_session_live(
  p_user_id   uuid,
  p_issued_at bigint            -- JWT iat, saniye cinsinden
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_user_id
      -- 1 sn tolerans: iat saniyeye yuvarlanır, epoch mikrosaniyelidir;
      -- tolerans olmazsa girişin hemen ardından kendi oturumu ölü sayılabilir.
      AND u.session_epoch <= to_timestamp(p_issued_at) + interval '1 second'
  )
$$;

-- Bir kullanıcının tüm oturumlarını düşür (şifre değişimi, personel çıkışı, ele geçirme).
CREATE OR REPLACE FUNCTION auth_revoke_sessions(p_user_id uuid) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE users SET session_epoch = now() WHERE id = p_user_id
$$;

GRANT EXECUTE ON FUNCTION auth_session_live(uuid, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth_revoke_sessions(uuid) TO PUBLIC;
