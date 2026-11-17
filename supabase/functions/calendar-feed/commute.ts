// Arbeitsweg-Berechnung für den Kalender-Feed. Reine Funktionen ohne Deno-Abhängigkeit, damit sie testbar bleiben.

export type CommuteSettings = {
  enabled: boolean;
  walk_to_stop: number;
  from_stop_name: string;
  from_stop_id: string | null;
  to_stop_name: string;
  to_stop_id: string | null;
  walk_from_stop: number;
  buffer_minutes: number;
  ride_minutes: number;
};

export type Departure = { day: string; time: string; line: string; arrival: string };

// Lokale Wandzeit um n Minuten verschieben (auch über Mitternacht).
export function shiftLocal(day: string, time: string, minutes: number) {
  const local = new Date(`${day}T${time.slice(0, 5)}:00Z`);
  local.setUTCMinutes(local.getUTCMinutes() + minutes);
  const iso = local.toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

// Spätester Zeitpunkt, zu dem man an der Ziel-Haltestelle ankommen muss.
export function latestArrival(day: string, shiftStart: string, s: CommuteSettings) {
  return shiftLocal(day, shiftStart, -(s.walk_from_stop + s.buffer_minutes));
}

// Feste Rechnung ohne Fahrplan.
export function fixedLeave(day: string, shiftStart: string, s: CommuteSettings) {
  return shiftLocal(day, shiftStart, -(s.walk_to_stop + s.ride_minutes + s.walk_from_stop + s.buffer_minutes));
}

const asArray = <T>(value: T | T[] | undefined | null): T[] => value == null ? [] : Array.isArray(value) ? value : [value];

// Haltestellen aus einer RMV location.name-Antwort.
export function parseStops(json: any): { id: string; name: string }[] {
  const raw = [
    ...asArray(json?.stopLocationOrCoordLocation).map((item: any) => item?.StopLocation),
    ...asArray(json?.StopLocation),
  ];
  const seen = new Set<string>();
  return raw.filter((stop: any) => stop?.id && stop?.name).filter((stop: any) => {
    if (seen.has(stop.id)) return false;
    seen.add(stop.id);
    return true;
  }).map((stop: any) => ({ id: String(stop.id), name: String(stop.name) }));
}

// Aus einer RMV trip-Antwort die späteste Verbindung wählen, die rechtzeitig ankommt.
export function pickTrip(json: any, arriveBy: { day: string; time: string }): Departure | null {
  const target = `${arriveBy.day}T${arriveBy.time}`;
  let best: Departure | null = null;
  let bestArrival = '';
  for (const trip of asArray(json?.Trip)) {
    const legs = asArray(trip?.LegList?.Leg);
    const first = trip?.Origin ?? legs[0]?.Origin;
    const last = trip?.Destination ?? legs[legs.length - 1]?.Destination;
    if (!first?.date || !first?.time || !last?.date || !last?.time) continue;
    const arrival = `${last.date}T${String(last.time).slice(0, 5)}`;
    if (arrival > target) continue;
    if (arrival <= bestArrival) continue;
    const ride = legs.find((leg: any) => leg?.type === 'JNY');
    const line = String(ride?.Product?.[0]?.name ?? ride?.Product?.name ?? ride?.name ?? '').trim();
    bestArrival = arrival;
    best = { day: String(first.date), time: String(first.time).slice(0, 5), line, arrival: String(last.time).slice(0, 5) };
  }
  return best;
}
