import { ConflictError } from "../errors";
import type { Trip } from "../model";
import type { RemoteRow, TripRepository } from "../remote";

/** In-memory localStorage replacement for tests. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

type StoredRow = RemoteRow & { user_id: string };

/**
 * Fake Supabase backend that applies the same rules as the SQL migration:
 * every user only sees and edits rows with their own user_id (RLS), ids are
 * unique across all users, and updated_at changes on every update.
 */
export function memoryBackend() {
  const rows = new Map<string, StoredRow>();
  const photos = new Set<string>();
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString();
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const failures = { insert: new Set<string>(), offline: false };
  function as(userId: string): TripRepository {
    const guard = () => {
      if (failures.offline) throw new TypeError("Failed to fetch");
    };
    return {
      async list() {
        guard();
        return [...rows.values()]
          .filter((r) => r.user_id === userId)
          .map(({ id, data, updated_at }) => copy({ id, data, updated_at }));
      },
      async insert(trip: Trip, owner: string) {
        guard();
        if (owner !== userId)
          throw { code: "42501", message: "new row violates row-level security policy" };
        if (failures.insert.has(trip.id))
          throw { code: "500", message: "internal error" };
        if (rows.has(trip.id)) throw { code: "23505", message: "duplicate key value" };
        const row = { id: trip.id, data: copy(trip), updated_at: stamp(), user_id: userId };
        rows.set(trip.id, row);
        return copy({ id: row.id, data: row.data, updated_at: row.updated_at });
      },
      async update(trip: Trip, expected: string) {
        guard();
        const row = rows.get(trip.id);
        if (!row || row.user_id !== userId || row.updated_at !== expected)
          throw new ConflictError();
        row.data = copy(trip);
        row.updated_at = stamp();
        return copy({ id: row.id, data: row.data, updated_at: row.updated_at });
      },
      async remove(id: string) {
        guard();
        const row = rows.get(id);
        if (row && row.user_id === userId) rows.delete(id);
      },
      async uploadPhoto(path: string) {
        guard();
        if (path.split("/")[0] !== userId)
          throw { statusCode: "403", message: "new row violates row-level security policy" };
        photos.add(path);
      },
    };
  }
  return { as, rows, photos, failures };
}
