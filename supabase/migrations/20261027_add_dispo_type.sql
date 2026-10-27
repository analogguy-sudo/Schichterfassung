alter table public.entries
  drop constraint if exists entries_kind_check;

alter table public.entries
  add constraint entries_kind_check
  check (kind in ('shift', 'office', 'rest', 'vacation', 'sick', 'dispo'));

alter table public.entries
  drop constraint if exists entries_check1;

alter table public.entries
  add constraint entries_check1
  check (
    (kind in ('shift', 'office') and start_time is not null and end_time is not null)
    or (kind in ('rest', 'vacation', 'sick', 'dispo') and start_time is null and end_time is null)
  );
