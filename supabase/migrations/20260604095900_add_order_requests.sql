-- Audit trail and idempotency guard for live broker order attempts.
create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker text not null check (broker in ('t212', 'etoro')),
  instrument_id text not null,
  ticker text not null,
  company_name text not null default '',
  side text not null check (side in ('buy', 'sell')),
  order_type text not null check (order_type in ('market', 'limit', 'stop', 'stop_limit')),
  input_mode text not null check (input_mode in ('quantity', 'value')),
  quantity numeric,
  value numeric,
  limit_price numeric,
  stop_price numeric,
  stop_loss_price numeric,
  take_profit_price numeric,
  time_validity text check (time_validity in ('DAY', 'GOOD_TILL_CANCEL')),
  leverage numeric not null default 1,
  status text not null default 'draft' check (status in ('draft', 'pending_confirmation', 'submitted', 'accepted', 'rejected', 'failed', 'cancelled')),
  idempotency_key text not null,
  broker_order_id text,
  raw_request jsonb not null default '{}'::jsonb,
  raw_response jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz,
  unique (user_id, broker, idempotency_key)
);

create index if not exists idx_order_requests_user_created_at on public.order_requests (user_id, created_at desc);
create index if not exists idx_order_requests_user_status on public.order_requests (user_id, status, created_at desc);

alter table public.order_requests enable row level security;

drop policy if exists "Users can view their own order requests" on public.order_requests;
create policy "Users can view their own order requests"
  on public.order_requests for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own order requests" on public.order_requests;
create policy "Users can insert their own order requests"
  on public.order_requests for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own order requests" on public.order_requests;
create policy "Users can update their own order requests"
  on public.order_requests for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
