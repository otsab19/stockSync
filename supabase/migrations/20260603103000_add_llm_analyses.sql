-- Store locally generated LLM/Ollama analysis results for dashboard display.
create table if not exists public.llm_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  company_name text not null default '',
  broker text,
  analysis_date date not null default current_date,
  provider text not null default 'ollama',
  model text not null,
  recommendation text not null default 'unknown',
  confidence numeric,
  horizon text,
  thesis text,
  risks text,
  prompt text,
  raw_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_llm_analyses_user_id on public.llm_analyses (user_id);
create index if not exists idx_llm_analyses_user_created_at on public.llm_analyses (user_id, created_at desc);
create index if not exists idx_llm_analyses_user_ticker_date on public.llm_analyses (user_id, ticker, analysis_date desc);

alter table public.llm_analyses enable row level security;

drop policy if exists "Users can view their own llm analyses" on public.llm_analyses;
create policy "Users can view their own llm analyses"
  on public.llm_analyses for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own llm analyses" on public.llm_analyses;
create policy "Users can insert their own llm analyses"
  on public.llm_analyses for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own llm analyses" on public.llm_analyses;
create policy "Users can update their own llm analyses"
  on public.llm_analyses for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own llm analyses" on public.llm_analyses;
create policy "Users can delete their own llm analyses"
  on public.llm_analyses for delete to authenticated
  using (auth.uid() = user_id);
