create extension if not exists pgcrypto;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('shift','office','rest','vacation','sick','dispo')),
  title text not null default '',
  shift_number text not null default '',
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes in (0,30,45)),
  actual_start time,
  actual_end time,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((kind in ('shift','office') and start_time is not null and end_time is not null) or (kind in ('rest','vacation','sick','dispo') and start_time is null and end_time is null)),
  check (kind = 'shift' or (actual_start is null and actual_end is null))
);
alter table public.entries add column if not exists title text not null default '';
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries add constraint entries_kind_check check (kind in ('shift','office','rest','vacation','sick','dispo'));
alter table public.entries drop constraint if exists entries_check1;
alter table public.entries add constraint entries_check1 check ((kind in ('shift','office') and start_time is not null and end_time is not null) or (kind in ('rest','vacation','sick','dispo') and start_time is null and end_time is null));
alter table public.entries enable row level security;
revoke all on public.entries from anon;
grant select, insert, update, delete on public.entries to authenticated;
drop policy if exists "read own entries" on public.entries;
drop policy if exists "insert own entries" on public.entries;
drop policy if exists "update own entries" on public.entries;
drop policy if exists "delete own entries" on public.entries;
create policy "read own entries" on public.entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own entries" on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own entries" on public.entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own entries" on public.entries for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token text,
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon;
grant select, insert, update, delete on public.calendar_feeds to authenticated;
drop policy if exists "manage own calendar feed" on public.calendar_feeds;
create policy "manage own calendar feed" on public.calendar_feeds for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table public.calendar_feeds add column if not exists token text;

-- Gutschrift bei Krankheit und manuell markierte Feiertagsarbeit
alter table public.entries add column if not exists sick_daily_minutes integer check (sick_daily_minutes between 0 and 1440);
alter table public.entries add column if not exists holiday_work boolean not null default false;
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
