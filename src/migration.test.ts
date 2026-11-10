import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTrip, type Trip } from "./model";
import {
  dataUrlToBlob,
  pendingLocalTrips,
  planMigration,
  readMigrated,
  removableLocalIds,
  runMigration,
  sameTrip,
} from "./migration";
import { memoryBackend, memoryStorage } from "./test/memory";

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

const photo = "data:image/png;base64," + btoa("png-bytes");

describe("planning the migration", () => {
  it("sends new trips, skips identical ones and flags conflicts", () => {
    const fresh = newTrip({ title: "Nova" }),
      same = newTrip({ title: "Igual" }),
      changed = newTrip({ title: "Local" });
    const remote = [
      // jsonb may return keys in another order: still the same trip.
      { id: same.id, data: JSON.parse(JSON.stringify({ ...same })) as Trip, updated_at: "1" },
      { id: changed.id, data: { ...changed, title: "Na conta" }, updated_at: "1" },
    ];
    const plan = planMigration([fresh, same, changed], remote, {});
    expect(plan.toSend).toEqual([fresh]);
    expect(plan.alreadyInAccount).toEqual([same]);
    expect(plan.conflicts.map((c) => c.local)).toEqual([changed]);
  });
  it("compares trips regardless of key order", () => {
    const a = newTrip({ title: "A" });
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as Trip;
    expect(sameTrip(a, reordered)).toBe(true);
    expect(sameTrip(a, { ...a, notes: "x" })).toBe(false);
  });
  it("does not resend trips already migrated, even if deleted from the account later", () => {
    const trip = newTrip();
    const plan = planMigration([trip], [], { [trip.id]: trip.id });
    expect(plan.toSend).toEqual([]);
    expect(pendingLocalTrips([trip], { [trip.id]: trip.id })).toEqual([]);
  });
});

describe("running the migration", () => {
  it("copies local trips with their photos to the account and confirms them", async () => {
    const backend = memoryBackend();
    const trip = newTrip({ title: "Tiradentes", budgetEnabled: false });
    trip.photos = [{ id: "p1", url: photo, name: "igreja.png" }];
    trip.activities = [
      { id: "a1", title: "Museu", day: 1, time: "", address: "", done: true, kind: "Passeio" },
    ];
    const result = await runMigration(backend.as("user-a"), "user-a", [trip]);
    expect(result.confirmed).toEqual({ [trip.id]: trip.id });
    expect(result.failed).toEqual([]);
    const saved = backend.rows.get(trip.id)!.data;
    expect(saved.photos[0].url).toBe(`user-a/${trip.id}/p1`);
    expect(saved.activities[0].done).toBe(true);
    expect(saved.budgetEnabled).toBe(false);
    expect(backend.photos.has(`user-a/${trip.id}/p1`)).toBe(true);
    expect(readMigrated("user-a")).toEqual({ [trip.id]: trip.id });
  });
  it("can be repeated without creating duplicates", async () => {
    const backend = memoryBackend();
    const repo = backend.as("user-a");
    const trip = newTrip();
    await runMigration(repo, "user-a", [trip]);
    const again = planMigration([trip], await repo.list(), readMigrated("user-a"));
    expect(again.toSend).toEqual([]);
    const forced = await runMigration(repo, "user-a", [trip]);
    expect(forced.conflicts).toEqual([trip]);
    expect(backend.rows.size).toBe(1);
  });
  it("never overwrites an account trip and can send a separate copy instead", async () => {
    const backend = memoryBackend();
    const repo = backend.as("user-a");
    const trip = newTrip({ title: "Bonito" });
    await repo.insert({ ...trip, notes: "Versão da conta" }, "user-a");
    const result = await runMigration(repo, "user-a", [{ ...trip, notes: "Versão local" }]);
    expect(result.conflicts).toHaveLength(1);
    expect(backend.rows.get(trip.id)!.data.notes).toBe("Versão da conta");
    const copy = await runMigration(repo, "user-a", result.conflicts, {
      asCopies: true,
      newId: () => "copy-1",
    });
    expect(copy.confirmed).toEqual({ [trip.id]: "copy-1" });
    expect(backend.rows.get("copy-1")!.data.title).toBe("Bonito (cópia deste aparelho)");
    expect(backend.rows.get(trip.id)!.data.notes).toBe("Versão da conta");
  });
  it("keeps failed trips local and reports them clearly", async () => {
    const backend = memoryBackend();
    const ok = newTrip(),
      bad = newTrip();
    backend.failures.insert.add(bad.id);
    const result = await runMigration(backend.as("user-a"), "user-a", [ok, bad]);
    expect(Object.keys(result.confirmed)).toEqual([ok.id]);
    expect(result.failed[0].trip).toBe(bad);
    expect(result.failed[0].message).toBeTruthy();
    expect(readMigrated("user-a")[bad.id]).toBeUndefined();
  });
  it("fails without marking anything when offline", async () => {
    const backend = memoryBackend();
    backend.failures.offline = true;
    const trip = newTrip();
    await expect(runMigration(backend.as("user-a"), "user-a", [trip])).rejects.toThrow();
    expect(readMigrated("user-a")).toEqual({});
  });
  it("keeps migration records separate per account", async () => {
    const backend = memoryBackend();
    const trip = newTrip();
    await runMigration(backend.as("user-a"), "user-a", [trip]);
    expect(readMigrated("user-b")).toEqual({});
  });
});

describe("removing the local copy", () => {
  it("only allows removing trips confirmed in a fresh read of the account", async () => {
    const backend = memoryBackend();
    const repo = backend.as("user-a");
    const a = newTrip(),
      b = newTrip(),
      c = newTrip();
    await runMigration(repo, "user-a", [a, b]);
    await repo.remove(b.id); // deleted on another device meanwhile
    const ids = removableLocalIds([a, b, c], readMigrated("user-a"), await repo.list());
    expect(ids).toEqual([a.id]);
  });
});

describe("local photos", () => {
  it("decodes data URLs into uploadable files", async () => {
    const blob = dataUrlToBlob(photo);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("png-bytes");
    expect(() => dataUrlToBlob("https://example.com/a.png")).toThrow();
  });
});
