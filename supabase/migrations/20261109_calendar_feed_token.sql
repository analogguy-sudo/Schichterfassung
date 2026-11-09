-- Feed-Link im eigenen Konto speichern, damit alle Geräte denselben Link verwenden.
-- Nur die eigene Zeile ist lesbar (RLS "manage own calendar feed"); die Edge Function prüft weiter token_hash.
alter table public.calendar_feeds add column if not exists token text;
