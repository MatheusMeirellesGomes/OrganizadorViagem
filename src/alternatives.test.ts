import { describe, expect, it } from "vitest";
import { generateAlternatives, listedPrice, summarize } from "./itinerary";
import { newTrip, type Trip } from "./model";
import { choosePlace, type SavedPlace } from "./choices";

const place = (id: string, lng: number, fee?: string): SavedPlace => ({
  id,
  name: id,
  address: "",
  city: "",
  country: "",
  source: "",
  retrievedAt: "",
  tags: fee ? { fee } : {},
  category: "museum",
  coordinates: { lat: 0, lng: lng / 100 },
});
function tripWith(places: SavedPlace[], extra: Partial<Trip> = {}) {
  let t = newTrip({ coordinates: { lat: 0, lng: 0 }, ...extra });
  for (const p of places) t = choosePlace(t, p, "want");
  return t;
}
const ten = Array.from({ length: 10 }, (_, i) => place("p" + i, i, i < 3 ? "yes" : i < 6 ? "no" : undefined));
const byStrategy = (t: Trip, days: number) =>
  Object.fromEntries(
    generateAlternatives(t, { days, includeMaybe: false }).map((a) => [a.strategy, a]),
  );

describe("comparação de roteiros", () => {
  it("gera as três alternativas com os mesmos lugares escolhidos", () => {
    const alts = generateAlternatives(tripWith(ten), { days: 4, includeMaybe: false });
    expect(alts.map((a) => a.strategy)).toEqual(["fast", "budget", "relaxed"]);
    for (const a of alts) expect(a.summary.places + a.summary.leftOut).toBe(10);
  });
  it("a mais rápida usa menos dias", () => {
    const { fast, relaxed } = byStrategy(tripWith(ten), 4);
    expect(fast.summary.daysUsed).toBe(2);
    expect(fast.summary.maxPerDay).toBe(7);
    expect(relaxed.summary.daysUsed).toBeGreaterThan(fast.summary.daysUsed);
  });
  it("a mais tranquila nunca passa de 3 por dia e espalha pelos dias", () => {
    const { relaxed } = byStrategy(tripWith(ten), 4);
    expect(relaxed.summary.maxPerDay).toBe(3);
    expect(relaxed.summary.daysUsed).toBe(4);
    const { relaxed: few } = byStrategy(tripWith(ten.slice(0, 4)), 4);
    expect(few.summary.maxPerDay).toBe(1);
  });
  it("a mais econômica visita primeiro os gratuitos e deixa os pagos de fora quando falta espaço", () => {
    const { budget } = byStrategy(tripWith(ten), 1);
    const titles = budget.draft.activities.map((a) => a.title);
    expect(titles.slice(0, 3).sort()).toEqual(["p3", "p4", "p5"]);
    expect(budget.summary.paid).toBe(0);
    const left = budget.draft.unassigned.map((p) => p.id);
    expect(left).toEqual(expect.arrayContaining(["p0", "p1", "p2"]));
    expect(left).toHaveLength(5);
    expect(budget.summary.free).toBe(3);
    expect(budget.summary.unknownPrice).toBe(2);
  });
  it("não adivinha preço pela categoria", () => {
    expect(listedPrice(place("a", 0))).toBe("unknown");
    expect(listedPrice(place("a", 0, "no"))).toBe("free");
    expect(listedPrice(place("a", 0, "yes"))).toBe("paid");
    expect(listedPrice(place("a", 0, "10 EUR"))).toBe("paid");
  });
  it("informa quando a distância não está completa", () => {
    const noCoords = { ...place("x", 0), coordinates: undefined };
    const [a] = generateAlternatives(tripWith([place("a", 1), noCoords]), { days: 1, includeMaybe: false });
    expect(a.summary.kmComplete).toBe(false);
    expect(summarize({ activities: [], unassigned: [], warnings: [] }).places).toBe(0);
  });
  it("funciona sem lugares e sem datas", () => {
    const alts = generateAlternatives(newTrip(), { days: 3, includeMaybe: false });
    expect(alts.every((a) => a.summary.places === 0)).toBe(true);
  });
});
