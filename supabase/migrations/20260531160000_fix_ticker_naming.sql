-- Fix ticker naming issues in existing data
-- 1. Rename GIG → BBAI (BigBear.ai was renamed from GigCapital4)
-- 2. Strip trailing lowercase 'l' from LSE tickers stored by eToro (e.g. RRl → RR, BPl → BP, ULVRl → ULVR)

-- Fix activity_events
update public.activity_events
set ticker = 'BBAI'
where ticker = 'GIG' and broker = 'etoro';

-- Strip .L / .LSE / .LON suffixes
update public.activity_events
set ticker = regexp_replace(ticker, '\.(L|LSE|LON)$', '', 'i')
where ticker ~ '\.(L|LSE|LON)$';

-- Strip trailing lowercase 'l' where rest is uppercase (eToro LSE pattern)
update public.activity_events
set ticker = substring(ticker from 1 for length(ticker) - 1)
where ticker ~ '^[A-Z]+l$' and broker = 'etoro';

-- Fix positions table
update public.positions
set ticker = 'BBAI'
where ticker = 'GIG' and broker = 'etoro';

update public.positions
set ticker = regexp_replace(ticker, '\.(L|LSE|LON)$', '', 'i')
where ticker ~ '\.(L|LSE|LON)$';

update public.positions
set ticker = substring(ticker from 1 for length(ticker) - 1)
where ticker ~ '^[A-Z]+l$' and broker = 'etoro';

-- Fix portfolio_snapshots
update public.portfolio_snapshots
set ticker = 'BBAI'
where ticker = 'GIG' and broker = 'etoro';

update public.portfolio_snapshots
set ticker = regexp_replace(ticker, '\.(L|LSE|LON)$', '', 'i')
where ticker ~ '\.(L|LSE|LON)$';

update public.portfolio_snapshots
set ticker = substring(ticker from 1 for length(ticker) - 1)
where ticker ~ '^[A-Z]+l$' and broker = 'etoro';

