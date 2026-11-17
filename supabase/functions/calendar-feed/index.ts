import { type CommuteSettings, type Departure, fixedLeave, latestArrival, parseStops, pickTrip } from './commute.ts';

const encoder = new TextEncoder();
const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const rmvKey = Deno.env.get('RMV_API_KEY') || '';
const RMV_BASE = 'https://www.rmv.de/hapi';
// Fahrplan nur für die nächsten Tage abfragen; spätere Schichten nutzen die feste Fahrzeit.
const LIVE_DAYS = 14;
const restHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

const escapeIcs = (value: unknown) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const dateStamp = (value: string) => value.replaceAll('-', '');

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function lastSunday(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

function berlinOffsetMinutes(day: string, time: string) {
  const [year, month, date] = day.split('-').map(Number);
  const marchSunday = lastSunday(year, 3);
  const octoberSunday = lastSunday(year, 10);
  const summerTime = month > 3 && month < 10
    || (month === 3 && (date > marchSunday || (date === marchSunday && time >= '02:00')))
    || (month === 10 && (date < octoberSunday || (date === octoberSunday && time < '03:00')));
  return summerTime ? 120 : 60;
}

function utcStamp(day: string, time: string) {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date, hour, minute) - berlinOffsetMinutes(day, time) * 60_000);
  return utc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function getRows<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const response = await fetch(`${projectUrl}/rest/v1/${table}?${params}`, { headers: restHeaders });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return await response.json();
}

async function rmv(path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ ...params, accessId: rmvKey, format: 'json' });
  const response = await fetch(`${RMV_BASE}/${path}?${query}`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`RMV ${path} ${response.status}`);
  return await response.json();
}

