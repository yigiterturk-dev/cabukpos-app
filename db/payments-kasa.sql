-- Ödeme/Kasa + Cari modülü — şema kurulumu.
--
-- SIRA ÖNEMLİ: bu dosya CANLI VERİTABANINDA ÇALIŞTIRILMADAN deploy edilirse
-- loadBusinessState "payments" tablosunu sorgular ve panel 500 verir.
-- Önce bu SQL, sonra deploy.
--
-- Tamamen EKLEMELİ (additive): mevcut hiçbir tabloya dokunmaz, veri kaybı riski yok.
-- Tekrar çalıştırılabilir (IF NOT EXISTS + DROP POLICY IF EXISTS).

-- ---------------------------------------------------------------------------
-- payments — kasaya giren para (tahsilat)
-- ---------------------------------------------------------------------------
-- Randevu FİYATI "hak edilen" (ciro), payments ise "kasaya giren" (tahsilat).
-- İkisinin farkı müşterinin borcu = cari bakiye.
CREATE TABLE IF NOT EXISTS payments (
  id             text PRIMARY KEY,
  business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date           text NOT NULL,              -- YYYY-MM-DD
  amount         double precision NOT NULL,
  method         text NOT NULL,              -- nakit | kart | havale
  customer_id    text,                       -- NULL = genel/randevusuz tahsilat
  appointment_id text,
  note           text,
  created_at     text NOT NULL               -- ISO
);
CREATE INDEX IF NOT EXISTS payments_business_id_idx ON payments (business_id);
CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON payments (customer_id);

-- ---------------------------------------------------------------------------
-- expenses — kasadan çıkan para (gider)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id          text PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        text NOT NULL,                 -- YYYY-MM-DD
  amount      double precision NOT NULL,
  category    text NOT NULL,                 -- kira | maas | malzeme | fatura | vergi | diger
  note        text,
  created_at  text NOT NULL                  -- ISO
);
CREATE INDEX IF NOT EXISTS expenses_business_id_idx ON expenses (business_id);

-- ---------------------------------------------------------------------------
-- RLS — diğer tablolarla aynı fail-closed tenant izolasyonu (db/rls.sql ile aynı)
-- ---------------------------------------------------------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON expenses;
CREATE POLICY tenant_isolation ON expenses
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);
