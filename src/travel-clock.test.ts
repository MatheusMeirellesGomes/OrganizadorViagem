import { it, expect } from "vitest";
import {
  dateInZone,
  currentTripDay,
  validTimeZone,
  nearbySavedPlaces,
} from "./travel-clock";
import { newTrip } from "./model";
import { parseBackup } from "./offline";
it("reconhece datas diferentes para o mesmo instante em fusos distintos", () => {
  const now = new Date("2027-01-23T01:00:00Z");
  expect(dateInZone(now, "America/Sao_Paulo")).toBe("2027-01-22");
  expect(dateInZone(now, "Europe/Madrid")).toBe("2027-01-23");
  expect(
    currentTripDay(
      newTrip({
        start: "2027-01-22",
        end: "2027-01-24",
        timeZone: "Europe/Madrid",
      }),
      now,
    ),
  ).toBe(2);
});
it("não cria dia atual fora da viagem ou sem datas e rejeita fusos inválidos", () => {
  expect(validTimeZone("Mars/Foo")).toBe(false);
  expect(currentTripDay(newTrip())).toBeUndefined();
  expect(
    currentTripDay(
      newTrip({ start: "2027-01-22", end: "2027-01-23" }),
      new Date("2028-01-01"),
    ),
  ).toBeUndefined();
  const [copy] = parseBackup(
    JSON.stringify({
      version: 1,
      trips: [newTrip({ timeZone: "Europe/Lisbon" })],
    }),
  );
  expect(copy.timeZone).toBe("Europe/Lisbon");
});
it("proximidade não inventa posição e elimina duplicações", () => {
  const t = newTrip({
    activities: [
      {
        id: "a",
        placeId: "p",
        title: "Lugar",
        day: 1,
        time: "",
        address: "",
        done: false,
        kind: "",
        coordinates: { lat: 0, lng: 0 },
      },
    ],
    placeChoices: [
      {
        decision: "want",
        decidedAt: "",
        place: {
          id: "p",
          name: "Lugar",
          category: "other",
          address: "",
          city: "",
          country: "",
          source: "",
          retrievedAt: "",
          tags: {},
          coordinates: { lat: 0, lng: 0 },
        },
      },
    ],
  });
  expect(nearbySavedPlaces(t, { lat: 0, lng: 0 })).toHaveLength(1);
  expect(nearbySavedPlaces(t, { lat: 0, lng: 0 })[0].distance).toBe(0);
  expect(nearbySavedPlaces(t, { lat: NaN, lng: 0 })).toEqual([]);
});
