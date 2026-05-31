create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  t212_api_key text,
  etoro_api_key text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('t212', 'etoro')),
  source_type text not null check (source_type in ('manual_csv', 'broker_api')),
  sync_mode text not null default 'manual' check (sync_mode in ('manual', 'scheduled')),
  sync_status text not null default 'never_synced' check (sync_status in ('never_synced', 'ready', 'running', 'succeeded', 'failed')),
  is_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, broker, source_type)
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid references public.broker_connections (id) on delete set null,
  broker text not null check (broker in ('t212', 'etoro')),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  source_type text not null check (source_type in ('manual_csv', 'broker_api')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  positions_imported integer not null default 0,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  broker text not null check (broker in ('t212', 'etoro')),
  current_pl_gbp numeric not null,
  last_alerted_pl numeric not null,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, ticker, broker)
);

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

create index if not exists idx_broker_connections_user_id
  on public.broker_connections (user_id);

create index if not exists idx_broker_connections_user_broker
  on public.broker_connections (user_id, broker);

create index if not exists idx_sync_runs_user_id
  on public.sync_runs (user_id);

create index if not exists idx_sync_runs_connection_id
  on public.sync_runs (connection_id);

create index if not exists idx_sync_runs_user_started_at
  on public.sync_runs (user_id, started_at desc);

create index if not exists idx_portfolio_snapshots_user_id
  on public.portfolio_snapshots (user_id);

create index if not exists idx_portfolio_snapshots_user_ticker_broker
  on public.portfolio_snapshots (user_id, ticker, broker);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.broker_connections enable row level security;
alter table public.sync_runs enable row level security;
alter table public.portfolio_snapshots enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can view their own push subscriptions" on public.push_subscriptions;
create policy "Users can view their own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own push subscriptions" on public.push_subscriptions;
create policy "Users can insert their own push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push subscriptions" on public.push_subscriptions;
create policy "Users can update their own push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push subscriptions" on public.push_subscriptions;
create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own broker connections" on public.broker_connections;
create policy "Users can view their own broker connections"
  on public.broker_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own broker connections" on public.broker_connections;
create policy "Users can insert their own broker connections"
  on public.broker_connections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own broker connections" on public.broker_connections;
create policy "Users can update their own broker connections"
  on public.broker_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own broker connections" on public.broker_connections;
create policy "Users can delete their own broker connections"
  on public.broker_connections
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own sync runs" on public.sync_runs;
create policy "Users can view their own sync runs"
  on public.sync_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sync runs" on public.sync_runs;
create policy "Users can insert their own sync runs"
  on public.sync_runs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sync runs" on public.sync_runs;
create policy "Users can update their own sync runs"
  on public.sync_runs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own sync runs" on public.sync_runs;
create policy "Users can delete their own sync runs"
  on public.sync_runs
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own portfolio snapshots" on public.portfolio_snapshots;
create policy "Users can view their own portfolio snapshots"
  on public.portfolio_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own portfolio snapshots" on public.portfolio_snapshots;
create policy "Users can insert their own portfolio snapshots"
  on public.portfolio_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own portfolio snapshots" on public.portfolio_snapshots;
create policy "Users can update their own portfolio snapshots"
  on public.portfolio_snapshots
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own portfolio snapshots" on public.portfolio_snapshots;
create policy "Users can delete their own portfolio snapshots"
  on public.portfolio_snapshots
  for delete
  to authenticated
  using (auth.uid() = user_id);

