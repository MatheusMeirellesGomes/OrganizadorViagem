import { createClient } from "@supabase/supabase-js";
import type { Trip } from "./model";
import { readSupabaseConfig } from "./config";
const env =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ??
  {};
export const supabaseConfig = readSupabaseConfig(env);
if (supabaseConfig.status === "invalid")
  console.warn("Supabase desativado:", supabaseConfig.reason);
export const supabase =
  supabaseConfig.status === "ok"
    ? createClient(supabaseConfig.url, supabaseConfig.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
export const localKey = "atlas-trips-v1";
export function readLocal(): Trip[] {
  try {
    const data = JSON.parse(localStorage.getItem(localKey) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
export function saveLocal(trips: Trip[]) {
  localStorage.setItem(localKey, JSON.stringify(trips));
}
export async function fetchTrips() {
  const { data, error } = await supabase!
    .from("trips")
    .select("data")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.data as Trip);
}
export async function persistTrip(trip: Trip, userId: string) {
  const { error } = await supabase!
    .from("trips")
    .upsert({ id: trip.id, user_id: userId, data: trip });
  if (error) throw error;
}
