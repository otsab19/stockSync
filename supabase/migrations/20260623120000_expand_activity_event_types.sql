alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (event_type in ('buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'fx'));
