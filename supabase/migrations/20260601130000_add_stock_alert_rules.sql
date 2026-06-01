create table if not exists public.stock_alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('t212', 'etoro')),
  ticker text not null,
  company_name text not null default '',
  direction text not null check (direction in ('up', 'down', 'both')),
  threshold_percent numeric not null default 1,
  baseline_price numeric not null,
  baseline_currency text not null default 'GBP',
  is_enabled boolean not null default true,
  last_triggered_at timestamptz,
  last_triggered_price numeric,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_stock_alert_rules_user_id on public.stock_alert_rules (user_id);
create index if not exists idx_stock_alert_rules_enabled on public.stock_alert_rules (is_enabled);
create unique index if not exists idx_stock_alert_rules_user_broker_ticker_direction
  on public.stock_alert_rules (user_id, broker, ticker, direction);

alter table public.stock_alert_rules enable row level security;

drop policy if exists "Users can view their own stock alerts" on public.stock_alert_rules;
create policy "Users can view their own stock alerts"
  on public.stock_alert_rules for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own stock alerts" on public.stock_alert_rules;
create policy "Users can insert their own stock alerts"
  on public.stock_alert_rules for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own stock alerts" on public.stock_alert_rules;
create policy "Users can update their own stock alerts"
  on public.stock_alert_rules for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own stock alerts" on public.stock_alert_rules;
create policy "Users can delete their own stock alerts"
  on public.stock_alert_rules for delete to authenticated
  using (auth.uid() = user_id);
