const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const session=id=>({access_token:'fake-'+id,user:{id,email_confirmed_at:'2026-10-27',user_metadata:{}}});
function setup({active=null,href='https://analogguy-sudo.github.io/Schichterfassung/',badUser=false,sessionValues=new Map(),queryError=false,storage:sharedStorage=null,feed=undefined}={}){
 const nodes=new Map(),events=[],calls={updates:[],queries:0,signups:0},timers=[];let current=active,listener;
 class Element {
  constructor(){this.value='';this.hidden=false;this.children=[];this.style={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};this.parts=new Map();this.attributes={};this.disabled=false;}
  set id(v){this._id=v;nodes.set('#'+v,this)}get id(){return this._id}
  set innerHTML(v){this.html=v;this.children=[];this.parts.clear()}get innerHTML(){return this.html||''}
  querySelector(s){if(!this.parts.has(s))this.parts.set(s,new Element());return this.parts.get(s)}
  append(v){this.children.push(v)}before(){}replaceChildren(){this.children=[]}setAttribute(k,v){this.attributes[k]=v}scrollIntoView(){}contains(){return false}blur(){}showModal(){this.open=true}close(){this.open=false}
 }
 const node=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)};
 function form(selector,names){const f=node(selector);f.elements={};for(const name of names)f.elements[name]=new Element();f.reset=()=>{for(const e of Object.values(f.elements))e.value='';if(f.elements.kind)f.elements.kind.value='shift';if(f.elements.breakMinutes)f.elements.breakMinutes.value='0'};f.reset();return f}
 form('#entryForm',['kind','number','officeTitle','date','endDate','start','end','breakMinutes','actualStart','actualEnd','sickCredit','holidayWork']);nodes.set('#kind',node('#entryForm').elements.kind);
 form('#authForm',['email','password']);form('#passwordSetupForm',['password','confirmation']);
 const rows={one:[{id:'one-entry',kind:'shift',shift_number:'111',start_date:'2026-10-27',end_date:'2026-10-27',start_time:'08:00',end_time:'16:00',break_minutes:30}],two:[]};
 const auth={
  getSession:async()=>({data:{session:current},error:null}),
  getUser:async token=>({data:{user:badUser?null:(token?session(token.slice(5)).user:current?.user)},error:badUser?new Error('invalid'):null}),
  onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){}}}}},
  verifyOtp:async()=>({data:{session:current},error:current?null:new Error('expired')}),
  signInWithPassword:async()=>({data:{session:current},error:null}),
  signUp:async()=>{calls.signups++;return {data:{session:null},error:null}},
  resetPasswordForEmail:async()=>({error:null}),
  updateUser:async attributes=>{calls.updates.push(attributes);return {data:{user:current.user},error:null}},
  signOut:async()=>{current=null;listener?.('SIGNED_OUT',null);return {error:null}}
 };
 const feedRow={value:feed,upserts:0,updates:0};
 const feedTable={select:()=>({eq:()=>({maybeSingle:async()=>({data:feedRow.value?{...feedRow.value}:null,error:null})})}),upsert:async row=>{feedRow.upserts++;feedRow.value={token_hash:row.token_hash,token:row.token};return {error:null}},update:patch=>({eq:async()=>{feedRow.updates++;feedRow.value={...feedRow.value,...patch};return {error:null}}})};
 const client={auth,from:table=>table==='calendar_feeds'?feedTable:({select:()=>({order:async()=>{calls.queries++;return {data:rows[current?.user.id]||[],error:queryError?new Error('offline'):null}}}),upsert:async row=>{const list=rows[current.user.id];const i=list.findIndex(r=>r.id===row.id);if(i>=0)list[i]={...list[i],...row};else list.push(row);return {error:null}},delete:()=>({eq:async()=>({error:null})})})};
 const storage=sharedStorage||new Map([['schichtplan.entries.v2','[{"id":"local-secret","kind":"office","title":"PRIVATE LOCAL DATA","start_date":"2026-10-27","end_date":"2026-10-27","start_time":"08:00","end_time":"09:00"}]']]);
 const shared=[];const ctx=vm.createContext({crypto:globalThis.crypto,TextEncoder,navigator:{share:async v=>{shared.push(v)},clipboard:{writeText:async v=>{shared.push(v)}}},console,Date,Intl,JSON,String,Number,Set,Math,URL,URLSearchParams,window:{location:{href},history:{replaceState(...args){events.push(args)}},SCHICHTPLAN_CONFIG:{url:'https://test.supabase.co',publishableKey:'publishable-test'},SchichtHolidays:require('../holidays.js'),supabase:{createClient:()=>client},matchMedia:()=>({matches:false})},document:{title:'Test',querySelector:node,createElement:()=>new Element()},sessionStorage:{getItem:k=>sessionValues.get(k)||null,setItem:(k,v)=>sessionValues.set(k,v),removeItem:k=>sessionValues.delete(k)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:f=>timers.push(f),FormData:class{constructor(f){this.f=f}get(k){return this.f.elements[k]?.value||null}}});
 const run=s=>vm.runInContext(s,ctx);run(source);
 async function settle(){for(let i=0;i<25;i++)await Promise.resolve();}
 return {node,run,calls,storage,feedRow,shared,auth,sessionValues,settle,events,async emit(event,s){current=s;listener(event,s);while(timers.length){const f=timers.shift();f();await settle();}},setCurrent(s){current=s}};
}
(async()=>{
 assert.match(html,/<main id="appContent" hidden>/);assert.match(html,/id="passwordSetupForm" hidden/);
 let t=setup();await t.settle();assert.equal(t.node('#appContent').hidden,true);assert.equal(t.node('#authGate').hidden,false);assert.equal(t.calls.queries,0);assert.equal(t.run('entries.length'),0);await assert.rejects(t.run("saveEntry({})"),/anmelden/);
 t=setup({active:session('one')});await t.settle();assert.equal(t.node('#appContent').hidden,false);assert.equal(t.run('entries[0].id'),'one-entry');assert.equal(t.run("entries.some(e=>e.id==='local-secret')"),false);
 await t.node('#authButton').onclick();assert.equal(t.node('#appContent').hidden,true);assert.equal(t.run('entries.length'),0);
 t=setup({active:session('one'),badUser:true});await t.settle();assert.equal(t.node('#appContent').hidden,true);assert.equal(t.calls.queries,0);
 t=setup({active:session('one'),queryError:true});await t.settle();assert.equal(t.run('entries.length'),0);
 t=setup({active:session('one'),href:'https://analogguy-sudo.github.io/Schichterfassung/#access_token=fake-one&refresh_token=fake-refresh&type=invite'});await t.settle();assert.equal(t.node('#appContent').hidden,true);assert.equal(t.node('#passwordSetupForm').hidden,false);assert.equal(t.calls.queries,0);assert.equal(t.sessionValues.get('schichtplan.setup.one'),'pending');
 let reload=setup({active:session('one'),sessionValues:t.sessionValues});await reload.settle();assert.equal(reload.node('#passwordSetupForm').hidden,false);
 const f=t.node('#passwordSetupForm');f.elements.password.value='example-password';f.elements.confirmation.value='mismatch';await f.onsubmit({preventDefault(){},currentTarget:f});assert.equal(t.calls.updates.length,0);
 f.elements.confirmation.value='example-password';const event={preventDefault(){},currentTarget:f};const promise=f.onsubmit(event);event.currentTarget=null;await promise;assert.equal(t.calls.updates.length,1);assert.equal(t.node('#appContent').hidden,false);assert.equal(t.sessionValues.has('schichtplan.setup.one'),false);
 t=setup({active:session('one'),href:'https://analogguy-sudo.github.io/Schichterfassung/#error=access_denied&error_code=otp_expired'});await t.settle();assert.equal(t.node('#appContent').hidden,true);assert.match(t.node('#gateMessage').textContent,/abgelaufen/);
 t=setup({active:session('one')});await t.settle();await t.emit('PASSWORD_RECOVERY',session('one'));assert.equal(t.node('#passwordSetupForm').hidden,false);assert.equal(t.node('#appContent').hidden,true);
 t=setup();await t.settle();t.run("setAuthMode('signup')");const a=t.node('#authForm');a.elements.email.value='test@example.invalid';a.elements.password.value='example-password';await a.onsubmit({preventDefault(){},currentTarget:a});assert.match(t.node('#authError').textContent,/Einladungslink/);assert.equal(t.node('#appContent').hidden,true);
 t=setup({active:session('one')});await t.settle();await t.emit('SIGNED_IN',session('two'));assert.equal(t.run('entries.length'),0);assert.equal(t.node('#appContent').hidden,false);
 t=setup({active:session('one'),href:'https://analogguy-sudo.github.io/Schichterfassung/?token_hash=fake-token&type=recovery'});await t.settle();assert.equal(t.calls.queries,0);assert.equal(t.node('#passwordSetupForm').hidden,true);assert.equal(t.node('#gateLogin').textContent,'Passwort festlegen');await t.node('#gateLogin').onclick();await t.settle();assert.equal(t.node('#passwordSetupForm').hidden,false);assert.equal(t.calls.queries,0);
 t=setup({active:session('one')});assert.equal(t.node('#authGate').hidden,true);await t.settle();assert.equal(t.node('#authGate').hidden,true);assert.equal(t.node('#appContent').hidden,false);
 t.run("openDay('2026-10-27')");t.node('#openAnnual').onclick();assert.match(t.storage.get('schichtplan.view.one'),/"day":"2026-10-27".*"dialog":"annualDialog"/);
 const kept=setup({active:session('one'),storage:t.storage});await kept.settle();assert.equal(kept.run('selectedDate'),'2026-10-27');assert.equal(kept.run("dayPanelMode"),'details');assert.equal(kept.node('#annualDialog').open,true);
 await kept.node('#authButton').onclick();assert.equal(kept.storage.has('schichtplan.view.one'),false);
 const fresh=setup({active:session('two'),storage:t.storage});await fresh.settle();assert.equal(fresh.run('selectedDate'),null);assert.ok(!fresh.node('#annualDialog').open);
 const edit=setup({active:session('one')});await edit.settle();edit.run("editEntry('one-entry')");const ef=edit.node('#entryForm');ef.elements.end.value='18:00';await ef.onsubmit({preventDefault(){}});await edit.settle();
 assert.equal(edit.run('fmtM(mins(entries[0]))'),'9 h 30 min');assert.match(edit.node('#toast').textContent,/Änderungen gespeichert\. Oktober 2026: 9 h 30 min \(\+2 h 00 min\)/);
 edit.run("cursor=new Date(2026,9,1);render()");assert.equal(edit.node('#annualNextNote').hidden,false);assert.match(edit.node('#annualNextNote').textContent,/Rechnerisch: −20\d\d h/);
 edit.run("const d=new Date();d.setDate(d.getDate()+1);entries.push({id:'future',kind:'shift',start_date:dateISO(d),end_date:dateISO(d),start_time:'06:00',end_time:'14:00',break_minutes:30});cursor=new Date(d.getFullYear(),d.getMonth(),1);render()");
 if(edit.run('cursor.getFullYear()===new Date().getFullYear()')){assert.equal(edit.node('#annualTodayNote').hidden,false);assert.match(edit.node('#annualTodayNote').textContent,/Geplant ab morgen: 7 h 30 min/);}
 const hashOf=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const wait=async x=>{for(let i=0;i<8;i++)await x.settle();};
 let fx=setup({active:session('one')});await fx.settle();await fx.run('loadFeed()');await wait(fx);
 assert.equal(fx.feedRow.upserts,1);assert.match(fx.run('feedUrl'),/calendar-feed\?token=[0-9a-f]{64}$/);assert.equal(fx.feedRow.value.token,fx.run('feedUrl').split('token=')[1]);
 await fx.run('shareFeed()');assert.match(fx.shared[0].text,/^Abonniere meinen Schichtkalender:\nwebcal:\/\/test\.supabase\.co\/functions\/v1\/calendar-feed\?token=/);assert.match(fx.shared[0].text,/Kalenderabo hinzufügen[\s\S]*\nhttps:\/\/test\.supabase\.co/);
 const stable='a'.repeat(64);fx=setup({active:session('one'),feed:{token:stable,token_hash:await hashOf(stable)}});await fx.settle();await fx.run('loadFeed()');await wait(fx);
 assert.equal(fx.feedRow.upserts,0);assert.ok(fx.run('feedUrl').endsWith(stable));
 const legacy='b'.repeat(64),legacyStore=new Map([['schichtplan.feed.one',legacy]]);fx=setup({active:session('one'),storage:legacyStore,feed:{token:null,token_hash:await hashOf(legacy)}});await fx.settle();await fx.run('loadFeed()');await wait(fx);
 assert.equal(fx.feedRow.upserts,0);assert.equal(fx.feedRow.updates,1);assert.equal(fx.feedRow.value.token,legacy);assert.ok(fx.run('feedUrl').endsWith(legacy));
 fx=setup({active:session('one'),feed:{token:null,token_hash:await hashOf('c'.repeat(64))}});await fx.settle();await fx.run('loadFeed()');await wait(fx);
 assert.equal(fx.feedRow.upserts,0);assert.equal(fx.run('feedUrl'),'');assert.equal(fx.run('feedState'),'elsewhere');assert.equal(fx.node('#shareFeed').disabled,true);
 console.log('OK: geschützte Startseite, verifizierte Sitzung, keine lokalen Fremddaten, Abmeldung, Einladung, Passwortvergleich, Reload, abgelaufener Link, Wiederherstellung, Kontowechsel, kein Anmelde-Aufblitzen, gemerkte Ansicht, Summen nach dem Bearbeiten und stabiler Kalender-Feed.');
})().catch(e=>{console.error(e);process.exitCode=1});
