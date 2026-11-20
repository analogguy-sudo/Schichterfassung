-- Feste Linien für den Arbeitsweg, z. B. "16, N16". Leer: jede Verbindung.
alter table public.commute_settings add column if not exists preferred_lines text not null default '';
