-- Keep historical transfers received: their destination stock already exists.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table stock_transfers add column if not exists status text not null default 'teslim';
alter table stock_transfers add column if not exists received_at timestamptz;
alter table stock_transfers add column if not exists received_by text;
alter table stock_transfers add column if not exists updated_at timestamptz not null default now();
commit;
