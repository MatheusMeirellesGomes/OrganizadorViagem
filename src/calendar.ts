import type {Activity,Trip} from './model';
import {calendarDate} from './travel-mode';
export type Period='morning'|'afternoon'|'evening'|'any';
export const periods:Record<Period,string>={morning:'Manhã',afternoon:'Tarde',evening:'Noite',any:'Sem período'};
export function activityPeriod(a:Activity):Period{if(a.period&&a.period!=='any')return a.period;const match=/^(\d{2}):\d{2}$/.exec(a.time);if(!match)return 'any';const h=Number(match[1]);return h<12?'morning':h<18?'afternoon':'evening';}
export function calendarCells(year:number,month:number,trip:Trip){const first=new Date(Date.UTC(year,month,1));const shift=(first.getUTCDay()+6)%7;const start=calendarDate(trip.start),end=calendarDate(trip.end);return Array.from({length:42},(_,i)=>{const date=new Date(+first+(i-shift)*86400000);const iso=date.toISOString().slice(0,10);const day=start?Math.floor((+date-+start)/86400000)+1:undefined;return {iso,date:date.getUTCDate(),inMonth:date.getUTCMonth()===month,day:day&&day>0&&(!end||date<=end)?day:undefined};});}
export function optionalCount(value:FormDataEntryValue|null):number|undefined{if(value===null||String(value).trim()==='')return;const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=999?n:undefined;}
