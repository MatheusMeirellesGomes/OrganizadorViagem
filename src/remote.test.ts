import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newTrip } from "./model";
import { ConflictError } from "./errors";
import {
  clearAccountCaches,
  persistWithVersion,
  readAccountCache,
  supabaseRepository,
  writeAccountCache,
} from "./remote";
import { memoryBackend, memoryStorage } from "./test/memory";

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

/** Records the query chain and resolves with a fixed result. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "order", "single"])
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  builder.then = (resolve: (v: unknown) => void) => resolve(result);
  const upload = vi.fn(async () => result);
  const client = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
    storage: { from: () => ({ upload }) },
  } as unknown as SupabaseClient;
  return { client, calls, upload };
}

describe("Supabase repository", () => {
  it("only updates when the stored version still matches", async () => {
    const trip = newTrip();
    const { client, calls } = fakeClient({
      data: [{ id: trip.id, data: trip, updated_at: "v2" }],
      error: null,
    });
    const row = await supabaseRepository(client).update(trip, "v1");
    expect(row.updated_at).toBe("v2");
    expect(calls).toContainEqual(["eq", ["id", trip.id]]);
    expect(calls).toContainEqual(["eq", ["updated_at", "v1"]]);
  });
  it("reports a conflict instead of overwriting another device's change", async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(
      supabaseRepository(client).update(newTrip(), "old"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("sends the owner id with new trips and never the whole table", async () => {
    const trip = newTrip();
    const { client, calls } = fakeClient({
      data: { id: trip.id, data: trip, updated_at: "v1" },
      error: null,
    });
    await supabaseRepository(client).insert(trip, "user-a");
    expect(calls).toContainEqual([
      "insert",
      [{ id: trip.id, user_id: "user-a", data: trip }],
    ]);
  });
  it("propagates database errors", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "42501", message: "row-level security" },
    });
    await expect(supabaseRepository(client).list()).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("treats an already uploaded photo as success when retrying", async () => {
    const { client } = fakeClient({
      data: null,
      error: { statusCode: "409", message: "The resource already exists" },
    });
    await expect(
      supabaseRepository(client).uploadPhoto("u/t/p", new Blob(["x"]), "image/png"),
    ).resolves.toBeUndefined();
  });
});

describe("saving across devices", () => {
  it("inserts new trips and then updates them with the returned version", async () => {
    const backend = memoryBackend();
    const repo = backend.as("user-a");
    const versions: Record<string, string> = {};
    const trip = newTrip({ title: "Ouro Preto" });
    const first = await persistWithVersion(repo, trip, "user-a", versions);
    versions[trip.id] = first.updated_at;
    const second = await persistWithVersion(
      repo,
      { ...trip, notes: "Levar casaco" },
      "user-a",
      versions,
    );
    expect(second.data.notes).toBe("Levar casaco");
    expect(backend.rows.size).toBe(1);
  });
  it("lets a second device read the trip and blocks stale overwrites", async () => {
    const backend = memoryBackend();
    const phone = backend.as("user-a"),
      laptop = backend.as("user-a");
    const trip = newTrip({ title: "Paraty" });
    const created = await phone.insert(trip, "user-a");
    const [seen] = await laptop.list();
    expect(seen.data.title).toBe("Paraty");
    await laptop.update({ ...seen.data, notes: "Do notebook" }, seen.updated_at);
    await expect(
      phone.update({ ...trip, notes: "Do celular" }, created.updated_at),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(backend.rows.get(trip.id)!.data.notes).toBe("Do notebook");
  });
});

describe("offline copy of the account", () => {
  it("stores, reads and clears the copy per user", () => {
    const trip = newTrip();
    writeAccountCache("user-a", [{ id: trip.id, data: trip, updated_at: "v1" }]);
    expect(readAccountCache("user-a")?.rows).toHaveLength(1);
    expect(readAccountCache("user-b")).toBeUndefined();
    localStorage.setItem("atlas-trips-v1", "[]");
    clearAccountCaches();
    expect(readAccountCache("user-a")).toBeUndefined();
    expect(localStorage.getItem("atlas-trips-v1")).toBe("[]");
  });
  it("survives a full storage quota", () => {
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    });
    expect(() => writeAccountCache("user-a", [])).not.toThrow();
  });
});
