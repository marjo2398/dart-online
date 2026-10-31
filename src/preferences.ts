import { useEffect, useState } from 'react';
export const APP_VERSION = '1.3.0';
export interface Preferences { voice: boolean; voiceName: string; input: 'score'|'remaining'|'darts'; recording:'quick'|'extended'|'detailed'; autoRefresh:boolean; days:number; rememberFilters:boolean; definitions:boolean }
const key='dart-lens.browser-preferences.v1';
const defaults:Preferences={voice:false,voiceName:'',input:'score',recording:'quick',autoRefresh:true,days:0,rememberFilters:true,definitions:false};
export function readPreferences():Preferences {
  try { const p=JSON.parse(localStorage.getItem(key)??'{}');return {...defaults,
    voice:p.voice===true,voiceName:typeof p.voiceName==='string'?p.voiceName.slice(0,200):'',
    input:['score','remaining','darts'].includes(p.input)?p.input:'score',recording:['quick','extended','detailed'].includes(p.recording)?p.recording:'quick',
    autoRefresh:p.autoRefresh!==false,days:[0,7,30,90,365].includes(p.days)?p.days:0,rememberFilters:p.rememberFilters!==false,definitions:p.definitions===true};
  } catch{return {...defaults};}
}
export function savePreferences(value:Preferences){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event('dart-preferences'));}
export function usePreferences(){const [value,setValue]=useState(readPreferences);useEffect(()=>{const update=()=>setValue(readPreferences());window.addEventListener('dart-preferences',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('dart-preferences',update);window.removeEventListener('storage',update);};},[]);return value;}
export function periodStart(days:number){if(!days)return '';const d=new Date();d.setDate(d.getDate()-days+1);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
export function readFilters(key:string):Record<string,string>{try{return readPreferences().rememberFilters?JSON.parse(localStorage.getItem('dart-lens.filters.'+key)??'{}'):{};}catch{return {};}}
export function saveFilters(key:string,value:Record<string,string>){if(readPreferences().rememberFilters)localStorage.setItem('dart-lens.filters.'+key,JSON.stringify(value));}
