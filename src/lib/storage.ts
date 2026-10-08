import type { TarotCard } from '../data/tarot';
export type Message = {id:string; role:'user'|'assistant';text:string;cards?:TarotCard[];mode?:'demo'|'ai'|'local';createdAt?:string};
export type Session = {id:string;title:string;focus:string;date:string;messages:Message[];saved:boolean;note:string;daily?:boolean;drawCount?:number;revisedFrom?:string};
export type Profile = {name:string;onboarded:boolean;avatar?:string};
export type PersonalData = {profile:Profile;sessions:Session[];practiceDays:string[];dayNotes:Record<string,string>};
export function readStorage<T>(key:string,fallback:T,validate:(value:unknown)=>boolean):T {
  try {const value:unknown=JSON.parse(localStorage.getItem(key)||'null');return validate(value)?value as T:fallback;}catch{return fallback;}
}
export function saveStorage(key:string,value:unknown):boolean {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export const validAvatar=(v:unknown):v is string=>typeof v==='string'&&v.length<=200_000&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v);
export const validTimestamp=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&normalizeDay(value.slice(0,10))===value.slice(0,10)&&Number.isFinite(Date.parse(value));
export const validProfile=(v:unknown):v is Profile=>!!v&&typeof v==='object'&&typeof (v as Profile).name==='string'&&(v as Profile).name.length<=32&&typeof (v as Profile).onboarded==='boolean'&&((v as Profile).avatar===undefined||validAvatar((v as Profile).avatar));
export function validSessions(value:unknown):value is Session[] {
  if(!Array.isArray(value))return false;
  const ids=new Set<string>();
  return value.every((s:Session)=>{
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.title!=='string'||typeof s.focus!=='string'||typeof s.date!=='string'||!Number.isFinite(Date.parse(s.date))||typeof s.saved!=='boolean'||typeof s.note!=='string'||!Array.isArray(s.messages)||(s.drawCount!==undefined&&![0,1,3,5,10].includes(s.drawCount)))return false;
    if(s.revisedFrom!==undefined&&(typeof s.revisedFrom!=='string'||s.revisedFrom.length>80))return false;
    ids.add(s.id);const messages=new Set<string>();
    return s.messages.every(m=>{
      if(!m||typeof m.id!=='string'||!m.id||messages.has(m.id)||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||(m.mode!==undefined&&!['demo','ai','local'].includes(m.mode))||(m.createdAt!==undefined&&!validTimestamp(m.createdAt)))return false;
      messages.add(m.id);
      return m.cards===undefined||(Array.isArray(m.cards)&&m.cards.length<=10&&m.cards.every(c=>c&&Number.isInteger(c.id)&&c.id>=0&&c.id<=77&&typeof c.name==='string'&&typeof c.roman==='string'&&typeof c.image==='string'&&/^\/cards\/[a-z0-9-]+\.jpg$/.test(c.image)&&Array.isArray(c.keywords)&&c.keywords.every(k=>typeof k==='string')&&typeof c.meaning==='string'&&typeof c.reflection==='string'));
    });
  });
}
export function localDay(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}

/** Kept for older callers. Every conversation now remains in durable storage. */
export function trimSessions(sessions:Session[]):Session[]{return sessions;}

export function normalizeDay(value:string):string|null {
  const match=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const parsed=new Date(year,month-1,day);
  return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&parsed.getDate()===day?`${match[1]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
export const validPracticeDays=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(day=>typeof day==='string'&&normalizeDay(day)!==null);
export const validDayNotes=(value:unknown):value is Record<string,string>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([day,note])=>normalizeDay(day)===day&&typeof note==='string'&&note.length<=20_000);
export const validPersonalData=(value:unknown):value is PersonalData=>!!value&&typeof value==='object'&&validProfile((value as PersonalData).profile)&&validSessions((value as PersonalData).sessions)&&validPracticeDays((value as PersonalData).practiceDays)&&validDayNotes((value as PersonalData).dayNotes);
