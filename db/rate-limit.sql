-- Dağıtık (instance-bağımsız) rate limit — pre-auth yollar için.
--
-- NEDEN: in-memory sayaç serverless'te işe yaramaz; her cold start sıfırlanır ve
-- her instance kendi sayacını tutar. Brute-force denemesi instance'lara dağılınca
-- limit hiç dolmaz. Sayaç DB'de olursa tüm instance'lar aynı sayacı görür.
--
-- SECURITY DEFINER: /giris ve /kayit oturum AÇILMADAN çalışır, yani app.business_id
-- set edilmemiştir ve app_tenant rolü bu tabloyu göremez. Fonksiyon sahibi haklarıyla
-- çalışır; yüzey tek bir sayaç artırma işlemine daraltılmıştır (veri okunmaz/dönmez).

CREATE TABLE IF NOT EXISTS rate_limits (
  key           text PRIMARY KEY,
  hits          integer     NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now()
);

-- Süresi geçmiş kayıtların temizliği için (cron yok; fonksiyon fırsat buldukça siler).
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON rate_limits (window_start);

-- Tek atomik adımda: pencereyi kaydır (gerekiyorsa), sayacı artır, limit doldu mu döndür.
-- true  = ENGELLE (limit aşıldı)
-- false = geçir
CREATE OR REPLACE FUNCTION rl_hit(
  p_key            text,
  p_window_seconds integer,
  p_max_hits       integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO rate_limits AS r (key, hits, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
                 WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                 THEN 1                      -- pencere doldu → sıfırdan başlat
                 ELSE r.hits + 1
               END,
        window_start = CASE
                 WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                 THEN now()
                 ELSE r.window_start
               END
  RETURNING r.hits INTO v_hits;

  RETURN v_hits > p_max_hits;
END;
$$;

-- Sayaç sıfırlama (başarılı giriş sonrası kilidi kaldırmak için).
CREATE OR REPLACE FUNCTION rl_reset(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM rate_limits WHERE key = p_key $$;

-- Bakım: 1 günden eski kayıtları at (çağrı yapan tarafta ara sıra tetiklenir).
CREATE OR REPLACE FUNCTION rl_gc() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' $$;

-- RLS: tablo doğrudan erişime kapalı; yalnız yukarıdaki fonksiyonlar üzerinden.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limits FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rl_hit(text, integer, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rl_reset(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rl_gc() TO PUBLIC;
