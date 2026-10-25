begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
alter table staff add column if not exists permissions jsonb;
commit;
