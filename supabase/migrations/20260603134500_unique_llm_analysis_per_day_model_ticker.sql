-- Keep one analysis per user, ticker, analysis date, and model.
with ranked_analyses as (
  select
    id,
    row_number() over (
      partition by user_id, ticker, analysis_date, model
      order by updated_at desc, created_at desc, id desc
    ) as row_rank
  from public.llm_analyses
)
delete from public.llm_analyses
using ranked_analyses
where public.llm_analyses.id = ranked_analyses.id
  and ranked_analyses.row_rank > 1;

create unique index if not exists idx_llm_analyses_unique_daily_model_ticker
  on public.llm_analyses (user_id, ticker, analysis_date, model);
