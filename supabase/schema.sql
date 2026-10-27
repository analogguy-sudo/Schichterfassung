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
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon;
grant select, insert, update, delete on public.calendar_feeds to authenticated;
drop policy if exists "manage own calendar feed" on public.calendar_feeds;
create policy "manage own calendar feed" on public.calendar_feeds for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
