import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./model";
import { ConflictError } from "./errors";

// One row per trip. `data` keeps the same Trip document used locally, so
// backups, the offline HTML and Travel Mode keep working unchanged.
export type RemoteRow = { id: string; data: Trip; updated_at: string; /** Owner (shared trips belong to someone else). */ user_id?: string };

export interface TripRepository {
  list(): Promise<RemoteRow[]>;
  /** Creates a trip. Fails with code 23505 if the id already exists. */
  insert(trip: Trip, userId: string): Promise<RemoteRow>;
  /**
   * Saves a trip only if nobody changed it since `expectedUpdatedAt`.
   * Throws ConflictError otherwise, so another device's edits are never overwritten.
   */
  update(trip: Trip, expectedUpdatedAt: string): Promise<RemoteRow>;
  remove(id: string, expectedUpdatedAt?: string): Promise<void>;
  /** Uploads a photo; an already existing object at the same path counts as success. */
  uploadDocument?(path: string, file: Blob, contentType: string): Promise<void>;
  uploadPhoto(path: string, file: Blob, contentType: string): Promise<void>;
}

const columns = "id,data,updated_at,user_id";
export const photoBucket = "trip-photos";

function alreadyExists(error: {
  message?: string;
  statusCode?: string | number;
}) {
  const message = (error.message ?? "").toLowerCase();
  return (
    String(error.statusCode) === "409" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  );
}

export function supabaseRepository(client: SupabaseClient): TripRepository {
  return {
    async list() {
      const { data, error } = await client
        .from("trips")
        .select(columns)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
    },
    async insert(trip, userId) {
      const { data, error } = await client
        .from("trips")
        .insert({ id: trip.id, user_id: userId, data: trip })
        .select(columns)
        .single();
      if (error) throw error;
      return data as RemoteRow;
    },
    async update(trip, expectedUpdatedAt) {
      const { data, error } = await client
        .from("trips")
        .update({ data: trip })
        .eq("id", trip.id)
        .eq("updated_at", expectedUpdatedAt)
        .select(columns);
      if (error) throw error;
      if (!data || data.length !== 1) throw new ConflictError();
      return data[0] as RemoteRow;
    },
    async remove(id, expectedUpdatedAt) {
      let query = client.from("trips").delete().eq("id", id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("id");
      if (error) throw error;
      if (expectedUpdatedAt && data?.length !== 1) throw new ConflictError();
    },
    async uploadDocument(path, file, contentType) {
      const { error } = await client.storage
        .from("trip-documents")
        .upload(path, file, { contentType, upsert: false });
      if (error && !alreadyExists(error)) throw error;
    },
    async uploadPhoto(path, file, contentType) {
      const { error } = await client.storage
        .from(photoBucket)
        .upload(path, file, { contentType, upsert: false });
      if (error && !alreadyExists(error)) throw error;
    },
  };
}

/** Saves through the repository: insert for new trips, guarded update otherwise. */
export async function persistWithVersion(
  repo: TripRepository,
  trip: Trip,
  userId: string,
  versions: Record<string, string>,
): Promise<RemoteRow> {
  const known = versions[trip.id];
  return known ? repo.update(trip, known) : repo.insert(trip, userId);
}

// Read-only copy of the account's trips on this device, so trips (and Travel
// Mode) stay viewable without a connection. Cleared when the user signs out.
const cachePrefix = "gomes-conta-cache-v1:";
export type AccountCache = { rows: RemoteRow[]; savedAt: string };

export function readAccountCache(userId: string): AccountCache | undefined {
  try {
    const raw = localStorage.getItem(cachePrefix + userId);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? parsed : undefined;
  } catch {
    return;
  }
}

export function writeAccountCache(userId: string, rows: RemoteRow[]) {
  try {
    localStorage.setItem(
      cachePrefix + userId,
      JSON.stringify({ rows, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Quota exceeded: the account stays the source of truth; nothing is lost.
  }
}

export function clearAccountCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(cachePrefix)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
