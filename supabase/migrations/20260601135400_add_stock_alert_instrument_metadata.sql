alter table public.stock_alert_rules
  add column if not exists instrument_id text,
  add column if not exists exchange text,
  add column if not exists asset_type text;

create index if not exists idx_stock_alert_rules_instrument_id
  on public.stock_alert_rules (broker, instrument_id)
  where instrument_id is not null;
