-- Add API secret columns to profiles for broker authentication
alter table public.profiles add column if not exists t212_api_secret text;
alter table public.profiles add column if not exists etoro_api_secret text;

