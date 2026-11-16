import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';

const KEY = 'rpgHudPrototype';
const clone = x => JSON.parse(JSON.stringify(x));
const fresh = () => ({enabled:true, date:'2026-01-01T12:00', location:'???', destination:'', money:0, xmr:0, cigarettes:0, dice:null, log:[], applied:{}, accent:'#c8a45e'});
let panel, activeKey='';
function context(){return getContext();}
function state(){const c=context();if(!c.chatMetadata)return null;return c.chatMetadata[KEY] ||= fresh();}
function save(){const c=context(); if(c.saveMetadataDebounced)c.saveMetadataDebounced();else if(c.saveMetadata)c.saveMetadata();}
function log(s,msg){s.log.unshift(new Date().toLocaleTimeString()+' '+msg);s.log=s.log.slice(0,50);}
function set(patch){const s=state();if(!s)return;Object.assign(s,patch);save();render();}
function input(label,value,change,type='text'){const wrap=document.createElement('label');wrap.className='rh-field';wrap.textContent=label;const el=document.createElement('input');el.type=type;el.value=value??'';el.addEventListener('change',()=>change(el.value));wrap.append(el);return wrap;}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.addEventListener('click',fn);return b;}
function section(title){const d=document.createElement('details');d.open=true;const t=document.createElement('summary');t.textContent=title;d.append(t);return d;}
function render(){if(!panel)return;const s=state();panel.replaceChildren();if(!s){panel.textContent='Откройте чат';return;}panel.style.setProperty('--rh-accent',s.accent);
const header=document.createElement('div');header.className='rh-header';header.append('✦ RPG HUD ',button('×',()=>panel.classList.add('rh-hidden')));panel.append(header);
const toggle=button(s.enabled?'● Включён':'○ Выключен',()=>set({enabled:!s.enabled}));panel.append(toggle);if(!s.enabled)return;
const time=section('Время');time.append(input('Дата и часы',s.date,v=>set({date:v}),'datetime-local'));panel.append(time);
const loc=section('Локация');loc.append(input('Текущее место',s.location,v=>set({location:v})),input('В пути →',s.destination,v=>set({destination:v})),button('Прибыла',()=>set({location:s.destination||s.location,destination:''})));panel.append(loc);
const dice=section('Кубик d5');const result=document.createElement('p');result.textContent=s.dice===null?'Результат не подготовлен':`Ожидает отправки: ${s.dice}`;dice.append(result,button('Бросить',()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);set({dice:(a[0]%5)+1});}));panel.append(dice);
const inv=section('Инвентарь');for(const [key,label] of [['money','CAD'],['xmr','XMR'],['cigarettes','Сигареты']])inv.append(input(label,s[key],v=>set({[key]:Math.max(0,Number(v)||0)}),'number'));panel.append(inv);
const prefs=section('Настройки');prefs.append(input('Акцент',s.accent,v=>set({accent:v}),'color'));panel.append(prefs);
const history=section('Журнал');const pre=document.createElement('pre');pre.textContent=s.log.join('\n')||'Пока пусто';history.append(pre);panel.append(history);
}
function parseBlock(text){const match=text.match(/<!--\s*RPG_STATE\s*([\s\S]*?)\s*-->/);if(!match)return null;try{const o=JSON.parse(match[1]);if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Объект не найден');return {data:o,raw:match[0]};}catch(e){return {error:String(e),raw:match[0]};}}
function applyMessage(id){const c=context(),s=state();if(!s||!s.enabled)return;const m=c.chat?.[id];if(!m||m.is_user)return;const text=m.mes||'';const parsed=parseBlock(text);if(!parsed)return;const swipe=m.swipe_id??0;const key=`${id}:${swipe}`;if(s.applied[key])return;if(parsed.error){log(s,'Ошибка тега: '+parsed.error);save();render();return;}
const p=parsed.data;const allowed=['elapsed_minutes','location','destination'];if(Object.keys(p).some(k=>!allowed.includes(k))){log(s,'Неизвестные поля тега');save();render();return;}
const delta=Number(p.elapsed_minutes??0);if(!Number.isFinite(delta)||delta<0||delta>525600){log(s,'Некорректное время');save();render();return;}
const before={date:s.date,location:s.location,destination:s.destination};if(delta){const dt=new Date(s.date);if(Number.isNaN(dt.getTime()))return;dt.setMinutes(dt.getMinutes()+delta);s.date=[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-')+'T'+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');}
if(typeof p.location==='string'&&p.location.length<200)s.location=p.location;if(typeof p.destination==='string'&&p.destination.length<200)s.destination=p.destination;
s.applied[key]={before,after:{date:s.date,location:s.location,destination:s.destination}};log(s,`Применён ответ ${key}`);save();render();}
function onSwipe(id){const s=state(),m=context().chat?.[id];if(!s||!m)return;const selected=`${id}:${m.swipe_id??0}`;const entries=Object.entries(s.applied).filter(([k])=>k.startsWith(id+':'));for(const [key,entry] of entries){if(key!==selected){ // restore baseline for the changed answer
Object.assign(s,entry.before);delete s.applied[key];}}
save();render();applyMessage(id);}
function setup(){if(document.getElementById('rh-open'))return;const open=button('✦ RPG',()=>{});open.id='rh-open';open.onclick=()=>{panel.classList.toggle('rh-hidden');render();};document.body.append(open);panel=document.createElement('aside');panel.id='rh-panel';panel.classList.add('rh-hidden');document.body.append(panel);let dragging=false,dx=0,dy=0;panel.addEventListener('pointerdown',e=>{if(!e.target.closest('.rh-header'))return;dragging=true;dx=e.clientX-panel.offsetLeft;dy=e.clientY-panel.offsetTop;panel.setPointerCapture(e.pointerId);});panel.addEventListener('pointermove',e=>{if(!dragging)return;panel.style.left=Math.max(0,e.clientX-dx)+'px';panel.style.top=Math.max(0,e.clientY-dy)+'px';panel.style.right='auto';});panel.addEventListener('pointerup',()=>dragging=false);render();}
jQuery(()=>{setup();if(event_types.CHAT_CHANGED)eventSource.on(event_types.CHAT_CHANGED,render);if(event_types.MESSAGE_RECEIVED)eventSource.on(event_types.MESSAGE_RECEIVED,id=>applyMessage(id));if(event_types.MESSAGE_SWIPED)eventSource.on(event_types.MESSAGE_SWIPED,onSwipe);});
