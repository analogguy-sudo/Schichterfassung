import { createClient } from 'npm:@supabase/supabase-js@2';

const encoder = new TextEncoder();
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const text = (value: unknown) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const date = (value: string) => value.replaceAll('-', '');
const sha256 = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
const utc = (day: string, time: string) => {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const localAsUtc = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
  return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
};
const utcStamp = (day: string, time: string) => utc(day, time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const types: Record<string, string> = { shift: 'Schicht', office: 'Büro', rest: 'Ruhe', vacation: 'Urlaub', sick: 'Krank' };

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token || token.length < 32) return new Response('Not found', { status: 404 });
  const { data: feed, error: feedError } = await db.from('calendar_feeds').select('user_id').eq('token_hash', await sha256(token)).maybeSingle();
  if (feedError || !feed) return new Response('Not found', { status: 404 });
  const { data: entries, error } = await db.from('entries').select('*').eq('user_id', feed.user_id).order('start_date');
  if (error) return new Response('Calendar temporarily unavailable', { status: 503 });

  const events = (entries || []).map((e) => {
    const timed = e.kind === 'shift' || e.kind === 'office';
    const startTime = e.actual_start || e.start_time;
    const endTime = e.actual_end || e.end_time;
    const summary = e.kind === 'shift' ? `Schicht ${e.shift_number || ''}`.trim() : types[e.kind];
    const uid = `${e.id}@schichterfassung`;
    const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`, `SUMMARY:${text(summary)}`];
    if (timed) {
      let endDate = e.start_date;
      if (endTime <= startTime) {
        const d = new Date(`${endDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); endDate = d.toISOString().slice(0, 10);
      }
      lines.push(`DTSTART:${utcStamp(e.start_date, startTime)}`, `DTEND:${utcStamp(endDate, endTime)}`);
      const description = [`Pause: ${e.break_minutes || 0} min`, ...(e.kind === 'shift' ? [`Frankfurt (7 min): ${e.frankfurt ? 'Ja' : 'Nein'}`] : []), ...(e.actual_start || e.actual_end ? ['Abweichung vom Dienstauftrag'] : [])].join('\n');
      lines.push(`DESCRIPTION:${text(description)}`);
    } else {
      const d = new Date(`${e.end_date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${date(e.start_date)}`, `DTEND;VALUE=DATE:${date(d.toISOString().slice(0, 10))}`);
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  });
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Schichterfassung//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR', ''].join('\r\n');
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="schichterfassung.ics"', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
});
