-- Public (oturumsuz) online rezervasyon — SECURITY DEFINER kapsüller.
--
-- SORUN: /r/[slug] sayfası oturumsuz ziyaretçiye açıktır. businesses/services/staff/
-- appointments tabloları FORCE ROW LEVEL SECURITY taşır (db/rls.sql) → app.business_id
-- set edilmemiş bir bağlantı HİÇBİR satır göremez (fail-closed). Public ziyaretçi için
-- session yok, dolayısıyla normal withTenant yolu çalışmaz.
--
-- ÇÖZÜM: Yalnızca public rezervasyon için gereken DAR yüzeyi SECURITY DEFINER fonksiyonlara
-- kapsülle. Her fonksiyon SLUG'tan businessId çözer ve SADECE o işletmenin verisine erişir.
-- Hassas alan (password_hash, müşteri listesi, ciro, telefon vb.) DÖNDÜRÜLMEZ. Yazma yolu da
-- yalnızca slug'tan çözülen businessId'ye, approval='bekliyor' + status='bekliyor' randevu yazar.
--
-- search_path sabitlenir (SECURITY DEFINER güvenlik pratiği). EXECUTE yalnız owner'a verilir;
-- PUBLIC/app_tenant'tan REVOKE edilir (fonksiyonlar owner db.execute bağlantısıyla çağrılır).

