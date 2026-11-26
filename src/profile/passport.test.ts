import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { buildPassport, countryCode, flag, tripCountries } from "./passport";
import { parseProfile } from "./profile";

describe("meu passaporte", () => {
  it("reconhece países pelo nome em pt, en e es e por apelidos", () => {
    expect(countryCode("Portugal")).toBe("PT");
    expect(countryCode("Espanha")).toBe("ES");
    expect(countryCode("Spain")).toBe("ES");
    expect(countryCode("Alemania")).toBe("DE");
    expect(countryCode("EUA")).toBe("US");
    expect(countryCode("Lisboa")).toBeUndefined();
    expect(flag("BR")).toBe("🇧🇷");
  });

  it("monta carimbos e países só das viagens concluídas", () => {
    const trips = [
      newTrip({ title: "Europa", destination: "Lisboa, Portugal / Madri, Espanha", start: "2025-05-01", end: "2025-05-15", status: "past", stays: [{ id: "s", name: "H", address: "", city: "Porto", start: "", end: "", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "" }] }),
      newTrip({ title: "Gramado", destination: "Gramado", scope: "national", start: "2024-07-01", end: "2024-07-05", status: "past" }),
      newTrip({ title: "Japão", destination: "Japão", status: "upcoming" }),
    ];
    expect(tripCountries(trips[0]).sort()).toEqual(["ES", "PT"]);
    const p = buildPassport(trips, ["AR", "XX"], [{ place: { id: "w", name: "Machu Picchu", tags: { country_code: "pe" } } as never, collection: "x", addedAt: "2024-01-01", visitedAt: "2024-02-01T10:00:00Z" }]);
    expect(p.stamps.map((s) => s.trip.title)).toEqual(["Gramado", "Europa"]);
    expect(p.countries.map((c) => c.code).sort()).toEqual(["AR", "BR", "ES", "PE", "PT"]);
    expect(p.continents.find((c) => c.id === "sa")?.visited).toBe(3);
    expect(p.continents.find((c) => c.id === "eu")?.visited).toBe(2);
    expect(p.continents.some((c) => c.id === "an")).toBe(false);
    expect(p.cities).toBe(3);
  });

  it("guarda no perfil só códigos válidos", () => {
    expect(parseProfile({ name: "A", pace: "own", visitedCountries: ["BR", "BR", "ZZ", 3] }).visitedCountries).toEqual(["BR"]);
  });
});
