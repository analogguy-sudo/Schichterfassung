const authUrl=new URL(window.location.href), authHash=new URLSearchParams(authUrl.hash.slice(1));
const authLink={type:authHash.get('type')||authUrl.searchParams.get('type')||'',tokenHash:authUrl.searchParams.get('token_hash'),error:authHash.get('error')||authUrl.searchParams.get('error'),hasTokens:!!authHash.get('access_token')};
let authReady=false,needsPasswordSetup=false,authBooting=true,authGeneration=0,authNotice='',initialSetup=['invite','recovery'].includes(authLink.type)&&(authLink.hasTokens||!!authLink.tokenHash)?authLink.type:'';
let awaitingLinkConfirmation=!!authLink.tokenHash;
const AUTH_REDIRECT_URL='https://analogguy-sudo.github.io/Schichterfassung/';
const $=s=>document.querySelector(s), form=$('#entryForm'), TYPES={shift:'Schicht',office:'Büro',rest:'Ruhe',vacation:'Urlaub',sick:'Krank',dispo:'Dispo-Tag'};
function authErrorText(error){const message=String(error?.message||'').toLowerCase();if(error?.code==='over_email_send_rate_limit'||message.includes('email rate limit exceeded'))return 'Der Supabase-Mailversand hat sein Limit erreicht (2 E-Mails pro Stunde für das ganze Projekt). Bitte warte bis zu einer Stunde und versuche es dann erneut. Mit eigenem SMTP-Mailversand lässt sich dieses enge Standardlimit vermeiden.';if(error?.code==='email_address_not_authorized'||message.includes('email address not authorized'))return 'Der Supabase-Standardversand darf nur an Projektmitglieder senden. Für andere E-Mail-Adressen muss in Supabase ein eigener SMTP-Mailversand eingerichtet werden.';return error?.message||'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'}
const today=new Date(), dateISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthFmt=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}), dayFmt=new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}), longDayFmt=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
let cursor=new Date(today.getFullYear(),today.getMonth(),1), entries=[], user=null, supa=null, authMode='login', editingId=null, selectedDate=null, dayPanelMode='form';
const config=window.SCHICHTPLAN_CONFIG||{};
if(window.supabase?.createClient&&config.url&&config.publishableKey&&!config.url.includes('DEIN_')&&!config.publishableKey.includes('DEIN_')){supa=window.supabase.createClient(config.url,config.publishableKey,{auth:{detectSessionInUrl:true,flowType:'implicit',persistSession:true,autoRefreshToken:true}});}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function showMode(){
 window.schichtFriends?.setSession(supa,authReady&&!needsPasswordSetup?user:null,entries);
 const ready=!!(supa&&user&&authReady&&!needsPasswordSetup&&!awaitingLinkConfirmation);
 $('#appContent').hidden=!ready;$('#authGate').hidden=ready;
 $('#storageStatus').textContent=ready?'Sicher in Supabase gespeichert':user&&needsPasswordSetup?'Konto einrichten':authReady?'Bitte anmelden':'Anmeldung wird geprüft…';
 $('.status-dot').classList.toggle('online',ready);
 $('#authButton').textContent=user?'Abmelden':'Anmelden';$('#authButton').disabled=!supa||!authReady;
 $('#copyFeed').hidden=!ready;$('#rotateFeed').hidden=!ready;
 $('#feedHint').textContent='Dein Feed-Link ist geheim. Wer den Link kennt, kann deinen Kalender lesen.';
 $('#passwordSetupForm').hidden=!(user&&needsPasswordSetup);
 $('#gateLogin').textContent=awaitingLinkConfirmation?'Passwort festlegen':'Anmelden';
 $('#gateLogin').hidden=!!(user&&needsPasswordSetup);$('#gateLogin').disabled=!supa||!authReady;
 $('#gateTitle').textContent=user&&needsPasswordSetup?'Dein Konto einrichten':'Deine Schichten. Dein Konto.';
 $('#gateMessage').textContent=awaitingLinkConfirmation?'Klicke auf „Passwort festlegen“, um deinen E-Mail-Link zu bestätigen und dein Passwort einzurichten.':authNotice||(user&&needsPasswordSetup?'Deine E-Mail ist bestätigt. Lege jetzt dein persönliches Passwort fest.':!supa?'Die Anmeldung ist gerade nicht verfügbar. Bitte lade die Seite erneut.':!authReady?'Deine Anmeldung wird geprüft…':'Melde dich an, um deinen persönlichen Kalender und dein Stundenkonto zu öffnen.');
}
function pendingSetup(userId){try{return sessionStorage.getItem(`schichtplan.setup.${userId}`)==='pending'}catch{return false}}
function markSetup(userId,pending){try{if(pending)sessionStorage.setItem(`schichtplan.setup.${userId}`,'pending');else sessionStorage.removeItem(`schichtplan.setup.${userId}`)}catch{}}
function cleanAuthUrl(){
 const url=new URL(window.location.href);
 for(const name of ['token_hash','type','code','error','error_code','error_description'])url.searchParams.delete(name);
 if(authLink.hasTokens||authLink.error||authLink.type)url.hash='';
 window.history.replaceState({},document.title,url.pathname+url.search+url.hash);
}
function failAuth(message){authGeneration++;user=null;entries=[];editingId=null;needsPasswordSetup=false;authReady=true;authNotice=message;render();showMode();}
async function resolveAuthSession(session){
 const generation=++authGeneration;authReady=false;showMode();
 if(!session?.access_token){user=null;entries=[];editingId=null;needsPasswordSetup=false;authReady=true;render();showMode();return;}
 const {data,error}=await supa.auth.getUser(session.access_token);
 if(generation!==authGeneration)return;
 if(error||!data?.user){failAuth('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');return;}
 const nextUser=data.user;
 if(user?.id!==nextUser.id){entries=[];selectedDate=null;resetEntryForm();}
 user=nextUser;needsPasswordSetup=!!initialSetup||pendingSetup(user.id);initialSetup='';
 if(needsPasswordSetup)markSetup(user.id,true);
 authReady=true;authNotice='';
 if(needsPasswordSetup){entries=[];render();showMode();}else await loadEntries();
}
async function initializeAuth(confirmLink=false){
 if(awaitingLinkConfirmation&&!confirmLink){authReady=true;showMode();return;}
 awaitingLinkConfirmation=false;
 if(!supa){authBooting=false;failAuth('Die Anmeldung ist gerade nicht verfügbar. Bitte lade die Seite erneut.');return;}
 try{
  if(authLink.error)throw new Error('invalid_auth_link');
  if(authLink.tokenHash){
   if(!['invite','recovery','signup','email','magiclink'].includes(authLink.type))throw new Error('invalid_auth_link');
   const {error}=await supa.auth.verifyOtp({token_hash:authLink.tokenHash,type:authLink.type});if(error)throw error;
  }
  const {data,error}=await supa.auth.getSession();if(error)throw error;
  if(initialSetup&&!data.session)throw new Error('invalid_auth_link');
  authBooting=false;await resolveAuthSession(data.session);
 }catch{authBooting=false;failAuth('Der Einladungs- oder Bestätigungslink ist ungültig oder abgelaufen. Öffne den neuesten Link aus deiner E-Mail. Wenn du bereits ein Passwort hast, kannst du dich direkt anmelden.');}
 finally{if(authLink.hasTokens||authLink.tokenHash||authLink.error)cleanAuthUrl();}
}
function dateSpan(e){return e.start_date===e.end_date?e.start_date:`${e.start_date} – ${e.end_date}`}
function mins(e){if(PAID_DAY_KINDS.includes(e.kind))return paidDayMinutes(e,e.start_date,e.end_date);const start=e.actual_start||e.start_time,end=e.actual_end||e.end_time;if(!start||!end)return 0;let [h,m]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number),v=eh*60+em-(h*60+m);if(v<=0)v+=1440;return Math.max(0,v-Number(e.break_minutes||0));}
const STANDARD_DAY_MINUTES=7*60+48, DEFAULT_ANNUAL_HOURS=2036, PAID_DAY_KINDS=['dispo','vacation','sick'];
function paidDayMinutes(entry,from,to){
 const start=entry.start_date>from?entry.start_date:from,end=entry.end_date<to?entry.end_date:to;
 if(start>end)return 0;
 const first=Date.parse(`${start}T00:00:00Z`),days=Math.round((Date.parse(`${end}T00:00:00Z`)-first)/86400000)+1;
 if(entry.kind==='dispo')return days*STANDARD_DAY_MINUTES;
 let weekdays=Math.floor(days/7)*5;
 for(let i=0;i<days%7;i++){const weekday=new Date(first+i*86400000).getUTCDay();if(weekday!==0&&weekday!==6)weekdays++;}
 return weekdays*STANDARD_DAY_MINUTES;
}
function creditedMinutes(entry,from,to){
 if(PAID_DAY_KINDS.includes(entry.kind))return paidDayMinutes(entry,from,to);
 return ['shift','office'].includes(entry.kind)&&entry.start_date>=from&&entry.start_date<=to?mins(entry):0;
}
function annualHours(year){
 const value=user?.user_metadata?.annual_targets?.[year];
 return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10000?value:DEFAULT_ANNUAL_HOURS;
}
function renderAnnual(){
 const year=cursor.getFullYear(),target=Math.round(annualHours(year)*60),credited=entries.reduce((sum,e)=>sum+creditedMinutes(e,`${year}-01-01`,`${year}-12-31`),0),balance=credited-target;
 $('#annualTitle').textContent=`Jahresübersicht ${year}`;
 $('#annualTargetDisplay').textContent=fmtM(target);
 $('#annualCredited').textContent=fmtM(credited);
 $('#annualBalance').textContent=`${balance<0?'−':balance>0?'+':''}${fmtM(Math.abs(balance))}`;
 $('#annualBalance').classList.toggle('positive',balance>=0);
 $('#annualTargetYear').textContent=year;
 const input=$('#annualTarget');
 if(document.activeElement!==input){input.value=annualHours(year);input.dataset.year=String(year);}
 $('#annualStorageHint').textContent='Dein Jahresziel wird in deinem Konto gespeichert.';
}
async function saveAnnualTarget(event){
 event.preventDefault();if(!supa||!user||!authReady||needsPasswordSetup){toast('Bitte zuerst anmelden.');return;}const input=$('#annualTarget'),button=$('#saveAnnualTarget'),year=Number(input.dataset.year),raw=input.value.trim(),hours=Number(raw.replace(',','.'));
 if(!raw||!Number.isFinite(hours)||hours<0||hours>10000||!Number.isInteger(year)){toast('Bitte ein Jahresziel zwischen 0 und 10000 Stunden eingeben.');return;}
 const normalized=Math.round(hours*100)/100;button.disabled=true;
 try{
  const owner=user.id,{data:current,error:readError}=await supa.auth.getUser();if(readError)throw readError;if(user?.id!==owner||current.user?.id!==owner)throw new Error('Bitte melde dich erneut an.');
   const {data,error}=await supa.auth.updateUser({data:{annual_targets:{...(current.user.user_metadata?.annual_targets||{}),[year]:normalized}}});
   if(error)throw error;user=data.user;
  input.blur();renderAnnual();toast(`Jahresziel für ${year} gespeichert.`);
 }catch(error){toast('Jahresziel nicht gespeichert: '+error.message)}finally{button.disabled=false;}
}
function fmtM(v){return `${Math.floor(v/60)} h ${String(v%60).padStart(2,'0')} min`}
function overlapsMonth(e){const monthStart=dateISO(new Date(cursor.getFullYear(),cursor.getMonth(),1)),monthEnd=dateISO(new Date(cursor.getFullYear(),cursor.getMonth()+1,0));return e.start_date<=monthEnd&&e.end_date>=monthStart}
function summary(e){if(e.kind==='shift')return `Schicht ${escapeHtml(e.shift_number||'')}`;if(e.kind==='office')return escapeHtml(e.title?.trim()||'Büro');return TYPES[e.kind]}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){const monthEntries=entries.filter(overlapsMonth).sort((a,b)=>a.start_date.localeCompare(b.start_date)||(a.start_time||'').localeCompare(b.start_time||'')),visibleEntries=(selectedDate?entries.filter(e=>e.start_date<=selectedDate&&e.end_date>=selectedDate):monthEntries).sort((a,b)=>a.start_date.localeCompare(b.start_date)||(a.start_time||'').localeCompare(b.start_time||''));$('#monthTitle').textContent=monthFmt.format(cursor);$('#listMonth').textContent=monthFmt.format(cursor);$('#entryListTitle').textContent=selectedDate?`Einträge am ${longDayFmt.format(new Date(`${selectedDate}T12:00:00`))}`:'Einträge';$('#clearDay').hidden=!selectedDate;$('#emptyMessage').textContent=selectedDate?'Für diesen Tag gibt es noch keine Einträge.':'Erfasse rechts deine erste Schicht oder Abwesenheit.';
 const monthFrom=dateISO(new Date(cursor.getFullYear(),cursor.getMonth(),1)),monthTo=dateISO(new Date(cursor.getFullYear(),cursor.getMonth()+1,0)),monthMinutes=entries.reduce((sum,e)=>sum+creditedMinutes(e,monthFrom,monthTo),0);const shifts=monthEntries.filter(e=>e.kind==='shift');$('#statShifts').textContent=shifts.length;$('#statHours').innerHTML=`${Math.floor(monthMinutes/60)}<small> h ${String(monthMinutes%60).padStart(2,'0')} min</small>`;$('#statAway').textContent=monthEntries.filter(e=>['rest','vacation','sick','dispo'].includes(e.kind)).length;$('#statDeviations').textContent=monthEntries.filter(e=>e.actual_start||e.actual_end).length;
 const cal=$('#calendar');cal.innerHTML='';const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),off=(first.getDay()+6)%7,start=new Date(cursor.getFullYear(),cursor.getMonth(),1-off);
 for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=dateISO(d),cell=document.createElement('button'),dayEntries=entries.filter(e=>e.start_date<=iso&&e.end_date>=iso);cell.type='button';cell.className='day'+(d.getMonth()!==cursor.getMonth()?' dim':'')+(iso===dateISO(today)?' today':'')+(iso===selectedDate?' selected':'');cell.setAttribute('aria-pressed',String(iso===selectedDate));cell.setAttribute('aria-label',`${longDayFmt.format(d)}${dayEntries.length?`, ${dayEntries.length} Einträge`:''}`);cell.innerHTML=`<span>${d.getDate()}</span><div class="marks">${[...new Set(dayEntries.map(e=>e.kind))].map(k=>`<i class="dot ${k}"></i>`).join('')}</div>`;cell.onclick=()=>openDay(iso);cal.append(cell);}
 const list=$('#entryList');list.innerHTML='';$('#emptyState').style.display=visibleEntries.length?'none':'flex';for(const e of visibleEntries){const dt=new Date(`${e.start_date}T12:00:00`),timed=['shift','office'].includes(e.kind),time=timed?`${e.actual_start||e.start_time||'—'}–${e.actual_end||e.end_time||'—'}`:'Ganztägig';const row=document.createElement('div');row.className='entry-row';row.innerHTML=`<div class="entry-date"><b>${String(dt.getDate()).padStart(2,'0')}</b><br>${dayFmt.format(dt).split(' ')[0].toUpperCase()}</div><div class="entry-info"><b>${summary(e)}</b><span>${dateSpan(e)} · ${time}</span></div><span class="entry-kind ${e.kind}">${TYPES[e.kind]}</span><span class="entry-length">${timed||PAID_DAY_KINDS.includes(e.kind)?fmtM(mins(e)):''}</span><button class="edit" type="button" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten">✎</button><button class="delete" type="button" aria-label="Eintrag löschen" title="Eintrag löschen">×</button>`;row.querySelector('.edit').onclick=()=>editEntry(e.id);row.querySelector('.delete').onclick=()=>removeEntry(e.id);list.append(row);}renderDayPanel();renderAnnual();}
