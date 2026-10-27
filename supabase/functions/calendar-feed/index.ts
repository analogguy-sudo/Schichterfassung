const encoder = new TextEncoder();
const projectUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

const entryTypes: Record<string, string> = {
  shift: 'Schicht', office: 'Büro', rest: 'Ruhe', vacation: 'Urlaub', sick: 'Krank',
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

    const entryParams = new URLSearchParams({
      select: '*',
      user_id: `eq.${feeds[0].user_id}`,
      order: 'start_date.asc',
    });
    const entries = await getRows<any>('entries', entryParams);
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const events = entries.map((entry) => {
      const timed = entry.kind === 'shift' || entry.kind === 'office';
      const startTime = entry.actual_start || entry.start_time;
      const endTime = entry.actual_end || entry.end_time;
      const summary = entry.kind === 'shift'
        ? `Schicht ${entry.shift_number || ''}`.trim()
        : entryTypes[entry.kind] || 'Eintrag';
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
          ...(entry.kind === 'shift' ? [`Frankfurt (7 min): ${entry.frankfurt ? 'Ja' : 'Nein'}`] : []),
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
      return lines.join('\r\n');
    });

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
