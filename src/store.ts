import {createClient} from '@supabase/supabase-js';
import type {Trip} from './model';
const env=(import.meta as unknown as {env:Record<string,string>}).env;
export const supabase=env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_ANON_KEY?createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY):null;
export const localKey='atlas-trips-v1';
export function readLocal():Trip[]{try{const data=JSON.parse(localStorage.getItem(localKey)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
export function saveLocal(trips:Trip[]){localStorage.setItem(localKey,JSON.stringify(trips));}
export async function fetchTrips(){const {data,error}=await supabase!.from('trips').select('data').order('created_at',{ascending:false});if(error)throw error;return (data||[]).map(row=>row.data as Trip);}
export async function persistTrip(trip:Trip,userId:string){const {error}=await supabase!.from('trips').upsert({id:trip.id,user_id:userId,data:trip});if(error)throw error;}
