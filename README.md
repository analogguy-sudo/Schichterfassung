# Schichterfassung

Private Web-App für Schicht, Büro, Ruhe, Urlaub und Krank. Die Oberfläche wird als GitHub Pages Seite ausgeliefert; Supabase speichert angemeldete Einträge mit Row Level Security und stellt den iCalendar-Feed über eine Edge Function bereit.

## Supabase einmalig einrichten

1. Ein eigenes Supabase-Projekt **Schichterfassung** anlegen (nicht das Projekt einer anderen App verwenden).
2. Im SQL Editor den Inhalt von `supabase/schema.sql` ausführen.
3. Unter Project Settings → API die Project URL und den Publishable Key in `config.js` einsetzen. Der Publishable Key darf im Frontend stehen; niemals den `service_role`-Key eintragen.
4. `supabase/functions/calendar-feed/index.ts` als Edge Function `calendar-feed` deployen und `supabase/config.toml` mit deployen. `verify_jwt` ist ausgeschaltet, weil Kalender-Apps keinen Supabase-Login mitsenden; die Funktion prüft stattdessen einen langen, widerrufbaren Feed-Token.
5. In Supabase Authentication E-Mail/Passwort aktiv lassen. Über die App Konto erstellen und anmelden.

Nach dem Verbinden werden neue Einträge in Supabase gespeichert. Ohne Supabase bleibt die App auf diesem Gerät nutzbar; dort gibt es `.ics`-Export, aber kein abonnierbares Feed.

## Einträge

- **Schicht:** Schichtnummer, Dienstzeiten, Pause (keine/30/45 Min.), Frankfurt (7 Min.) und abweichende tatsächliche Zeiten.
- **Büro:** Beginn, Ende und Pause.
- **Ruhe, Urlaub, Krank:** Ganztägige Einträge; Urlaub und Krank können über mehrere Tage gehen.

Die Supabase-Tabelle ist mit Row Level Security auf den angemeldeten Nutzer begrenzt. Die Kalender-Feed-Adresse enthält ein geheimes Token. Jeder, der diese Adresse kennt, kann den Kalender abonnieren; mit „Feed-Link erneuern“ wird der vorherige Link ungültig.
