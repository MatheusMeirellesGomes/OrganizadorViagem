import { it, expect } from "vitest";
import { directionsLink, daySegments, mapStops } from "./routes";
import { newTrip, type Activity } from "./model";
const a: Activity = {
  id: "a",
  title: "Passeio",
  day: 1,
  time: "",
  address: "Rua & Praça",
  kind: "Passeio",
  done: false,
};
it("gera links codificados sem precisar de chave e sem origem presumida", () => {
  const url = new URL(directionsLink(a, "transit")!);
  expect(url.searchParams.get("destination")).toBe(a.address);
  expect(url.searchParams.get("travelmode")).toBe("transit");
  expect(url.searchParams.has("origin")).toBe(false);
  expect(directionsLink({ ...a, address: "" }, "walking")).toBeUndefined();
  expect(
    new URL(
      directionsLink({ ...a, coordinates: { lat: 0, lng: 0 } }, "driving", a)!,
    ).searchParams.get("origin"),
  ).toBe(a.address);
});
it("numera pela ordem real mesmo se faltam coordenadas e separa visitados", () => {
  const trip = newTrip({
    activities: [
      a,
      { ...a, id: "b", coordinates: { lat: 1, lng: 1 }, done: true },
    ],
  });
  expect(mapStops(trip, 1)[0]).toMatchObject({ label: "2", kind: "visited" });
  expect(mapStops(trip, 2)).toEqual([]);
});
it("não desenha atalhos que pulam atividade sem posição", () => {
  const items = [
    { ...a, coordinates: { lat: 0, lng: 0 } },
    { ...a, id: "b" },
    { ...a, id: "c", coordinates: { lat: 1, lng: 1 } },
  ];
  expect(daySegments(items, 1)).toEqual([]);
  expect(daySegments([items[0], items[2]], 1)).toHaveLength(1);
});
