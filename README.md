# Schichterfassung

Persönliche Web-App zur Erfassung von Schichten, Pausen und Abweichungen mit Monatsübersicht und iCalendar-Feed.

## Lokal starten

Python 3 wird benötigt; zusätzliche Pakete sind nicht nötig. Auf macOS `start.command` doppelklicken oder im Terminal `python3 server.py` ausführen. Danach `http://localhost:3000` öffnen.

Schichten werden in `shifts.json` neben dem Server gespeichert. Diese Datei ist in `.gitignore` eingetragen und wird nicht ins Repository übertragen.

## Kalender verbinden

In der App **Feed-Adresse kopieren** auswählen und diese Adresse in der Kalender-App als Kalenderabonnement hinzufügen. Der Server muss unter einer von deinem Kalender erreichbaren Adresse laufen. `localhost` ist nur auf dem eigenen Gerät erreichbar; für ein Abo von unterwegs braucht es später einen HTTPS-Server. **Kalenderdatei laden** exportiert eine `.ics`-Momentaufnahme.

GitHub speichert den Quellcode, führt den Python-Server aber nicht aus. GitHub Pages allein kann den dynamischen Kalender-Feed nicht bereitstellen.
