# Schichterfassung

Private Web-App für Schicht, Büro, Ruhe, Urlaub, Krank und Dispo-Tage. Die Oberfläche wird als GitHub Pages Seite ausgeliefert; Supabase speichert angemeldete Einträge mit Row Level Security und stellt den iCalendar-Feed über eine Edge Function bereit.

## Supabase einmalig einrichten

1. Ein eigenes Supabase-Projekt **Schichterfassung** anlegen (nicht das Projekt einer anderen App verwenden).
2. Im SQL Editor den Inhalt von `supabase/schema.sql` ausführen.
3. Unter Project Settings → API die Project URL und den Publishable Key in `config.js` einsetzen. Der Publishable Key darf im Frontend stehen; niemals den `service_role`-Key eintragen.
4. `supabase/functions/calendar-feed/index.ts` als Edge Function `calendar-feed` deployen und `supabase/config.toml` mit deployen. `verify_jwt` ist ausgeschaltet, weil Kalender-Apps keinen Supabase-Login mitsenden; die Funktion prüft stattdessen einen langen, widerrufbaren Feed-Token.
5. In Supabase Authentication E-Mail/Passwort und die E-Mail-Bestätigung aktiv lassen. Site URL auf `https://analogguy-sudo.github.io/Schichterfassung/` setzen und `https://analogguy-sudo.github.io/Schichterfassung/**` als Redirect URL erlauben.

Die Kalender- und Stundenansicht ist erst nach einer vom Server geprüften Anmeldung sichtbar. Ohne Anmeldung erscheint nur die Startseite zum Anmelden. Frühere lokale Einträge werden nicht als Ersatz für Kontodaten geladen.

## Einladungen und Anmeldung

- Eingeladene Nutzer öffnen den Einladungslink aus ihrer E-Mail. Die App erkennt `type=invite`, prüft die Sitzung und zeigt „Passwort festlegen“. Eine erneute Registrierung ist nicht erforderlich.
- Die Passwort-Einrichtung bleibt bei einem Neuladen im selben Tab erhalten. Ein ungültiger oder abgelaufener Link öffnet keine Kalenderdaten.
- Für bestehende Konten gibt es „Passwort vergessen?“. Ein Wiederherstellungslink öffnet ebenfalls die Passwortseite.
- Neue selbst registrierte Nutzer bestätigen ihre E-Mail über den Bestätigungslink. Die E-Mail-Bestätigung bleibt aktiv.
- Die Oberfläche verwendet den Publishable Key. Die Datenbank muss weiterhin Row Level Security mit Nutzerbindung erzwingen; das Ausblenden der Oberfläche ersetzt diese Regeln nicht.

## Einträge

- **Schicht:** Schichtnummer, Dienstzeiten, Pause (keine/30/45 Min.) und abweichende tatsächliche Zeiten.
- **Büro:** Beginn, Ende und Pause; optional mit eigener Bezeichnung für den Kalender.
- **Ruhe, Urlaub, Krank, Dispo-Tag:** Ganztägige Einträge; Abwesenheiten können über mehrere Tage gehen.

Bei einer bereits eingerichteten Supabase-Datenbank die Migration `supabase/migrations/20261027_add_dispo_type.sql` einmal im SQL Editor ausführen.

Die Supabase-Tabelle ist mit Row Level Security auf den angemeldeten Nutzer begrenzt. Die Kalender-Feed-Adresse enthält ein geheimes Token. Jeder, der diese Adresse kennt, kann den Kalender abonnieren; mit „Feed-Link erneuern“ wird der vorherige Link ungültig.
