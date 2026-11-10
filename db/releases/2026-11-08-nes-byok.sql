-- PostgreSQL 16+, additive migration: fiscal_settings'e NES BYOK kolonları.
-- Mevcut verilere, RLS'ye ve yetkilere dokunmaz; eski uygulama bu kolonları okumaz.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table fiscal_settings add column if not exists nes_api_key text;
alter table fiscal_settings add column if not exists nes_api_url text;
alter table fiscal_settings add column if not exists nes_sender_alias text;
commit;
