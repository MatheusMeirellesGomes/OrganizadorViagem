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
