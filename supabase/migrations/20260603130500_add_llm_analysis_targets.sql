-- Queue/source table for tickers that should be analysed by a local LLM worker.
create table if not exists public.llm_analysis_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  company_name text not null default '',
  broker text not null default '',
  status text not null default 'pending' check (status in ('pending', 'running', 'analyzed', 'paused')),
  priority integer not null default 0,
  notes text,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
  unique (user_id, ticker, broker)
);

create index if not exists idx_llm_analysis_targets_user_id on public.llm_analysis_targets (user_id);
create index if not exists idx_llm_analysis_targets_user_status on public.llm_analysis_targets (user_id, status, priority desc, created_at asc);

alter table public.llm_analysis_targets enable row level security;

drop policy if exists "Users can view their own llm analysis targets" on public.llm_analysis_targets;
create policy "Users can view their own llm analysis targets"
  on public.llm_analysis_targets for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own llm analysis targets" on public.llm_analysis_targets;
create policy "Users can insert their own llm analysis targets"
  on public.llm_analysis_targets for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own llm analysis targets" on public.llm_analysis_targets;
create policy "Users can update their own llm analysis targets"
  on public.llm_analysis_targets for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own llm analysis targets" on public.llm_analysis_targets;
create policy "Users can delete their own llm analysis targets"
  on public.llm_analysis_targets for delete to authenticated
  using (auth.uid() = user_id);