-- 1) Slug → işletme özeti (yalnız ad + sektör). Slug yoksa 0 satır (404 sinyali).
CREATE OR REPLACE FUNCTION public_booking_business(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  sector text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.name, b.sector
  FROM businesses b
  WHERE b.booking_slug = p_slug
  LIMIT 1;
$$;

-- 2) Slug → AKTİF hizmetler (yalnız public seçim için gereken alanlar).
CREATE OR REPLACE FUNCTION public_booking_services(p_slug text)
RETURNS TABLE (
  id text,
  name text,
  duration_min integer,
  price double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.duration_min, s.price
  FROM services s
  JOIN businesses b ON b.id = s.business_id
  WHERE b.booking_slug = p_slug
    AND COALESCE(s.active, true) = true
  ORDER BY s.name;
$$;

-- 3) Slug → AKTİF personel (renk/initials dahil — UI için; hassas değil).
CREATE OR REPLACE FUNCTION public_booking_staff(p_slug text)
RETURNS TABLE (
  id text,
  name text,
  role text,
  color text,
  initials text,
  work_start text,
  work_end text,
  service_ids jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.role, s.color, s.initials, s.work_start, s.work_end, s.service_ids
  FROM staff s
  JOIN businesses b ON b.id = s.business_id
  WHERE b.booking_slug = p_slug
    AND COALESCE(s.active, true) = true
  ORDER BY s.name;
$$;

-- 4) Slug → mevcut (iptal/reddedilmemiş) randevuların MEŞGULİYET aralıkları.
--    Sadece slot hesabı için gereken minimum: personel + tarih + başlangıç + süre.
--    Müşteri/fiyat/ad DÖNDÜRÜLMEZ. Yalnız bugünden ileri tarihler.
CREATE OR REPLACE FUNCTION public_booking_busy(p_slug text)
RETURNS TABLE (
  staff_id text,
  date text,
  start text,
  duration_min integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.staff_id, a.date, a.start,
         COALESCE(sv.duration_min, 30)::integer AS duration_min
  FROM appointments a
  JOIN businesses b ON b.id = a.business_id
  LEFT JOIN services sv ON sv.id = a.service_id AND sv.business_id = a.business_id
  WHERE b.booking_slug = p_slug
    AND a.status <> 'iptal'
    AND COALESCE(a.approval, 'onaylandi') <> 'reddedildi'
    AND a.date >= to_char(now(), 'YYYY-MM-DD');
$$;

-- 5) Public randevu oluştur: slug'tan businessId çöz, müşteri + randevu yaz.
--    approval='bekliyor', status='bekliyor', source='online'. Fiyat/ad snapshot'ları
--    çözülen businessId'nin hizmet/personelinden alınır. Slug geçersiz/hizmet/personel
--    o işletmeye ait değilse hata fırlatır (başka business'a yazma İMKANSIZ).
CREATE OR REPLACE FUNCTION public_booking_create(
  p_slug text,
  p_service_id text,
  p_staff_id text,
  p_date text,
  p_start text,
  p_name text,
  p_phone text
)
RETURNS text  -- oluşturulan randevu id'si
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_prefix text;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_cust_id text;
  v_apt_id text;
  v_svc RECORD;
  v_stf RECORD;
  v_conflict int;
BEGIN
  -- Slug → businessId
  SELECT b.id INTO v_business_id FROM businesses b WHERE b.booking_slug = p_slug LIMIT 1;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'business_not_found';
  END IF;

  -- Hizmet bu işletmeye mi ait + aktif mi?
  SELECT s.id, s.name, s.price, s.commission_rate, s.duration_min
    INTO v_svc
    FROM services s
   WHERE s.id = p_service_id AND s.business_id = v_business_id AND COALESCE(s.active, true) = true
   LIMIT 1;
  IF v_svc.id IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  -- Personel bu işletmeye mi ait + aktif mi?
  SELECT st.id, st.name
    INTO v_stf
    FROM staff st
   WHERE st.id = p_staff_id AND st.business_id = v_business_id AND COALESCE(st.active, true) = true
   LIMIT 1;
  IF v_stf.id IS NULL THEN
    RAISE EXCEPTION 'staff_not_found';
  END IF;

  -- Çift-booking koruması: aynı personel/tarih/saatte iptal/reddedilmemiş randevu varsa reddet.
  SELECT count(*) INTO v_conflict
    FROM appointments a
   WHERE a.business_id = v_business_id
     AND a.staff_id = p_staff_id
     AND a.date = p_date
     AND a.start = p_start
     AND a.status <> 'iptal'
     AND COALESCE(a.approval, 'onaylandi') <> 'reddedildi';
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  -- DB id namespacing: lib/data/map.ts ile aynı kural — uuid'in ilk 8 hex'i + '__' öneki.
  v_prefix := substr(replace(v_business_id::text, '-', ''), 1, 8) || '__';

  v_cust_id := v_prefix || 'cus-' || v_now;
  v_apt_id  := v_prefix || 'apt-' || v_now;

  -- Müşteri (online). Telefon/ad kırpılır (DoS/garbage'a karşı).
  INSERT INTO customers (id, business_id, name, phone, created_at)
  VALUES (
    v_cust_id, v_business_id,
    NULLIF(left(coalesce(p_name, ''), 80), ''),
    NULLIF(left(coalesce(p_phone, ''), 30), ''),
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  -- name/phone NULL kaldıysa makul varsayılan ver (NOT NULL kolonlar).
  UPDATE customers SET name = COALESCE(name, 'Online Müşteri'), phone = COALESCE(phone, '—')
   WHERE id = v_cust_id AND business_id = v_business_id;

  -- Randevu: online + onay bekliyor. Fiyat/prim/ad snapshot'ları işletmenin verisinden.
  INSERT INTO appointments (
    id, business_id, date, start, staff_id, customer_id, service_id,
    status, source, approval,
    price_snapshot, commission_rate_snapshot, service_name_snapshot, staff_name_snapshot
  )
  VALUES (
    v_apt_id, v_business_id, p_date, p_start,
    p_staff_id, v_cust_id, p_service_id,
    'bekliyor', 'online', 'bekliyor',
    v_svc.price, v_svc.commission_rate, v_svc.name, v_stf.name
  );

  RETURN v_apt_id;
END;
$$;

-- ============================================================================
-- EXECUTE yetkilerini kısıtla: PUBLIC/app_tenant alamaz, yalnız owner çağırır.
REVOKE EXECUTE ON FUNCTION public_booking_business(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public_booking_services(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public_booking_staff(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public_booking_busy(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public_booking_create(text, text, text, text, text, text, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public_booking_business(text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION public_booking_services(text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION public_booking_staff(text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION public_booking_busy(text) FROM app_tenant;
REVOKE EXECUTE ON FUNCTION public_booking_create(text, text, text, text, text, text, text) FROM app_tenant;

GRANT EXECUTE ON FUNCTION public_booking_business(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public_booking_services(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public_booking_staff(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public_booking_busy(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public_booking_create(text, text, text, text, text, text, text) TO neondb_owner;
