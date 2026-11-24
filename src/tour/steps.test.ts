import { describe, expect, it, beforeEach } from "vitest";
import { loadTourState, placeCard, saveTourStatus, tourKey, tours } from "./steps";
import core from "../locales/core.json";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});

describe("tour", () => {
  beforeEach(() => store.clear());
  it("guarda concluído e pulado por tour", () => {
    expect(loadTourState()).toEqual({});
    saveTourStatus("home", "skipped");
    saveTourStatus("trip", "done");
    expect(loadTourState()).toEqual({ home: "skipped", trip: "done" });
  });
  it("ignora conteúdo estranho guardado", () => {
    store.set(tourKey, "{quebrado");
    expect(loadTourState()).toEqual({});
    store.set(tourKey, JSON.stringify({ home: "talvez" }));
    expect(loadTourState()).toEqual({});
  });
  it("cartão nunca cobre o alvo e fica na tela", () => {
    const view = { width: 375, height: 760, bottomInset: 70 };
    const card = { width: 343, height: 220 };
    for (const top of [10, 200, 400, 600, 700]) {
      const target = { top, bottom: top + 50, left: 20, width: 120 };
      const p = placeCard(target, card, view);
      expect(p.top).toBeGreaterThanOrEqual(16);
      expect(p.top + card.height).toBeLessThanOrEqual(view.height - 16);
      expect(p.left + card.width).toBeLessThanOrEqual(view.width - 16);
      const overlaps = !(p.top + card.height <= target.top || p.top >= target.bottom);
      expect(overlaps).toBe(false);
    }
  });
  it("passos sem alvo ficam no centro", () => {
    expect(placeCard(null, { width: 300, height: 200 }, { width: 1000, height: 800 }).side).toBe("center");
  });
  it("todos os textos têm tradução", () => {
    const dict = core as Record<string, unknown>;
    for (const step of [...tours.home, ...tours.trip]) {
      expect(dict[step.title], step.title).toBeTruthy();
      expect(dict[step.text], step.text).toBeTruthy();
    }
  });
});
