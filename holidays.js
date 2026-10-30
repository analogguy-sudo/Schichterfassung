/* German statutory holidays, rules checked 2026-10-30.
 * Civil-day calculations deliberately use UTC as a neutral calendar: results do
 * not depend on the device's timezone or daylight-saving changes.
 * Sources and regional scope: FEIERTAGE.md. No network requests are needed.
 */
(function (root) {
  'use strict';
  const MINUTES = 468, DAY = 86400000, MIN_YEAR = 2020, MAX_YEAR = 2099;
  const states = Object.freeze({BW:'Baden-Württemberg',BY:'Bayern',BE:'Berlin',BB:'Brandenburg',HB:'Bremen',HH:'Hamburg',HE:'Hessen',MV:'Mecklenburg-Vorpommern',NI:'Niedersachsen',NW:'Nordrhein-Westfalen',RP:'Rheinland-Pfalz',SL:'Saarland',SN:'Sachsen',ST:'Sachsen-Anhalt',SH:'Schleswig-Holstein',TH:'Thüringen'});
  const cache = new Map();
  const iso = date => date.toISOString().slice(0, 10);
  const midnight = day => Date.parse(day + 'T00:00:00Z');
  function easter(year) {
    // Gregorian Meeus/Jones/Butcher algorithm.
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    return new Date(Date.UTC(year,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1));
  }
  function supported(year) { return Number.isInteger(year) && year>=MIN_YEAR && year<=MAX_YEAR; }
  function dates(year, state, options={}) {
    if (!supported(year) || !Object.hasOwn(states,state)) return [];
    const key=JSON.stringify([year,state,!!options.assumption,!!options.augsburg,!!options.corpusChristi]);
    if (cache.has(key)) return cache.get(key).map(x=>({...x}));
    const holidays=new Map(),add=(month,day,name)=>holidays.set(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,name);
    const movable=(offset,name)=>holidays.set(iso(new Date(easter(year).getTime()+offset*DAY)),name);
    add(1,1,'Neujahr');movable(-2,'Karfreitag');movable(1,'Ostermontag');add(5,1,'Tag der Arbeit');movable(39,'Christi Himmelfahrt');movable(50,'Pfingstmontag');add(10,3,'Tag der Deutschen Einheit');add(12,25,'1. Weihnachtsfeiertag');add(12,26,'2. Weihnachtsfeiertag');
    if (['BW','BY','ST'].includes(state)) add(1,6,'Heilige Drei Könige');
    if (state==='BE'||state==='MV'&&year>=2023) add(3,8,'Internationaler Frauentag');
    if (state==='BB') {movable(0,'Ostersonntag');movable(49,'Pfingstsonntag');}
    if (['BW','BY','HE','NW','RP','SL'].includes(state)||['SN','TH'].includes(state)&&options.corpusChristi) movable(60,'Fronleichnam');
    if (state==='SL'||state==='BY'&&options.assumption) add(8,15,'Mariä Himmelfahrt');
    if (state==='BY'&&options.augsburg) add(8,8,'Augsburger Friedensfest');
    if (state==='TH') add(9,20,'Weltkindertag');
    if (['BB','HB','HH','MV','NI','SN','ST','SH','TH'].includes(state)) add(10,31,'Reformationstag');
    if (['BW','BY','NW','RP','SL'].includes(state)) add(11,1,'Allerheiligen');
    if (state==='SN') {
      const november23=new Date(Date.UTC(year,10,23));
      const daysBack=(november23.getUTCDay()-3+7)%7||7;
      holidays.set(iso(new Date(november23.getTime()-daysBack*DAY)),'Buß- und Bettag');
    }
    if (state==='BE'&&[2020,2025].includes(year)) add(5,8,'Tag der Befreiung (einmaliger Feiertag)');
    if (state==='BE'&&year===2028) add(6,17,'Volksaufstand vom 17. Juni 1953 (einmaliger Feiertag)');
    const result=[...holidays].sort(([a],[b])=>a.localeCompare(b)).map(([date,name])=>({date,name}));
    cache.set(key,result);return result.map(x=>({...x}));
  }
  function timeMinutes(value) {
    if (!/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(String(value||''))) return null;
    const [h,m,s=0]=value.split(':').map(Number);
    return h<24&&m<60&&s<60?h*60+m+s/60:null;
  }
  function workTouchesDay(entry, day) {
    if (!['shift','office'].includes(entry.kind)) return false;
    const start=timeMinutes(entry.actual_start||entry.start_time),end=timeMinutes(entry.actual_end||entry.end_time);
    if (start===null||end===null) return false;
    const first=midnight(entry.start_date)+start*60000;
    const last=midnight(entry.start_date)+(end+(end<=start?1440:0))*60000;
    const dayStart=midnight(day);
    // Half-open intervals: ending at 00:00 does not count as working that day.
    return first<dayStart+DAY && last>dayStart;
  }
  const coversDay=(entry,day)=>entry.start_date<=day&&(entry.end_date||entry.start_date)>=day;
  function credits(entries,from,to,state,options={}) {
    if (!Object.hasOwn(states,state)||from>to) return [];
    const result=[];
    for(let year=Math.max(MIN_YEAR,Number(from.slice(0,4)));year<=Math.min(MAX_YEAR,Number(to.slice(0,4)));year++) {
      for(const holiday of dates(year,state,options)) {
        const day=holiday.date;if(day<from||day>to)continue;
        const blocked=entries.some(e=>['sick','vacation'].includes(e.kind)&&coversDay(e,day));
        const working=entries.filter(e=>workTouchesDay(e,day));
        const resting=entries.filter(e=>e.kind==='rest'&&coversDay(e,day));
        const qualified=!blocked&&(working.length>0||resting.length>0);
        result.push({...holiday,minutes:qualified?MINUTES:0,reason:blocked?'Urlaub / Krank':working.length?'Dienst, auch über Mitternacht':resting.length?'Ruhetag':'Kein Ruhe- oder Arbeitseintrag',entryIds:qualified?[...new Set([...working,...resting].map(e=>e.id))]:[]});
      }
    }
    return result;
  }
  const api=Object.freeze({states,dates,credits,workTouchesDay,supported,MINUTES,MIN_YEAR,MAX_YEAR});
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.SchichtHolidays=api;
})(typeof window==='object'?window:globalThis);
