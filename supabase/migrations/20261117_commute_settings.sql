-- Arbeitsweg pro Nutzer: Wegezeit-Termin vor jeder Schicht im Kalender-Feed.
create table if not exists public.commute_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  walk_to_stop integer not null default 10 check (walk_to_stop between 0 and 120),
  from_stop_name text not null default '' check (char_length(from_stop_name) <= 120),
  from_stop_id text check (char_length(from_stop_id) <= 200),
  to_stop_name text not null default '' check (char_length(to_stop_name) <= 120),
  to_stop_id text check (char_length(to_stop_id) <= 200),
  walk_from_stop integer not null default 5 check (walk_from_stop between 0 and 120),
  buffer_minutes integer not null default 10 check (buffer_minutes between 0 and 120),
  ride_minutes integer not null default 20 check (ride_minutes between 1 and 240),
  updated_at timestamptz not null default now()
);
alter table public.commute_settings enable row level security;
revoke all on public.commute_settings from anon;
grant select, insert, update, delete on public.commute_settings to authenticated;
drop policy if exists "manage own commute" on public.commute_settings;
create policy "manage own commute" on public.commute_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
