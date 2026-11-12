import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { overviewMetrics, genericPhotos } from "./metrics";

const place = (id: string, photo: boolean) => ({
  id,
  name: "Lugar " + id,
  address: "",
  city: "",
  country: "",
  category: "museum",
  source: "",
  retrievedAt: "",
  tags: photo ? { image_source: "wikidata-p18", image_file: "Foto " + id + ".jpg" } : ({} as Record<string, string>),
});

describe("cards da visão geral", () => {
  it("sem viagens mostra zeros e fotos ilustrativas", () => {
    const m = overviewMetrics([]);
    expect(m.map((x) => x.value)).toEqual([0, 0, 0, 0]);
    expect(m.every((x) => x.photo.kind === "generic")).toBe(true);
    expect(m.map((x) => x.photo.url)).toEqual(Object.values(genericPhotos));
  });
  it("conta os dados reais e usa a foto verificada de um lugar do roteiro", () => {
    const a = newTrip({ status: "upcoming", start: "2027-01-23", placeChoices: [{ decision: "want", decidedAt: "", place: place("Q1", false) }, { decision: "want", decidedAt: "", place: place("Q2", true) }] });
    a.activities = [{ id: "x", title: "Q2", day: 1, time: "", address: "", done: false, kind: "", placeId: "Q2" }];
    const b = newTrip({ status: "past", destination: "Lisboa" });
    const c = newTrip({ status: "past", destination: " lisboa " });
    const m = overviewMetrics([a, b, c]);
    expect(m.map((x) => x.value)).toEqual([1, 1, 1, 2]);
    expect(m[0].photo.kind).toBe("place");
    expect(m[2].photo).toMatchObject({ kind: "place" });
    expect(m[1].photo.kind).toBe("generic");
  });
  it("um lugar marcado como Passar não vira foto", () => {
    const a = newTrip({ placeChoices: [{ decision: "skip", decidedAt: "", place: place("Q3", true) }] });
    expect(overviewMetrics([a])[0].photo.kind).toBe("generic");
  });
});
