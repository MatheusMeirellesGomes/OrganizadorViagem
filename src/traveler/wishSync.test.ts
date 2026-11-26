import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pullWishes, pushWishes, wishSyncStatus } from "./wishSync";
import { addWish, loadWishes, saveWishes, wishKey } from "./wishlist";

// Ambiente de teste sem navegador: um localStorage simples.
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const place = (id: string, name: string) => ({ id, name, coordinates: { lat: 1, lng: 1 }, category: "", address: "", city: "", country: "", source: "x", retrievedAt: "", tags: {} });

function fake(row: unknown, error: unknown = null) {
  const saved: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }),
      upsert: async (v: unknown) => {
        saved.push(v);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, saved };
}

describe("quero conhecer na conta", () => {
  beforeEach(() => localStorage.removeItem(wishKey));

  it("sem a migração 005, continua só no aparelho", async () => {
    saveWishes(addWish([], place("a", "Torre")).list);
    const { client, saved } = fake(null, { code: "PGRST205", message: "Could not find the table 'public.wishlists'" });
    expect(await pullWishes(client, "u1")).toBe("missing");
    expect(await pushWishes(client, "u1")).toBe(false);
    expect(saved).toHaveLength(0);
    expect(loadWishes()).toHaveLength(1);
    expect(wishSyncStatus()).toBe("missing");
  });

  it("junta a conta com o aparelho sem duplicar e envia o que faltava", async () => {
    saveWishes(addWish([], place("a", "Torre")).list);
    const account = addWish(addWish([], place("a", "Torre")).list, place("b", "Museu")).list;
    const { client, saved } = fake({ data: account.filter((w) => w.place.id === "a") });
    expect(await pullWishes(client, "u1")).toBe("ready");
    expect(loadWishes()).toHaveLength(1);
    const second = fake({ data: account });
    await pullWishes(second.client, "u1");
    expect(loadWishes().map((w) => w.place.id).sort()).toEqual(["a", "b"]);
    expect(saved).toHaveLength(0);
    expect(second.saved).toHaveLength(0);
    const third = fake({ data: [] });
    await pullWishes(third.client, "u1");
    expect(third.saved).toHaveLength(1);
  });
});
