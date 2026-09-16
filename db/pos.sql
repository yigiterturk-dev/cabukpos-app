-- POS (market/restoran) kolonları — services tablosuna barkod/stok ekler.
--
-- ADDITIVE: mevcut veriye dokunmaz; eski kayıtlarda NULL kalır (map.ts u(undefined) ile
-- bunları "alan yok" olarak okur). drizzle-kit push de aynı sonucu üretir; bu dosya
-- elle/uçbirimden uygulama isteyen ortamlar içindir.

ALTER TABLE services ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS stock integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS track_stock boolean;

-- Hızlı Kasa araması barkodla birebir eşleşir; işletme bazlı arama indeksi.
CREATE INDEX IF NOT EXISTS services_business_barcode_idx
  ON services (business_id, barcode)
  WHERE barcode IS NOT NULL;
