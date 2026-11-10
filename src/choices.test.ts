import { it, expect } from "vitest";
import {
  choosePlace,
  undoChoice,
  swipeDecision,
  type SavedPlace,
} from "./choices";
import { newTrip } from "./model";
import { parseBackup } from "./offline";
import { addPlaceToTrip } from "./food";
const place: SavedPlace = {
  id: "manual:1",
  name: "Lugar",
  category: "other",
  address: "",
  city: "",
  country: "",
  source: "",
  tags: {},
  retrievedAt: "2026-11-10T12:00:00Z",
};
it("troca decisões sem duplicar e desfaz sem apagar atividade", () => {
  const original = newTrip(),
    want = choosePlace(original, place, "want"),
    maybe = choosePlace(want, place, "maybe");
  expect(original.placeChoices).toBeUndefined();
  expect(maybe.placeChoices).toHaveLength(1);
  expect(maybe.placeChoices![0].decision).toBe("maybe");
  const route = addPlaceToTrip(maybe, place, 1);
  expect(undoChoice(route, place.id).activities).toHaveLength(1);
  expect(undoChoice(route, place.id).placeChoices).toEqual([]);
});
it("gestos exigem direção horizontal e distância, preservando rolagem", () => {
  expect(swipeDecision(100, 10)).toBe("want");
  expect(swipeDecision(-100, 0)).toBe("skip");
  expect(swipeDecision(50, 0)).toBeUndefined();
  expect(swipeDecision(100, 200)).toBeUndefined();
});
it("backup mantém escolha sem coordenadas e não inventa ponto no mapa", () => {
  const trip = choosePlace(newTrip(), place, "visited");
  const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [trip] }));
  expect(copy.placeChoices![0].decision).toBe("visited");
  expect(copy.placeChoices![0].place.coordinates).toBeUndefined();
  expect(copy.placeChoices![0].place.id).toBe(place.id);
});
