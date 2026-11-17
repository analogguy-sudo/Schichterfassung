// Haltestellensuche für die Arbeitsweg-Einstellungen. Der RMV-Schlüssel bleibt auf dem Server.
// verify_jwt ist an: nur angemeldete Nutzer der App dürfen suchen.
const rmvKey = Deno.env.get('RMV_API_KEY') || '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const asArray = (value: any) => value == null ? [] : Array.isArray(value) ? value : [value];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!rmvKey) return json({ error: 'no_key', stops: [] });
  let query = '';
  try {
    query = String((await request.json())?.query ?? '').trim();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (query.length < 2 || query.length > 80) return json({ stops: [] });
  try {
    const params = new URLSearchParams({ accessId: rmvKey, format: 'json', input: query, type: 'S', maxNo: '8' });
    const response = await fetch(`https://www.rmv.de/hapi/location.name?${params}`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return json({ error: 'rmv', stops: [] }, 502);
    const data = await response.json();
    const raw = [
      ...asArray(data?.stopLocationOrCoordLocation).map((item: any) => item?.StopLocation),
      ...asArray(data?.StopLocation),
    ];
    const seen = new Set<string>();
    const stops = raw.filter((s: any) => s?.id && s?.name && !seen.has(s.id) && seen.add(s.id))
      .map((s: any) => ({ id: String(s.id), name: String(s.name) }));
    return json({ stops });
  } catch (error) {
    console.error('Stop search failed:', error instanceof Error ? error.message : error);
    return json({ error: 'rmv', stops: [] }, 502);
  }
});
