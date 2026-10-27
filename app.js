const $ = (selector) => document.querySelector(selector);
const now = new Date();
let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
let shifts = [];
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function duration(s) { const begin=s.actualStart||s.start, end=s.actualEnd||s.end; let [sh,sm]=begin.split(':').map(Number), [eh,em]=end.split(':').map(Number); let mins=eh*60+em-(sh*60+sm); if(mins<=0) mins+=1440; return mins-Number(s.breakMinutes||0)+(s.frankfurt?7:0); }
function fmtMinutes(m) { return `${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`; }
async function save() { await fetch('/api/shifts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(shifts)}); }
function toast(text) { const el=$('#toast'); el.textContent=text; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2300); }
function inMonth(s) { const d=new Date(`${s.date}T12:00:00`); return d.getFullYear()===cursor.getFullYear()&&d.getMonth()===cursor.getMonth(); }
function render() {
  $('#monthTitle').textContent=monthFmt.format(cursor); $('#listMonth').textContent=monthFmt.format(cursor);
  const grid=$('#calendarGrid'); grid.innerHTML='';
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1); const offset=(first.getDay()+6)%7; const start=new Date(cursor.getFullYear(),cursor.getMonth(),1-offset);
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const cell=document.createElement('div');cell.className='day'+(d.getMonth()!==cursor.getMonth()?' dim':'')+(localDate(d)===localDate(now)?' today':'')+(shifts.some(s=>s.date===localDate(d))?' has-shift':'');cell.textContent=d.getDate();grid.append(cell);}
  const list=shifts.filter(inMonth).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  $('#statCount').textContent=list.length; $('#statHours').innerHTML=`${Math.floor(list.reduce((sum,s)=>sum+duration(s),0)/60)}<small> h</small>`; $('#statDeviations').textContent=list.filter(s=>s.actualStart||s.actualEnd).length;
  const container=$('#shiftList');container.innerHTML='';$('#emptyState').style.display=list.length?'none':'flex';
  for(const s of list){const d=new Date(`${s.date}T12:00:00`);const changed=s.actualStart||s.actualEnd;const row=document.createElement('div');row.className='shift-row';row.innerHTML=`<div class="shift-date"><b>${String(d.getDate()).padStart(2,'0')}</b><br>${dateFmt.format(d).split(' ')[0].toUpperCase()}</div><div class="shift-info"><b>Schicht ${escapeHtml(s.number)}</b><span>${s.actualStart||s.start} – ${s.actualEnd||s.end}${s.frankfurt?' · Frankfurt +7 min':''}</span></div><span class="shift-length">${fmtMinutes(duration(s))}</span><span class="badge ${changed?'deviation-badge':''}">${changed?'Abweichung':(s.breakMinutes?`Pause ${s.breakMinutes}′`:'Keine Pause')}</span><button class="delete" aria-label="Schicht löschen">×</button>`;row.querySelector('.delete').onclick=async()=>{shifts=shifts.filter(x=>x.id!==s.id);await save();render();toast('Schicht gelöscht');};container.append(row);}
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('#todayLabel').textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(now);
$('#prevMonth').onclick=()=>{cursor.setMonth(cursor.getMonth()-1);render()}; $('#nextMonth').onclick=()=>{cursor.setMonth(cursor.getMonth()+1);render()};
$('#shiftForm').elements.date.value=localDate(now);
$('#shiftForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const item={id:crypto.randomUUID(),number:f.get('number').trim(),date:f.get('date'),start:f.get('start'),end:f.get('end'),breakMinutes:Number(f.get('breakMinutes')),frankfurt:f.has('frankfurt'),actualStart:f.get('actualStart'),actualEnd:f.get('actualEnd')};if(!item.number)return;shifts.push(item);await save();cursor=new Date(`${item.date}T12:00:00`);cursor.setDate(1);render();e.currentTarget.reset();e.currentTarget.elements.date.value=localDate(now);toast('Schicht gespeichert');};
$('#copyFeed').onclick=async()=>{const url=`${location.origin}/calendar.ics`;try{await navigator.clipboard.writeText(url);toast('Feed-Adresse kopiert')}catch{prompt('Feed-Adresse kopieren:',url)}};
fetch('/api/shifts').then(r=>r.json()).then(data=>{shifts=data;render()}).catch(()=>{toast('Server nicht erreichbar – bitte über start.command öffnen')});
