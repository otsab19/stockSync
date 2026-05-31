-- Store synced positions and activity in Supabase for server-side access
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('t212', 'etoro')),
  ticker text not null,
  company_name text not null default '',
  shares numeric not null default 0,
  avg_price numeric not null default 0,
  live_price numeric not null default 0,
  native_currency text not null default 'GBP',
  fx_rate_to_gbp numeric not null default 1,
  total_value_gbp numeric not null default 0,
  total_pl numeric not null default 0,
  total_pl_percent numeric not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, broker, ticker)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('t212', 'etoro')),
  ticker text not null,
  company_name text not null default '',
  event_type text not null check (event_type in ('buy', 'sell')),
  shares numeric not null default 0,
  price numeric not null default 0,
  native_currency text not null default 'GBP',
  gross_amount_gbp numeric not null default 0,
  realised_profit_gbp numeric,
  order_type text,
  timestamp timestamptz not null,
  unique (user_id, broker, ticker, timestamp, event_type)
);

create index if not exists idx_positions_user_id on public.positions (user_id);
create index if not exists idx_positions_user_broker on public.positions (user_id, broker);
create index if not exists idx_activity_events_user_id on public.activity_events (user_id);
create index if not exists idx_activity_events_user_broker on public.activity_events (user_id, broker);
create index if not exists idx_activity_events_user_timestamp on public.activity_events (user_id, timestamp desc);

-- RLS
alter table public.positions enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists "Users can view their own positions" on public.positions;
create policy "Users can view their own positions"
  on public.positions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own positions" on public.positions;
create policy "Users can insert their own positions"
  on public.positions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own positions" on public.positions;
create policy "Users can update their own positions"
  on public.positions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own positions" on public.positions;
create policy "Users can delete their own positions"
  on public.positions for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own activity" on public.activity_events;
create policy "Users can view their own activity"
  on public.activity_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own activity" on public.activity_events;
create policy "Users can insert their own activity"
  on public.activity_events for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own activity" on public.activity_events;
create policy "Users can update their own activity"
  on public.activity_events for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own activity" on public.activity_events;
create policy "Users can delete their own activity"
  on public.activity_events for delete to authenticated
  using (auth.uid() = user_id);

