import { it, expect } from "vitest";
import {
  generateItinerary,
  appendDraft,
  straightLineLength,
} from "./itinerary";
import { newTrip } from "./model";
import { choosePlace, type SavedPlace } from "./choices";
const place = (id: string, lng?: number): SavedPlace => ({
  id,
  name: id,
  address: "",
  city: "",
  country: "",
  source: "",
  retrievedAt: "",
  tags: {},
  category: "other",
  coordinates: lng === undefined ? undefined : { lat: 0, lng },
});
it("agrupa proximidade, respeita capacidade e identifica lugares não incluídos", () => {
  let t = newTrip({ coordinates: { lat: 0, lng: 0 } });
  for (const p of [place("d", 3), place("a", 0), place("c", 2), place("b", 1)])
    t = choosePlace(t, p, "want");
  const draft = generateItinerary(t, {
    days: 1,
    pace: "relaxed",
    includeMaybe: false,
  });
  expect(draft.activities.map((a) => a.title)).toEqual(["a", "b", "c"]);
  expect(draft.unassigned[0].name).toBe("d");
  expect(draft.activities.every((a) => a.time === "")).toBe(true);
});
it("mantém lugares sem coordenadas e exclui Passar, visitados e Talvez opcional", () => {
  let t = choosePlace(newTrip(), place("a"), "want");
  t = choosePlace(t, place("b"), "maybe");
  t = choosePlace(t, place("c"), "skip");
  const draft = generateItinerary(t, {
    days: 3,
    pace: "balanced",
    includeMaybe: true,
  });
  expect(draft.activities).toHaveLength(2);
  expect(draft.warnings.join(" ")).toContain("sem coordenadas");
  expect(
    generateItinerary(t, { days: 1, pace: "balanced", includeMaybe: false })
      .activities,
  ).toHaveLength(1);
});
it("aceitar preserva atividades e IDs existentes, não duplica e rejeita dia inválido", () => {
  const t = choosePlace(newTrip(), place("a"), "want");
  const draft = generateItinerary(t, {
    days: 1,
    pace: "balanced",
    includeMaybe: false,
  });
  const saved = appendDraft(t, draft.activities);
  expect(saved.activities[0].id).not.toBe(draft.activities[0].id);
  expect(appendDraft(saved, draft.activities).activities).toHaveLength(1);
  expect(t.activities).toEqual([]);
  expect(() => appendDraft(t, [{ ...draft.activities[0], day: 0 }])).toThrow();
  expect(straightLineLength(saved.activities).segments).toBe(0);
});
