import { uid, type Trip } from "./model";
import type { RemoteRow, TripRepository } from "./remote";
import { friendlyError } from "./errors";

/*
 * Safe migration of trips saved in this browser to the signed-in account.
 *
 * - Nothing in the account is ever updated or overwritten here: only inserts.
 * - A trip whose id already exists in the account is either skipped (same
 *   content, or migrated before) or reported as a conflict for the user to
 *   decide. Conflicts can be sent as new copies, never as replacements.
 * - Local photos (data: URLs) are uploaded to private Storage first.
 * - After sending, the account is read again; only trips confirmed there are
 *   remembered as migrated and may later be removed from this browser, and
 *   only after the user confirms.
 */

export type MigrationPlan = {
  toSend: Trip[];
  alreadyInAccount: Trip[];
  conflicts: { local: Trip; remote: Trip }[];
};

export type MigrationResult = {
  /** Local trip id → id of the confirmed copy in the account. */
  confirmed: Record<string, string>;
  conflicts: Trip[];
  failed: { trip: Trip; message: string }[];
};

const migratedKey = (userId: string) => "gomes-migrado-v1:" + userId;

export function readMigrated(userId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(migratedKey(userId)) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function rememberMigrated(userId: string, confirmed: Record<string, string>) {
  try {
    localStorage.setItem(
      migratedKey(userId),
      JSON.stringify({ ...readMigrated(userId), ...confirmed }),
    );
  } catch {
    // If this fails the next login simply finds the trips already in the account.
  }
}

/** JSON with sorted keys: Postgres jsonb does not keep key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value as object)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            stableStringify((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export const sameTrip = (a: Trip, b: Trip) =>
  stableStringify(a) === stableStringify(b);

/** Local trips not yet confirmed in this account. */
export function pendingLocalTrips(local: Trip[], migrated: Record<string, string>) {
  return local.filter((t) => !migrated[t.id]);
}

export function planMigration(
  local: Trip[],
  remote: RemoteRow[],
  migrated: Record<string, string>,
): MigrationPlan {
  const byId = new Map(remote.map((r) => [r.id, r.data]));
  const plan: MigrationPlan = { toSend: [], alreadyInAccount: [], conflicts: [] };
  for (const trip of local) {
    const existing = byId.get(trip.id);
    if (migrated[trip.id]) plan.alreadyInAccount.push(trip);
    else if (!existing) plan.toSend.push(trip);
    else if (sameTrip(existing, trip)) plan.alreadyInAccount.push(trip);
    else plan.conflicts.push({ local: trip, remote: existing });
  }
  return plan;
}

export function dataUrlToBlob(url: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error("Foto local inválida.");
  const type = match[1] || "application/octet-stream";
  const payload = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) bytes[i] = payload.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Copy of a trip with a new id, used when the user keeps both versions. */
export function asCopy(trip: Trip, newId: string = uid()): Trip {
  return {
    ...trip,
    id: newId,
    title: `${trip.title || "Nova viagem"} (cópia deste aparelho)`,
  };
}

async function uploadLocalPhotos(repo: TripRepository, userId: string, trip: Trip) {
  const photos = [];
  for (const photo of trip.photos ?? []) {
    if (!photo.url.startsWith("data:")) {
      photos.push(photo);
      continue;
    }
    const blob = dataUrlToBlob(photo.url);
    const path = `${userId}/${trip.id}/${photo.id}`;
    await repo.uploadPhoto(path, blob, blob.type);
    photos.push({ ...photo, url: path });
  }
  return { ...trip, photos };
}

export async function runMigration(
  repo: TripRepository,
  userId: string,
  trips: Trip[],
  options: { asCopies?: boolean; newId?: () => string } = {},
): Promise<MigrationResult> {
  const sent: Record<string, string> = {};
  const result: MigrationResult = { confirmed: {}, conflicts: [], failed: [] };
  for (const original of trips) {
    const trip = options.asCopies ? asCopy(original, (options.newId ?? uid)()) : original;
    try {
      const prepared = await uploadLocalPhotos(repo, userId, trip);
      await repo.insert(prepared, userId);
      sent[original.id] = trip.id;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "23505") result.conflicts.push(original);
      else result.failed.push({ trip: original, message: friendlyError(error) });
    }
  }
  // Confirm with a fresh read before treating anything as safely migrated.
  const remoteIds = new Set((await repo.list()).map((r) => r.id));
  for (const [localId, remoteId] of Object.entries(sent)) {
    if (remoteIds.has(remoteId)) result.confirmed[localId] = remoteId;
    else
      result.failed.push({
        trip: trips.find((t) => t.id === localId)!,
        message: "A viagem não apareceu na conta após o envio.",
      });
  }
  rememberMigrated(userId, result.confirmed);
  return result;
}

/**
 * Local trips that may be removed from this browser: only those remembered as
 * migrated AND present in a fresh read of the account.
 */
export function removableLocalIds(
  local: Trip[],
  migrated: Record<string, string>,
  remote: RemoteRow[],
): string[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  return local
    .filter((t) => migrated[t.id] && remoteIds.has(migrated[t.id]))
    .map((t) => t.id);
}
