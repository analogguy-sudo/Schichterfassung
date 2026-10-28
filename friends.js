(function(root){
'use strict';
const DAY=1440;
const dayNumber=s=>Date.parse(s+'T00:00:00Z')/86400000;
const isoDay=n=>new Date(n*86400000).toISOString().slice(0,10);
const timeMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
function projected(rows){return rows.map(e=>({start_date:e.start_date,end_date:e.end_date,start_time:e.actual_start||e.start_time,end_time:e.actual_end||e.end_time,state:e.state||(e.kind==='shift'||e.kind==='office'?'busy':e.kind==='rest'?'free':'unknown')}));}
function comparePlans(plans,{from,days=14,start=600,end=1320,min=120,buffer=120,includeUnplanned=false}){
 if(!plans.length||!Number.isInteger(days)||days<1||days>31||start<0||end>DAY||end<=start||min<30||min>end-start||buffer<0||buffer>720||!Number.isFinite(dayNumber(from)))throw new Error('Bitte einen gültigen Zeitraum und passende Uhrzeiten wählen.');
 const first=dayNumber(from),all=plans.map(p=>projected(p)),result=[];
 for(let d=first;d<first+days;d++){
  const date=isoDay(d),unknownNames=[],blocked=[];
  for(let p=0;p<all.length;p++){
   const rows=all[p],onDay=rows.filter(e=>e.start_date<=date&&e.end_date>=date);
   if(!onDay.length){if(!includeUnplanned){blocked.push([d*DAY,(d+1)*DAY]);}else unknownNames.push(p);}
   for(const e of rows){
    const a=dayNumber(e.start_date),b=dayNumber(e.end_date);
    if(e.state==='unknown'){blocked.push([a*DAY,(b+1)*DAY]);continue;}
    if(e.state!=='busy')continue;
    if(!e.start_time||!e.end_time){blocked.push([a*DAY,(b+1)*DAY]);continue;}
    const t=timeMinutes(e.start_time),u=timeMinutes(e.end_time);
    // Zeitgebundene Einträge gelten für den Starttag, mit Überlauf bei Nachtschichten.
    blocked.push([a*DAY+t-buffer,a*DAY+u+(u<=t?DAY:0)+buffer]);
   }
  }
  const low=d*DAY+start,high=d*DAY+end,intervals=blocked.filter(([a,b])=>a<high&&b>low).sort((a,b)=>a[0]-b[0]);let pos=low;
  for(const [a,b] of intervals){if(a>pos&&Math.min(a,high)-pos>=min)result.push({date,start:pos-d*DAY,end:Math.min(a,high)-d*DAY,unplanned:unknownNames.length>0});pos=Math.max(pos,b);if(pos>=high)break;}
  if(high-pos>=min)result.push({date,start:pos-d*DAY,end,unplanned:unknownNames.length>0});
 }
 return result;
}
root.SchichtTreffen={comparePlans,projected};
if(typeof module!=='undefined')module.exports=root.SchichtTreffen;
if(typeof document==='undefined')return;
const $=s=>document.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client=null,account=null,own=[],generation=0,comparisonVersion=0,shares=[];
const msg=(text,error=false)=>{const el=$('#friendsMessage');el.textContent=text;el.classList.toggle('error',error);};
const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const dateLabel=s=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(s+'T12:00:00'));
function clearResults(){comparisonVersion++;const el=$('#meetingResults');el.replaceChildren();$('#meetingStats').textContent='';}
async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.code==='PGRST202'?'Die Freunde-Funktion ist in der Datenbank noch nicht eingerichtet.':error.message);return data;}
function renderShares(data){
 shares=data.shares||[];const container=$('#friendShares');container.replaceChildren();
 const incoming=shares.filter(s=>!s.outgoing);$('#friendChoices').innerHTML=incoming.length?incoming.map(s=>`<label class="friend-choice"><input type="checkbox" value="${escape(s.id)}"> ${escape(s.name)}</label>`).join(''):'<p class="hint">Noch keine Pläne für dich freigegeben. Nimm zuerst einen Einladungscode an.</p>';
 $('#friendChoices').onchange=clearResults;
 for(const share of shares){const row=document.createElement('div');row.className='friend-share';const text=document.createElement('span');text.textContent=share.outgoing?`Du gibst deinen Plan für ${share.name} frei`:`${share.name} gibt den Plan für dich frei`;const btn=document.createElement('button');btn.className='text-button';btn.type='button';btn.textContent=share.outgoing?'Freigabe beenden':'Verbindung entfernen';btn.onclick=()=>revoke(share.id,btn);row.append(text,btn);container.append(row);}
 for(const invite of data.invites||[]){const row=document.createElement('div');row.className='friend-share';const text=document.createElement('span');text.textContent='Offene Einladung · gültig bis '+new Date(invite.expires_at).toLocaleDateString('de-DE');const btn=document.createElement('button');btn.type='button';btn.className='text-button';btn.textContent='Einladung widerrufen';btn.onclick=()=>revoke(invite.id,btn);row.append(text,btn);container.append(row);}
 if(!container.children.length)container.textContent='Du hast noch keine Freigaben. Dein Plan bleibt privat.';
}
async function refresh(){const id=account?.id,run=generation;try{const data=await rpc('friend_list');if(account?.id!==id||run!==generation)return;renderShares(data);msg('');}catch(e){if(run===generation)msg(e.message,true);}}
async function revoke(id,btn){btn.disabled=true;clearResults();try{await rpc('friend_revoke',{p_id:id});$('#inviteCodeWrap').hidden=true;$('#inviteCode').value='';await refresh();msg('Freigabe oder Einladung beendet.');}catch(e){msg(e.message,true);}finally{btn.disabled=false;}}
root.schichtFriends={setSession(c,u,rows){
 if(own!==rows)clearResults();own=rows||[];const id=u?.id||null;
 if(account?.id===id&&client===c)return;
 generation++;client=c;account=u;shares=[];clearResults();$('#friendShares').replaceChildren();$('#friendChoices').replaceChildren();$('#inviteCode').value='';$('#inviteCodeWrap').hidden=true;$('#friendInviteForm').reset();$('#friendAcceptForm').reset();msg('');
 if(account)refresh();
}};
$('#friendInviteForm').onsubmit=async ev=>{
 ev.preventDefault();if(!account)return;const btn=$('#createFriendInvite'),id=account.id,run=generation;btn.disabled=true;msg('');
 try{const data=await rpc('friend_invite_create',{p_name:$('#friendOwnName').value.trim()});if(account?.id!==id||run!==generation)return;await refresh();$('#inviteCode').value=data.code;$('#inviteCodeWrap').hidden=false;msg('Einladung erstellt. Gib den Code nur deinem Freund. Er ist einmalig und 7 Tage gültig.');}catch(e){msg(e.message,true);}finally{btn.disabled=false;}
};
$('#copyFriendCode').onclick=async()=>{try{await navigator.clipboard.writeText($('#inviteCode').value);msg('Einladungscode kopiert.');}catch{msg('Bitte den angezeigten Code markieren und kopieren.');}};
$('#friendAcceptForm').onsubmit=async ev=>{
 ev.preventDefault();if(!account)return;const btn=$('#acceptFriendInvite'),id=account.id,run=generation;btn.disabled=true;clearResults();
 try{await rpc('friend_invite_accept',{p_code:$('#friendReceivedCode').value.trim().toLowerCase(),p_name:$('#friendViewerName').value.trim()});if(account?.id!==id||run!==generation)return;$('#friendAcceptForm').reset();await refresh();msg('Einladung angenommen. Deinen eigenen Plan gibst du nur über eine eigene Einladung frei.');}catch(e){msg(e.message,true);}finally{btn.disabled=false;}
};
$('#refreshFriends').onclick=()=>{clearResults();refresh();};
$('#meetingFrom').value=new Date().toLocaleDateString('sv-SE');
$('#meetingForm').onchange=clearResults;
$('#meetingForm').onsubmit=async ev=>{
 ev.preventDefault();clearResults();if(!account)return;const selected=[...$('#friendChoices').querySelectorAll('input:checked')].map(el=>shares.find(s=>s.id===el.value&&!s.outgoing)).filter(Boolean);
 if(!selected.length){msg('Wähle mindestens einen Freund für den Vergleich.',true);return;}if(selected.length>8){msg('Bitte höchstens 8 Freunde gleichzeitig vergleichen.',true);return;}
 const version=comparisonVersion,btn=$('#compareFriends'),id=account.id,run=generation,from=$('#meetingFrom').value,days=Number($('#meetingDays').value);btn.disabled=true;msg('Zeitfenster werden verglichen…');
 try{
  const to=isoDay(dayNumber(from)+days-1),plans=[projected(own)],names=['Du',...selected.map(s=>s.name)];
  for(const share of selected)plans.push(await rpc('friend_availability',{p_owner:share.owner_id,p_from:from,p_to:to}));
  if(account?.id!==id||run!==generation||version!==comparisonVersion)return;
  const results=comparePlans(plans,{from,days,start:timeMinutes($('#meetingStart').value),end:timeMinutes($('#meetingEnd').value),min:Number($('#meetingMin').value),buffer:Number($('#meetingBuffer').value),includeUnplanned:$('#includeUnplanned').checked});
  $('#meetingStats').textContent=`${results.length} gemeinsame Zeitfenster · ${new Set(results.map(r=>r.date)).size} Tage · ${(results.reduce((n,r)=>n+r.end-r.start,0)/60).toLocaleString('de-DE',{maximumFractionDigits:1})} Stunden möglich`;
  const out=$('#meetingResults');
  if(!results.length){out.textContent='Keine passenden Zeitfenster gefunden. Prüft den Zeitraum, eure Einträge oder die Pufferzeit.';}
  for(const r of results){const row=document.createElement('div');row.className='meeting-slot';const when=document.createElement('strong');when.textContent=dateLabel(r.date)+' · '+clock(r.start)+'–'+clock(r.end);const detail=document.createElement('span');detail.textContent=names.join(' + ')+' · '+(r.unplanned?'mit ungeplanten Zeiten':'laut eingetragenem Plan möglich');row.append(when,detail);out.append(row);}
  msg('Vergleich aktualisiert. Mögliche Zeitfenster sind keine Zusage. Privattermine und Schlafzeiten bitte selbst abgleichen.');
 }catch(e){clearResults();msg(e.message,true);}finally{btn.disabled=false;}
};
if(typeof supa!=='undefined')root.schichtFriends.setSession(supa,authReady&&!needsPasswordSetup?user:null,entries);
})(typeof window!=='undefined'?window:globalThis);
