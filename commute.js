// Arbeitsweg-Einstellungen: Wegezeit-Termin vor jeder Schicht im Kalender-Abo.
(function(){
'use strict';
const $=s=>document.querySelector(s);
const DEFAULTS={enabled:true,walk_to_stop:10,from_stop_name:'',from_stop_id:null,to_stop_name:'',to_stop_id:null,walk_from_stop:5,buffer_minutes:10,ride_minutes:20};
let client=null,account=null,loadedFor=null,generation=0;
const found={from:new Map(),to:new Map()},ids={from:null,to:null};
const hint=t=>{$('#commuteHint').textContent=t;};
const num=(id,min,max)=>{const v=Number($(id).value);return Number.isInteger(v)&&v>=min&&v<=max?v:null;};

function fill(row){
 const s={...DEFAULTS,...(row||{})};
 $('#commuteEnabled').checked=!!s.enabled;
 $('#commuteWalkTo').value=s.walk_to_stop;$('#commuteWalkFrom').value=s.walk_from_stop;
 $('#commuteBuffer').value=s.buffer_minutes;$('#commuteRide').value=s.ride_minutes;
 $('#commuteFrom').value=s.from_stop_name;$('#commuteTo').value=s.to_stop_name;
 ids.from=s.from_stop_id;ids.to=s.to_stop_id;
 toggle();
}
function toggle(){$('#commuteForm').classList.toggle('off',!$('#commuteEnabled').checked);}

async function load(){
 if(!client||!account)return;const id=account.id,run=++generation;hint('Arbeitsweg wird geladen…');
 const {data,error}=await client.from('commute_settings').select('*').eq('user_id',id).maybeSingle();
 if(run!==generation||account?.id!==id)return;
 if(error){hint('Arbeitsweg konnte nicht geladen werden: '+error.message);return;}
 fill(data);loadedFor=id;
 hint(data?'':'Noch kein Arbeitsweg gespeichert. Trag deine Strecke ein und speichere.');
}

// Haltestellensuche über die Edge Function rmv-stops (der RMV-Schlüssel bleibt auf dem Server).
const timers={};
function search(side){
 clearTimeout(timers[side]);
 const input=$(side==='from'?'#commuteFrom':'#commuteTo'),query=input.value.trim();
 // Gewählter Vorschlag: ID merken. Freier Text: ID verwerfen, der Feed sucht dann selbst nach dem Namen.
 ids[side]=found[side].get(query)||null;
 if(query.length<2||found[side].has(query)||!client)return;
 timers[side]=setTimeout(async()=>{
  const {data,error}=await client.functions.invoke('rmv-stops',{body:{query}});
  if(error||input.value.trim()!==query)return;
  if(data?.error==='no_key'){hint('Haltestellen-Vorschläge kommen, sobald der RMV-Schlüssel hinterlegt ist. Du kannst den Namen trotzdem eintragen.');return;}
  const list=$(side==='from'?'#commuteFromList':'#commuteToList');list.replaceChildren();
  for(const stop of data?.stops||[]){found[side].set(stop.name,stop.id);const o=document.createElement('option');o.value=stop.name;list.append(o);}
 },300);
}

async function save(event){
 event.preventDefault();if(!client||!account)return;
 const walkTo=num('#commuteWalkTo',0,120),walkFrom=num('#commuteWalkFrom',0,120),buffer=num('#commuteBuffer',0,120),ride=num('#commuteRide',1,240);
 const from=$('#commuteFrom').value.trim(),to=$('#commuteTo').value.trim();
 if([walkTo,walkFrom,buffer,ride].includes(null)){hint('Bitte ganze Minuten eintragen (0 bis 120, Fahrzeit bis 240).');return;}
 if(!from||!to){hint('Bitte Start- und Ziel-Haltestelle eintragen.');return;}
 const row={user_id:account.id,enabled:$('#commuteEnabled').checked,walk_to_stop:walkTo,walk_from_stop:walkFrom,buffer_minutes:buffer,ride_minutes:ride,
  from_stop_name:from,from_stop_id:found.from.get(from)||ids.from||null,to_stop_name:to,to_stop_id:found.to.get(to)||ids.to||null,updated_at:new Date().toISOString()};
 $('#commuteSave').disabled=true;hint('Wird gespeichert…');
 const {error}=await client.from('commute_settings').upsert(row,{onConflict:'user_id'});
 $('#commuteSave').disabled=false;
 if(error){hint('Speichern fehlgeschlagen: '+error.message);return;}
 ids.from=row.from_stop_id;ids.to=row.to_stop_id;
 const leave=walkTo+ride+walkFrom+buffer;
 hint(row.enabled?`Gespeichert. Ohne Fahrplan geht es ${leave} Minuten vor Dienstbeginn los. Das Kalender-Abo übernimmt die Änderung beim nächsten Aktualisieren.`:'Gespeichert. Die Wegezeit erscheint nicht mehr im Kalender.');
}

window.schichtCommute={setSession(nextClient,nextUser){
 client=nextClient;const changed=(nextUser?.id||null)!==(account?.id||null);account=nextUser||null;
 if(changed){generation++;loadedFor=null;found.from.clear();found.to.clear();fill(null);hint('');}
 if(account&&loadedFor!==account.id&&$('#calendarDialog')?.open)load();
}};
function init(){
 if(!$('#commuteForm'))return;
 $('#commuteForm').addEventListener('submit',save);
 $('#commuteEnabled').addEventListener('change',toggle);
 $('#commuteFrom').addEventListener('input',()=>search('from'));
 $('#commuteTo').addEventListener('input',()=>search('to'));
 // Beim Öffnen des Kalender-Dialogs laden, auch wenn er aus der letzten Ansicht wiederhergestellt wurde.
 new MutationObserver(()=>{if($('#calendarDialog').open&&account&&loadedFor!==account.id)load();}).observe($('#calendarDialog'),{attributes:true,attributeFilter:['open']});
}
init();
})();
