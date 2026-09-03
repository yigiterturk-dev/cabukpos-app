-- Otomatik hatırlatma gönderimi için: log satırını randevuya bağla ve
-- AYNI RANDEVUYA İKİNCİ MESAJI VERİTABANI DÜZEYİNDE ENGELLE.
--
-- Neden kod değil de kısıt: cron aynı anda iki kez tetiklenirse (yeniden deneme,
-- çakışan zamanlayıcı) uygulama içi "önce kontrol et sonra yaz" yarışı müşteriye
-- çift mesaj gönderir. Unique index bunu imkânsız kılar; ikinci insert patlar.

ALTER TABLE reminder_logs ADD COLUMN IF NOT EXISTS appointment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_logs_appointment_uq
  ON reminder_logs (business_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

-- Zamanı gelmiş hatırlatmaları TÜM kiracılar için tek sorguda döndürür.
--
-- KİRACI NOTU: bu bir SİSTEM işidir (cron), oturum yoktur, dolayısıyla app.business_id
-- set edilemez ve withTenant kullanılamaz. Bu yüzden fonksiyon SECURITY DEFINER'dır ve
-- yüzeyi kasıtla DARDIR: yalnız "gönderilecek mesaj" alanlarını döndürür, yazma yapmaz,
-- keyfi filtre kabul etmez. Çağıran uç nokta CRON_SECRET ile korunur.
CREATE OR REPLACE FUNCTION reminders_due(p_slack_minutes integer DEFAULT 30)
RETURNS TABLE (
  business_id     uuid,
  business_name   text,
  appointment_id  text,
  channel         text,
  customer_name   text,
  customer_phone  text,
  service_name    text,
  appt_start      text,
  appt_date       text,
  template        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.name,
    a.id,
    COALESCE(b.reminder_settings->>'channel', 'whatsapp'),
    c.name,
    c.phone,
    s.name,
    a.start,
    a.date,
    COALESCE(
      b.reminder_settings->>'template',
      'Merhaba {ad}, {isletme} randevunuz {saat} için hatırlatmadır. ({hizmet})'
    )
  FROM appointments a
  JOIN businesses b ON b.id = a.business_id
  JOIN customers  c ON c.id = a.customer_id AND c.business_id = a.business_id
  LEFT JOIN services s ON s.id = a.service_id AND s.business_id = a.business_id
  WHERE
    COALESCE((b.reminder_settings->>'enabled')::boolean, false) IS TRUE
    AND a.status NOT IN ('iptal', 'gelmedi')
    AND COALESCE(a.approval, 'onaylandi') <> 'bekliyor'
    AND (a.date || ' ' || a.start)::timestamp BETWEEN
          (now() AT TIME ZONE 'Europe/Istanbul')
            + make_interval(hours => COALESCE((b.reminder_settings->>'hoursBefore')::int, 24))
            - make_interval(mins => p_slack_minutes)
        AND (now() AT TIME ZONE 'Europe/Istanbul')
            + make_interval(hours => COALESCE((b.reminder_settings->>'hoursBefore')::int, 24))
            + make_interval(mins => p_slack_minutes)
    AND NOT EXISTS (
      SELECT 1 FROM reminder_logs rl
      WHERE rl.business_id = a.business_id AND rl.appointment_id = a.id
    )
  LIMIT 200
$$;

GRANT EXECUTE ON FUNCTION reminders_due(integer) TO PUBLIC;
