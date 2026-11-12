import { describe, it, expect } from "vitest";
import { newTrip, type Trip } from "./model";
import type { Place } from "./places";
import { addMeal, mealAnchor, openAt, replaceMeal, waySegments, mealTime } from "./meals";

const restaurant = (id: string, name: string, lat: number, lng: number, tags: Record<string, string> = {}): Place => ({
  id, name, coordinates: { lat, lng }, category: "restaurant", address: "Calle X 1", city: "Madrid", country: "Espanha", source: "https://www.openstreetmap.org/node/1", retrievedAt: "", tags,
});
const trip = (): Trip =>
  newTrip({
    start: "2027-01-25",
    end: "2027-01-28",
    stays: [{ id: "h", name: "Hotel Madrid", address: "", city: "", start: "2027-01-25", end: "2027-01-29", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "", coordinates: { lat: 40.42, lng: -3.702 } }],
    activities: [
      { id: "a", title: "Palacio Real", day: 1, time: "10:00", address: "", done: false, kind: "Palácios", coordinates: { lat: 40.418, lng: -3.7142 } },
      { id: "b", title: "Prado", day: 1, time: "15:00", address: "", done: false, kind: "Museus", coordinates: { lat: 40.4138, lng: -3.6921 } },
      { id: "c", title: "Retiro", day: 2, time: "", address: "", done: false, kind: "Parques" },
    ],
  });

describe("refeições no roteiro", () => {
  it("procura o almoço perto da visita anterior; sem visitas, perto do hotel do dia", () => {
    expect(mealAnchor(trip(), 1, "13:00")?.name).toBe("Palacio Real");
    expect(mealAnchor(trip(), 1, "09:00")?.name).toBe("Palacio Real"); // ainda não visitou nada: a próxima visita
    expect(mealAnchor(trip(), 1, "20:30")?.name).toBe("Prado");
    expect(mealAnchor(trip(), 3, "13:00")).toMatchObject({ name: "Hotel Madrid", why: "stay" });
  });
  it("restaurantes no caminho ficam entre duas visitas", () => {
    const [seg] = waySegments(trip(), 1);
    expect(seg.from.id).toBe("a");
    expect(seg.to.id).toBe("b");
    expect(seg.radius).toBeGreaterThanOrEqual(1000);
  });
  it("adiciona no horário certo da linha do tempo, com gasto previsto, sem duplicar", () => {
    const t = addMeal(trip(), restaurant("osm:node:1", "Casa Labra", 40.4165, -3.704), { day: 1, time: "13:00", meal: "lunch", cost: { amount: 30, currency: "EUR" } });
    expect(t.activities.map((a) => a.id).slice(0, 3)).toEqual(["a", t.activities[1].id, "b"]);
    expect(t.activities[1]).toMatchObject({ title: "Casa Labra", time: "13:00", meal: "lunch", day: 1 });
    expect(t.expenses[0]).toMatchObject({ status: "planned", estimate: 30, amount: 0, activityId: t.activities[1].id });
    expect(() => addMeal(t, restaurant("osm:node:1", "Casa Labra", 40.4165, -3.704), { day: 1, time: "20:00", meal: "dinner" })).toThrow("já está");
  });
  it("substituir troca só o restaurante e mantém horário, nota e gasto ligado", () => {
    const t = addMeal(trip(), restaurant("osm:node:1", "Casa Labra", 40.4165, -3.704), { day: 1, time: "13:00", meal: "lunch", notes: "reservar", cost: { amount: 30, currency: "EUR" } });
    const id = t.activities[1].id;
    const r = replaceMeal(t, id, restaurant("osm:node:2", "Botín", 40.415, -3.706));
    expect(r.activities[1]).toMatchObject({ id, title: "Botín", time: "13:00", notes: "reservar", meal: "lunch" });
    expect(r.expenses[0].title).toBe("Botín");
    expect(r.activities.length).toBe(t.activities.length);
  });
  it("aberto naquele horário só com horário cadastrado", () => {
    const p = restaurant("x", "X", 0, 0, { opening_hours: "Mo-Fr 13:00-16:00" });
    expect(openAt(p, "2027-01-25", "13:30")).toBe(true); // segunda
    expect(openAt(p, "2027-01-30", "13:30")).toBe(false); // sábado
    expect(openAt(restaurant("y", "Y", 0, 0), "2027-01-25", "13:30")).toBeUndefined();
  });
  it("horários preferidos da viagem", () => {
    expect(mealTime(trip(), "lunch")).toBe("13:00");
    expect(mealTime({ ...trip(), mealTimes: { lunch: "14:00" } }, "lunch")).toBe("14:00");
  });
});