// Fehlende Haltestellen-IDs einmalig über den Namen auflösen und speichern.
async function resolveStops(userId: string, settings: CommuteSettings) {
  const patch: Record<string, string> = {};
  for (const side of ['from', 'to'] as const) {
    const idKey = `${side}_stop_id` as const;
    const name = settings[`${side}_stop_name`];
    if (settings[idKey] || !name) continue;
    const stop = parseStops(await rmv('location.name', { input: name, type: 'S', maxNo: '1' }))[0];
    if (!stop) continue;
    settings[idKey] = stop.id;
    patch[idKey] = stop.id;
  }
  if (Object.keys(patch).length) {
    await fetch(`${projectUrl}/rest/v1/commute_settings?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...restHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  }
}

async function liveDeparture(day: string, shiftStart: string, settings: CommuteSettings): Promise<Departure | null> {
  const arriveBy = latestArrival(day, shiftStart, settings);
  const json = await rmv('trip', {
    originId: settings.from_stop_id!,
    destId: settings.to_stop_id!,
    date: arriveBy.day,
    time: arriveBy.time,
    searchForArrival: '1',
    numB: '2',
    numF: '0',
  });
  return pickTrip(json, arriveBy);
}

function commuteEvent(entry: any, now: string, settings: CommuteSettings, live: Departure | null) {
  const shiftStart = entry.start_time;
  const from = settings.from_stop_name || 'Start-Haltestelle';
  const to = settings.to_stop_name || 'Ziel-Haltestelle';
  const leave = live
    ? (() => {
      const at = new Date(`${live.day}T${live.time}:00Z`);
      at.setUTCMinutes(at.getUTCMinutes() - settings.walk_to_stop);
      const iso = at.toISOString();
      return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
    })()
    : fixedLeave(entry.start_date, shiftStart, settings);
  const line = live?.line ? live.line.replace(/\s+/g, ' ') : '';
  const summary = live
    ? `🚶 Los · ${leave.time}${line ? ` · ${line}` : ''} ab ${live.time}`
    : `🚶 Los · ${leave.time}`;
  const description = [
    `${settings.walk_to_stop} min Fußweg zu ${from}`,
    live
      ? `${line || 'Abfahrt'} ${live.time} → an ${to} ${live.arrival} (laut RMV-Fahrplan)`
      : `ca. ${settings.ride_minutes} min Fahrt bis ${to} (feste Fahrzeit)`,
    `${settings.walk_from_stop} min Fußweg zur Dienststelle`,
    `${settings.buffer_minutes} min Puffer vor Dienstbeginn ${shiftStart.slice(0, 5)}`,
  ].join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${entry.id}-weg@schichterfassung`,
    `DTSTAMP:${now}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DTSTART:${utcStamp(leave.day, leave.time)}`,
    `DTEND:${utcStamp(entry.start_date, shiftStart)}`,
    `LOCATION:${escapeIcs(from)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs('Gleich los zur Bahn!')}`,
    'TRIGGER:-PT5M',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs('Jetzt los zur Bahn!')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

async function commuteEvents(userId: string, entries: any[], now: string) {
  const [settings] = await getRows<CommuteSettings>('commute_settings', new URLSearchParams({
    select: '*', user_id: `eq.${userId}`, limit: '1',
  }));
  if (!settings?.enabled) return new Map<string, string>();
  const shifts = entries.filter((entry) => entry.kind === 'shift' && entry.start_time);
  const live = new Map<string, Departure | null>();
  if (rmvKey && settings.from_stop_name && settings.to_stop_name) {
    try {
      await resolveStops(userId, settings);
    } catch (error) {
      console.error('Stop lookup failed:', error instanceof Error ? error.message : error);
    }
    if (settings.from_stop_id && settings.to_stop_id) {
      const today = new Date().toISOString().slice(0, 10);
      const limit = new Date(Date.now() + LIVE_DAYS * 86_400_000).toISOString().slice(0, 10);
      const upcoming = shifts.filter((entry) => entry.start_date >= today && entry.start_date <= limit);
      // In kleinen Gruppen abfragen, damit der RMV nicht überlastet wird.
      for (let i = 0; i < upcoming.length; i += 4) {
        await Promise.all(upcoming.slice(i, i + 4).map(async (entry) => {
          try {
            live.set(entry.id, await liveDeparture(entry.start_date, entry.start_time, settings));
          } catch (error) {
            console.error('Trip lookup failed:', error instanceof Error ? error.message : error);
          }
        }));
      }
    }
  }
  const events = new Map<string, string>();
  for (const entry of shifts) events.set(entry.id, commuteEvent(entry, now, settings, live.get(entry.id) ?? null));
  return events;
}

const entryTypes: Record<string, string> = {
  shift: 'Schicht', office: 'Büro', rest: 'Ruhe', vacation: 'Urlaub', sick: 'Krank', dispo: 'Dispo-Tag',
};

Deno.serve(async (request) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || token.length < 32) return new Response('Not found', { status: 404 });

  try {
    const feedParams = new URLSearchParams({
      select: 'user_id',
      token_hash: `eq.${await sha256(token)}`,
      limit: '1',
    });
    const feeds = await getRows<{ user_id: string }>('calendar_feeds', feedParams);
    if (!feeds[0]) return new Response('Not found', { status: 404 });
    const userId = feeds[0].user_id;

    const entryParams = new URLSearchParams({
      select: '*',
      user_id: `eq.${userId}`,
      order: 'start_date.asc',
    });
    const entries = await getRows<any>('entries', entryParams);
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    let commute = new Map<string, string>();
    try {
      commute = await commuteEvents(userId, entries, now);
    } catch (error) {
      // Der Feed soll auch ohne Wegezeit funktionieren.
      console.error('Commute failed:', error instanceof Error ? error.message : error);
    }

    const events: string[] = [];
    for (const entry of entries) {
      const timed = entry.kind === 'shift' || entry.kind === 'office';
      const startTime = entry.actual_start || entry.start_time;
      const endTime = entry.actual_end || entry.end_time;
      const title = entry.kind === 'shift'
        ? `Schicht ${entry.shift_number || ''}`.trim()
        : entry.kind === 'office' ? entry.title?.trim() || 'Büro'
        : entryTypes[entry.kind] || 'Eintrag';
      // Kalender-Apps zeigen im Monatsfeld oft nur den Beginn, daher die Zeitspanne im Titel.
      const summary = timed ? `${title} · ${startTime.slice(0, 5)}–${endTime.slice(0, 5)}` : title;
      const lines = [
        'BEGIN:VEVENT',
        `UID:${entry.id}@schichterfassung`,
        `DTSTAMP:${now}`,
        `SUMMARY:${escapeIcs(summary)}`,
      ];

      if (timed) {
        let endDate = entry.start_date;
        if (endTime <= startTime) {
          const nextDay = new Date(`${endDate}T12:00:00Z`);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          endDate = nextDay.toISOString().slice(0, 10);
        }
        lines.push(`DTSTART:${utcStamp(entry.start_date, startTime)}`);
        lines.push(`DTEND:${utcStamp(endDate, endTime)}`);
        const description = [
          `Pause: ${entry.break_minutes || 0} min`,
          ...(entry.actual_start || entry.actual_end ? ['Abweichung vom Dienstauftrag'] : []),
        ].join('\n');
        lines.push(`DESCRIPTION:${escapeIcs(description)}`);
      } else {
        const dayAfter = new Date(`${entry.end_date}T12:00:00Z`);
        dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${dateStamp(entry.start_date)}`);
        lines.push(`DTEND;VALUE=DATE:${dateStamp(dayAfter.toISOString().slice(0, 10))}`);
      }

      lines.push('END:VEVENT');
      events.push(lines.join('\r\n'));
      const way = commute.get(entry.id);
      if (way) events.push(way);
    }

    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schichterfassung//DE',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR', '',
    ].join('\r\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="schichterfassung.ics"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Calendar feed request failed:', error instanceof Error ? error.message : 'Unknown error');
    return new Response('Calendar temporarily unavailable', { status: 503 });
  }
});
