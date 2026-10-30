const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const session=id=>({access_token:'fake-'+id,user:{id,email_confirmed_at:'2026-10-27',user_metadata:{}}});
function setup({active=null,href='https://analogguy-sudo.github.io/Schichterfassung/',badUser=false,sessionValues=new Map(),queryError=false}={}){
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
 const client={auth,from:()=>({select:()=>({order:async()=>{calls.queries++;return {data:rows[current?.user.id]||[],error:queryError?new Error('offline'):null}}}),upsert:async()=>({error:null}),delete:()=>({eq:async()=>({error:null})})})};
 const storage=new Map([['schichtplan.entries.v2','[{"id":"local-secret","kind":"office","title":"PRIVATE LOCAL DATA","start_date":"2026-10-27","end_date":"2026-10-27","start_time":"08:00","end_time":"09:00"}]']]);
 const ctx=vm.createContext({console,Date,Intl,JSON,String,Number,Set,Math,URL,URLSearchParams,window:{location:{href},history:{replaceState(...args){events.push(args)}},SCHICHTPLAN_CONFIG:{url:'https://test.supabase.co',publishableKey:'publishable-test'},SchichtHolidays:require('../holidays.js'),supabase:{createClient:()=>client},matchMedia:()=>({matches:false})},document:{title:'Test',querySelector:node,createElement:()=>new Element()},sessionStorage:{getItem:k=>sessionValues.get(k)||null,setItem:(k,v)=>sessionValues.set(k,v),removeItem:k=>sessionValues.delete(k)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:f=>timers.push(f),FormData:class{constructor(f){this.f=f}get(k){return this.f.elements[k]?.value||null}}});
 const run=s=>vm.runInContext(s,ctx);run(source);
 async function settle(){for(let i=0;i<25;i++)await Promise.resolve();}
 return {node,run,calls,auth,sessionValues,settle,events,async emit(event,s){current=s;listener(event,s);while(timers.length){const f=timers.shift();f();await settle();}},setCurrent(s){current=s}};
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
 console.log('OK: geschützte Startseite, verifizierte Sitzung, keine lokalen Fremddaten, Abmeldung, Einladung, Passwortvergleich, Reload, abgelaufener Link, Wiederherstellung und Kontowechsel.');
})().catch(e=>{console.error(e);process.exitCode=1});
