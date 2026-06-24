-- Phase 1: lot-level positions and broker account snapshots

alter table public.positions
  add column if not exists external_position_id text;

update public.positions
set external_position_id = 'ticker:' || ticker
where external_position_id is null or external_position_id = '';

alter table public.positions
  alter column external_position_id set not null;

alter table public.positions
  drop constraint if exists positions_user_id_broker_ticker_key;

alter table public.positions
  drop constraint if exists positions_user_id_broker_external_position_id_key;

alter table public.positions
  add constraint positions_user_id_broker_external_position_id_key
  unique (user_id, broker, external_position_id);

alter table public.broker_connections
  add column if not exists account_currency text,
  add column if not exists available_cash numeric,
  add column if not exists invested_amount numeric,
  add column if not exists total_equity numeric,
  add column if not exists holdings_value numeric,
  add column if not exists unrealized_pl numeric,
  add column if not exists realized_pl numeric,
  add column if not exists last_positions_mapped integer,
  add column if not exists last_positions_stored integer,
  add column if not exists last_activity_imported integer;

alter table public.sync_runs
  add column if not exists positions_mapped integer not null default 0,
  add column if not exists activity_imported integer not null default 0;
