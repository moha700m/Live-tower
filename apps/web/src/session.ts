import { useSyncExternalStore } from 'react';
import { createEngine } from '../../../packages/game-core/index.ts';
import type { GameSnapshot, NormalizedEvent, EngineControl } from '../../../packages/contracts/index.ts';
import type { Socket } from 'socket.io-client';
import { sound } from './audio.ts';

export type SessionSnapshot = GameSnapshot & { provider?:string; providerStatus?:string };
const STORAGE='rise966.demo.v1';
export const uniqueId=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function restore():GameSnapshot|undefined{try{const raw=localStorage.getItem(STORAGE);if(!raw)return;const value:unknown=JSON.parse(raw);if(value&&typeof value==='object'&&'players'in value&&Array.isArray(value.players)&&'serverNow'in value&&typeof value.serverNow==='number')return value as GameSnapshot;}catch{/* A corrupt demo save never prevents a new session. */}}
let engine=createEngine({nowMs:Date.now(),initialState:restore()});
let snapshot:SessionSnapshot=engine.getSnapshot();
let owner=false,remote=false;
let socket:Socket|undefined;
const listeners=new Set<()=>void>();
const bus=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('rise966.local-session'):null;
function publish(next:SessionSnapshot){snapshot=next;listeners.forEach(fn=>fn());}
function save(){if(remote)return;try{localStorage.setItem(STORAGE,JSON.stringify(engine.getSnapshot()));}catch{/* Continue play when browser storage is full. */}}
function sendControl(command:EngineControl){const wire=command.type==='RULES'?{type:'RULES',rules:command.rules??{giftProgress:command.value}}:command;socket?.emit('control:command',wire);}
export function control(command:EngineControl){if(remote){if(socket?.connected)sendControl(command);else bus?.postMessage({kind:'control',command});return;}if(!owner&&bus){bus.postMessage({kind:'control',command});return;}engine.control(command,Date.now());publish(engine.getSnapshot());save();bus?.postMessage({kind:'snapshot',state:snapshot});}
function sendEvent(event:NormalizedEvent){const {type,viewer,payload,eventId}=event;socket?.emit('control:input',{type,viewer,payload,eventId});}
export function dispatch(event:NormalizedEvent){sound(event.type);if(remote){if(socket?.connected)sendEvent(event);else bus?.postMessage({kind:'input',event});return;}if(!owner&&bus){bus.postMessage({kind:'input',event});return;}engine.dispatch(event,Date.now());publish(engine.getSnapshot());save();bus?.postMessage({kind:'snapshot',state:snapshot});}
if(bus)bus.onmessage=({data})=>{if(data.kind==='remote-snapshot'){remote=true;publish(data.state);}else if(data.kind==='snapshot'&&!owner&&!remote)publish(data.state);else if(data.kind==='input'&&(socket?.connected||(owner&&!remote)))dispatch(data.event);else if(data.kind==='control'&&(socket?.connected||(owner&&!remote)))control(data.command);else if(data.kind==='request'&&socket?.connected)bus.postMessage({kind:'remote-snapshot',state:snapshot});else if(data.kind==='request'&&owner&&!remote)bus.postMessage({kind:'snapshot',state:snapshot});};
async function hold(){owner=true;const previous=restore(),now=Date.now();engine=createEngine({nowMs:previous?now:now-45000,initialState:previous});if(!previous){['Sara','نواف','LUNA','راكان','نورة','ZED'].forEach((name,i)=>engine.dispatch({eventId:`seed-${i}`,platform:'mock',timestamp:now-45000,sessionId:'rise966',type:'FOLLOW',viewer:{providerUserId:name,nickname:name},payload:{}},now-45000));engine.advance(now);}let saved=0;setInterval(()=>{if(remote)return;engine.advance(Date.now());publish(engine.getSnapshot());bus?.postMessage({kind:'snapshot',state:snapshot});if(Date.now()-saved>2000){save();saved=Date.now();}},100);await new Promise<void>(()=>{});}
if(navigator.locks)void navigator.locks.request('rise966-engine',hold);else void hold();
bus?.postMessage({kind:'request'});
window.addEventListener('pagehide',save);
export function useGame(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snapshot);}
export async function connectRemote(address:string,token:string,status:(message:string)=>void,role:'control'|'readonly'|'overlay'='control'){
 const url=new URL(address);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid server URL');
 socket?.disconnect();const {io}=await import('socket.io-client');status('جارٍ الاتصال…');
 const next=io(url.origin,{auth:{role,token},reconnectionAttempts:8,timeout:10000});socket=next;
 next.on('connect',()=>{remote=true;status('متصل بالخادم');});
 next.on('snapshot',(state:SessionSnapshot)=>{if(!Array.isArray(state.players)||!Number.isFinite(state.revision))return;remote=true;publish(state);bus?.postMessage({kind:'remote-snapshot',state});});
 next.on('provider',(data:{provider:string;status:string})=>{status(data.provider==='tiktok'?(data.status==='connected'?'TikTok متصل':`TikTok · ${data.status}`):'خادم المحاكاة متصل');});
 next.on('disconnect',()=>{status('انقطع الاتصال — جارٍ المحاولة');if(remote){publish({...snapshot,providerStatus:'disconnected'});bus?.postMessage({kind:'remote-snapshot',state:snapshot});}});
 next.on('connect_error',()=>status('تعذّر الاتصال — تحقق من العنوان ومفتاح التحكّم'));
 return ()=>next.disconnect();
}
export function isRemote(){return remote;}
if(import.meta.env.VITE_GAME_SERVER_URL&&(location.pathname==='/play'||location.pathname.startsWith('/overlay/'))){void connectRemote(import.meta.env.VITE_GAME_SERVER_URL,new URLSearchParams(location.hash.slice(1)).get('token')||'',()=>{},'readonly').catch(()=>publish({...snapshot,providerStatus:'disconnected'}));}