function openDay(date){
 resetEntryForm(date);
 selectedDate=date;
 const day=new Date(`${date}T12:00:00`);
 cursor=new Date(day.getFullYear(),day.getMonth(),1);
 dayPanelMode=entries.some(e=>e.start_date<=date&&e.end_date>=date)?'details':'form';
 render();
 if(window.matchMedia('(max-width: 780px)').matches)document.querySelector('.form-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDayPanel(){
 let panel=$('#dayDetails');
 if(!panel){panel=document.createElement('div');panel.id='dayDetails';form.before(panel);}
 const details=!!selectedDate&&dayPanelMode==='details';
 panel.hidden=!details;
 form.hidden=details;
 document.querySelector('.form-panel .plus').hidden=details;
 document.querySelector('.form-panel .eyebrow').textContent=details?'TAGESANSICHT':editingId?'EINTRAG BEARBEITEN':'NEU EINTRAGEN';
 $('#formTitle').textContent=details?longDayFmt.format(new Date(`${selectedDate}T12:00:00`)):editingId?'Eintrag bearbeiten':'Eintrag erfassen';
 if(!details)return;
 const dayEntries=entries.filter(e=>e.start_date<=selectedDate&&e.end_date>=selectedDate).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
 panel.replaceChildren();
 for(const e of dayEntries){
  const timed=['shift','office'].includes(e.kind),card=document.createElement('section');
  card.className='day-entry-card';
  const fields=[['Datum',dateSpan(e)]];
  if(timed){
   fields.push(['Dienstzeit',`${e.start_time?.slice(0,5)||'—'}–${e.end_time?.slice(0,5)||'—'}`],['Pause',e.break_minutes?`${e.break_minutes} Minuten`:'Keine Pause'],['Dienstlänge',fmtM(mins(e))]);
   if(e.actual_start||e.actual_end)fields.push(['Tatsächliche Zeit',`${(e.actual_start||e.start_time)?.slice(0,5)||'—'}–${(e.actual_end||e.end_time)?.slice(0,5)||'—'}`]);
  }else{fields.push(['Dauer','Ganztägig']);if(PAID_DAY_KINDS.includes(e.kind))fields.push(['Anrechnung',fmtM(mins(e))]);}
  card.innerHTML=`<span class="entry-kind ${escapeHtml(e.kind)}">${escapeHtml(TYPES[e.kind]||'Eintrag')}</span><h3>${summary(e)}</h3><dl>${fields.map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><button class="secondary day-edit" type="button">Bearbeiten</button>`;
  card.querySelector('.day-edit').onclick=()=>editEntry(e.id);
  panel.append(card);
 }
 if(!dayEntries.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='Für diesen Tag gibt es noch keine Einträge.';panel.append(empty);}
 const add=document.createElement('button');add.type='button';add.className='secondary day-add';add.textContent='Weiteren Eintrag hinzufügen';
 add.onclick=()=>{resetEntryForm(selectedDate);renderDayPanel();};panel.append(add);
}
function resetEntryForm(startDate=dateISO(today)){dayPanelMode='form';editingId=null;form.reset();form.elements.date.value=startDate;form.elements.endDate.value=startDate;$('#formTitle').textContent='Eintrag erfassen';$('#saveEntry').innerHTML='Eintrag speichern <span>↗</span>';$('#cancelEdit').hidden=true;form.elements.kind.disabled=false;updateFields();}
function editEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;dayPanelMode='form';editingId=id;form.elements.kind.value=e.kind;form.elements.number.value=e.shift_number||'';form.elements.officeTitle.value=e.title||'';form.elements.date.value=e.start_date;form.elements.endDate.value=e.end_date;form.elements.start.value=e.start_time||'';form.elements.end.value=e.end_time||'';form.elements.breakMinutes.value=String(e.break_minutes||0);form.elements.actualStart.value=e.actual_start||'';form.elements.actualEnd.value=e.actual_end||'';updateFields();$('#formTitle').textContent='Eintrag bearbeiten';$('#saveEntry').innerHTML='Änderungen speichern <span>↗</span>';$('#cancelEdit').hidden=false;form.elements.kind.disabled=true;renderDayPanel();document.querySelector('.form-panel').scrollIntoView({behavior:'smooth',block:'start'});}
function updateFields(){const kind=$('#kind').value;$('#dayCreditHint').hidden=!PAID_DAY_KINDS.includes(kind);$('#dayCreditHint').textContent=`${TYPES[kind]}: ${kind==='dispo'?'Pro eingetragenem Kalendertag':'Montag bis Freitag pro Tag'} werden 7 h 48 min angerechnet.`;const timed=kind==='shift'||kind==='office',multi=['vacation','sick','rest'].includes(kind);$('#numberWrap').hidden=kind!=='shift';$('#officeTitleWrap').hidden=kind!=='office';$('#timedFields').hidden=!timed;$('#breakWrap').hidden=kind==='shift'?false:kind!=='office';$('#deviationWrap').hidden=kind!=='shift';$('#endDateWrap').hidden=!multi;form.elements.number.required=kind==='shift';form.elements.start.required=timed;form.elements.end.required=timed;form.elements.endDate.required=multi;if(multi&&(!form.elements.endDate.value||form.elements.endDate.value<form.elements.date.value))form.elements.endDate.value=form.elements.date.value;}
async function loadEntries(){
 const owner=user?.id;
 if(!supa||!owner||!authReady||needsPasswordSetup){entries=[];render();showMode();return;}
 const {data,error}=await supa.from('entries').select('*').order('start_date');
 if(user?.id!==owner||!authReady||needsPasswordSetup)return;
 if(error){entries=[];toast('Einträge konnten nicht geladen werden: '+error.message)}else entries=data||[];
 render();showMode();
}
function requireAccount(){if(!supa||!user||!authReady||needsPasswordSetup)throw new Error('Bitte zuerst anmelden.');}
async function saveEntry(entry){requireAccount();const {error}=await supa.from('entries').upsert(entry);if(error)throw error;await loadEntries();}
async function removeEntry(id){
 try{requireAccount();const {error}=await supa.from('entries').delete().eq('id',id);if(error)throw error;await loadEntries();toast('Eintrag gelöscht');}catch(error){toast(error.message)}
}
function localIcs(){
 const esc=v=>String(v||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'),fmt=d=>d.replaceAll('-','');
 const ev=[];
 for(const e of entries){
  const lines=['BEGIN:VEVENT',`UID:${e.id}@schichterfassung`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`SUMMARY:${esc(e.kind==='shift'?`Schicht ${e.shift_number}`:e.kind==='office'?(e.title?.trim()||'Büro'):TYPES[e.kind])}`];
  if(['shift','office'].includes(e.kind)){
   const start=e.actual_start||e.start_time,end=e.actual_end||e.end_time;let ed=e.start_date;
   if(end<=start){const d=new Date(`${ed}T12:00:00`);d.setDate(d.getDate()+1);ed=dateISO(d);}
   lines.push(`DTSTART:${fmt(e.start_date)}T${start.replace(':','').slice(0,4)}00`,`DTEND:${fmt(ed)}T${end.replace(':','').slice(0,4)}00`);
   const desc=[`Pause: ${e.break_minutes||0} min`,...(e.actual_start||e.actual_end?['Abweichung vom Dienstauftrag']:[])].join('\n');
   lines.push(`DESCRIPTION:${esc(desc)}`);
  } else {
   const d=new Date(`${e.end_date}T12:00:00`);d.setDate(d.getDate()+1);
   lines.push(`DTSTART;VALUE=DATE:${fmt(e.start_date)}`,`DTEND;VALUE=DATE:${fmt(dateISO(d))}`);
  }
  lines.push('END:VEVENT');ev.push(lines.join('\r\n'));
 }
 return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Schichterfassung//DE\r\nCALSCALE:GREGORIAN\r\n${ev.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
}
function downloadIcs(){const blob=new Blob([localIcs()],{type:'text/calendar;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='schichterfassung.ics';a.click();URL.revokeObjectURL(a.href)}
async function sha256(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function feedToken(rotate=false){if(!user||!supa)return;const key=`schichtplan.feed.${user.id}`;let token=rotate?'':localStorage.getItem(key);if(!token){const b=crypto.getRandomValues(new Uint8Array(32));token=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');const {error}=await supa.from('calendar_feeds').upsert({user_id:user.id,token_hash:await sha256(token)},{onConflict:'user_id'});if(error)throw error;localStorage.setItem(key,token);}const url=`${config.url}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;await navigator.clipboard.writeText(url);toast(rotate?'Neuer Feed-Link kopiert. Der alte Link ist ungültig.':'Privater Feed-Link kopiert.');}
form.elements.date.value=dateISO(today);form.elements.endDate.value=dateISO(today);$('#todayLabel').textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(today);updateFields();
$('#kind').onchange=updateFields;form.elements.date.onchange=()=>{if(!$('#endDateWrap').hidden&&!form.elements.endDate.value)form.elements.endDate.value=form.elements.date.value};$('#prevMonth').onclick=()=>{cursor.setMonth(cursor.getMonth()-1);selectedDate=null;render()};$('#nextMonth').onclick=()=>{cursor.setMonth(cursor.getMonth()+1);selectedDate=null;render()};$('#clearDay').onclick=()=>{selectedDate=null;render()};
form.onsubmit=async ev=>{ev.preventDefault();const wasEditing=!!editingId,d=new FormData(form),kind=editingId?entries.find(x=>x.id===editingId)?.kind:d.get('kind'),timed=['shift','office'].includes(kind),dateRange=['rest','vacation','sick'].includes(kind),endDate=dateRange?(d.get('endDate')||d.get('date')):d.get('date');if(endDate<d.get('date')){toast('Das Enddatum muss nach dem Beginn liegen.');return}const e={id:editingId||crypto.randomUUID(),kind,title:kind==='office'?d.get('officeTitle').trim():'',shift_number:d.get('number').trim(),start_date:d.get('date'),end_date:endDate,start_time:timed?d.get('start'):null,end_time:timed?d.get('end'):null,break_minutes:timed?Number(d.get('breakMinutes')):0,actual_start:kind==='shift'?(d.get('actualStart')||null):null,actual_end:kind==='shift'?(d.get('actualEnd')||null):null};try{await saveEntry(e);cursor=new Date(`${e.start_date}T12:00:00`);cursor.setDate(1);resetEntryForm(e.start_date);selectedDate=e.start_date;dayPanelMode='details';render();toast(wasEditing?'Änderungen gespeichert.':'Eintrag gespeichert.')}catch(err){toast('Speichern fehlgeschlagen: '+err.message)}};
$('#annualTargetForm').onsubmit=saveAnnualTarget;
$('#cancelEdit').onclick=()=>{if(selectedDate)openDay(selectedDate);else{resetEntryForm();renderDayPanel();}};
$('#downloadIcs').onclick=downloadIcs;$('#copyFeed').onclick=()=>feedToken(false).catch(e=>toast(e.message));$('#rotateFeed').onclick=()=>feedToken(true).catch(e=>toast(e.message));
const dialog=$('#authDialog');
function setAuthMode(mode){
 authMode=mode;const signup=mode==='signup',reset=mode==='reset';
 $('#authTitle').textContent=reset?'Passwort zurücksetzen':signup?'Konto erstellen':'Anmelden';
 $('#authSubmit').textContent=reset?'Link anfordern':signup?'Konto erstellen':'Anmelden';
 $('#toggleAuth').textContent=signup?'Schon ein Konto? Anmelden':'Konto erstellen';
 $('#toggleAuth').hidden=reset;$('#forgotPassword').textContent=reset?'Zurück zur Anmeldung':'Passwort vergessen?';
 $('#authPasswordWrap').hidden=reset;$('#authForm').elements.password.required=!reset;
 $('#authForm').elements.password.autocomplete=signup?'new-password':'current-password';
 $('#authHint').textContent=reset?'Du erhältst einen Link, über den du ein neues Passwort festlegen kannst.':signup?'Erstelle ein Konto und bestätige anschließend deine E-Mail. Bereits eingeladen? Öffne stattdessen den Link aus der Einladung.':'Melde dich mit deinem persönlichen Konto an. Eingeladen? Öffne zuerst den Einladungslink, um dein Passwort festzulegen.';
 $('#authError').hidden=true;
}
function openLogin(){if(!supa)return;setAuthMode('login');$('#authForm').reset();dialog.showModal();}
$('#gateLogin').onclick=()=>awaitingLinkConfirmation?initializeAuth(true):openLogin();
$('#authButton').onclick=async()=>{
 if(user){
  const oldUser=user.id;authGeneration++;initialSetup='';user=null;entries=[];editingId=null;needsPasswordSetup=false;authNotice='';authReady=true;markSetup(oldUser,false);resetEntryForm();render();showMode();
  const {error}=await supa.auth.signOut();if(error){authNotice='Abmeldung nicht abgeschlossen. Bitte versuche es erneut.';showMode();}return;
 }
 openLogin();
};
$('#closeAuth').onclick=()=>dialog.close();
$('#toggleAuth').onclick=()=>setAuthMode(authMode==='login'?'signup':'login');
$('#forgotPassword').onclick=()=>setAuthMode(authMode==='reset'?'login':'reset');
$('#authForm').onsubmit=async event=>{
 event.preventDefault();const fields=new FormData(event.currentTarget),email=String(fields.get('email')||'').trim(),password=String(fields.get('password')||''),mode=authMode,button=$('#authSubmit');button.disabled=true;$('#authError').hidden=true;
 try{
  if(mode==='reset'){
   const {error}=await supa.auth.resetPasswordForEmail(email,{redirectTo:AUTH_REDIRECT_URL});if(error)throw error;
   $('#authError').textContent='Wenn für diese E-Mail ein Konto besteht, erhältst du einen Link zum Festlegen eines neuen Passworts.';$('#authError').hidden=false;return;
  }
  const result=mode==='login'?await supa.auth.signInWithPassword({email,password}):await supa.auth.signUp({email,password,options:{emailRedirectTo:AUTH_REDIRECT_URL}});
  if(result.error)throw result.error;
  if(!result.data.session){$('#authError').textContent='Prüfe dein E-Mail-Postfach und öffne den Bestätigungslink. Falls du bereits eingeladen wurdest, verwende den Einladungslink und lege dort dein Passwort fest – registriere dich nicht erneut.';$('#authError').hidden=false;return;}
  await resolveAuthSession(result.data.session);if(user)dialog.close();
 }catch(error){$('#authError').textContent=error?.code==='email_not_confirmed'?'Bitte öffne zuerst den Bestätigungs- oder Einladungslink aus deiner E-Mail. Eine Einladung wird über ihren Link abgeschlossen, nicht über „Konto erstellen“.':authErrorText(error);$('#authError').hidden=false;}
 finally{button.disabled=false;}
};
$('#passwordSetupForm').onsubmit=async event=>{
 event.preventDefault();const setupForm=event.currentTarget,fields=new FormData(setupForm),password=String(fields.get('password')||''),confirmation=String(fields.get('confirmation')||''),button=$('#savePassword');$('#setupError').hidden=true;
 if(password.length<8||password!==confirmation){$('#setupError').textContent=password.length<8?'Bitte mindestens 8 Zeichen verwenden.':'Die beiden Passwörter stimmen nicht überein.';$('#setupError').hidden=false;return;}
 if(!supa||!user||!needsPasswordSetup){failAuth('Bitte öffne deinen Einladungslink erneut.');return;}
 button.disabled=true;
 try{
  const {data,error}=await supa.auth.updateUser({password});if(error)throw error;
  if(!data.user||data.user.id!==user?.id)throw new Error('Bitte melde dich erneut an.');
  markSetup(data.user.id,false);initialSetup='';needsPasswordSetup=false;user=data.user;authReady=true;authNotice='';setupForm.reset();await loadEntries();toast('Dein Passwort ist gespeichert. Willkommen!');
 }catch(error){$('#setupError').textContent=authErrorText(error);$('#setupError').hidden=false;}finally{button.disabled=false;}
};
showMode();
if(supa)supa.auth.onAuthStateChange((event,session)=>{
 if(event==='PASSWORD_RECOVERY')initialSetup='recovery';
 if(authBooting)return;
 if(event==='SIGNED_OUT'){authGeneration++;initialSetup='';user=null;entries=[];editingId=null;needsPasswordSetup=false;authReady=true;render();showMode();return;}
 const eventGeneration=authGeneration;setTimeout(()=>{if(eventGeneration!==authGeneration)return;resolveAuthSession(session).catch(()=>failAuth('Die Anmeldung konnte nicht geprüft werden. Bitte melde dich erneut an.'));},0);
});
initializeAuth();
