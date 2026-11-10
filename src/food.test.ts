import { it, expect } from "vitest";
import { foodMatches, nearestPlaces, addPlaceToTrip } from "./food";
import { normalizePlaces, catalogQuery } from "./places";
import { newTrip } from "./model";
import { parseBackup } from "./offline";
const [place] = normalizePlaces({
  elements: [
    {
      type: "node",
      id: 1,
      lat: 0,
      lon: 0,
      tags: {
        name: "Café",
        amenity: "cafe",
        cuisine: "coffee_shop;italian",
        "diet:vegan": "yes",
      },
    },
  ],
});
it("filtra somente atributos conhecidos sem inferir refeição ou dieta", () => {
  expect(
    foodMatches(place, { cuisine: "italian", diet: "vegan", meal: "" }),
  ).toBe(true);
  expect(
    foodMatches(place, { cuisine: "", diet: "vegetarian", meal: "" }),
  ).toBe(false);
  expect(foodMatches(place, { cuisine: "", diet: "", meal: "breakfast" })).toBe(
    false,
  );
  expect(catalogQuery({ lat: 0, lng: 0 }, 500, "food")).toContain(
    "restaurant|cafe",
  );
});
it("adiciona restaurante com origem/coordenadas e impede duplicata no mesmo dia", () => {
  const t = addPlaceToTrip(newTrip(), place, 2);
  expect(t.activities[0].coordinates).toEqual({ lat: 0, lng: 0 });
  expect(t.activities[0].time).toBe("");
  expect(() => addPlaceToTrip(t, place, 2)).toThrow("já está");
  expect(addPlaceToTrip(t, place, 3).activities).toHaveLength(2);
  const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [t] }));
  expect(copy.activities[0].placeId).toBe(place.id);
  expect(copy.activities[0].coordinates).toEqual(place.coordinates);
});
it("ordena por proximidade sem mutar catálogo", () => {
  const far = { ...place, id: "far", coordinates: { lat: 0, lng: 1 } },
    items = [far, place];
  expect(nearestPlaces(items, { lat: 0, lng: 0 })[0]).toBe(place);
  expect(items[0]).toBe(far);
});
