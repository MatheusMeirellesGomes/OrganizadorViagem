import { describe, expect, it } from "vitest";
import { newTrip, type Trip } from "../model";
import { parseBackup } from "../offline";
import { dayPanel } from "../travel-day";
import { summarize } from "../budget";
import { tripContext } from "../../supabase/functions/_shared/assistant";
import { saveTransport, journeyTimeline, legsOn } from "./transport";
import { saveVehicle, fuelEstimate } from "./vehicles";
import { setCost } from "./costs";
import { walletItems } from "./wallet";
import { addReminder, candidates } from "./reminders";
import { addItem } from "./packing";
import { setPrep } from "./prep";
import { filterMap, tripMapData } from "./tripmap";

/*
 * Fictional trip used across modules (no real personal data): five
 * travelers, a flight to Lisbon, two rental cars, the drive to Madrid,
 * stays in two cities, costs in reais and euros.
 */
function scenario(): Trip {
  let t = newTrip({
    title: "Península (teste)",
    destination: "Madrid",
    start: "2027-01-23",
    end: "2027-02-02",
    scope: "international",
    timeZone: "Europe/Lisbon",
    budgetEnabled: true,
    participants: ["Ana", "Bia", "Caio", "Duda", "Edu"].map((name, i) => ({ id: "p" + i, name })),
    stays: [
      { id: "s1", name: "Hotel Lisboa (teste)", address: "", city: "Lisboa", start: "2027-01-24", end: "2027-01-25", checkInTime: "15:00", checkOutTime: "08:00", url: "", confirmation: "", notes: "", coordinates: { lat: 38.71, lng: -9.14 } },
      { id: "s2", name: "Hotel Madrid (teste)", address: "", city: "Madrid", start: "2027-01-25", end: "2027-01-29", checkInTime: "16:00", checkOutTime: "11:00", url: "", confirmation: "", notes: "", coordinates: { lat: 40.42, lng: -3.7 } },
    ],
  });
  t.activities = [{ id: "a1", title: "Museo del Prado", day: 4, time: "10:00", address: "", done: false, kind: "Museu", coordinates: { lat: 40.4138, lng: -3.6921 } }];
  t = saveTransport(t, {
    id: "f1",
    kind: "flight",
    title: "Ida para Lisboa",
    hasSecret: true,
    passengers: ["p0", "p1", "p2", "p3", "p4"],
    flight: { checkInDate: "2027-01-22", checkInTime: "14:10", checkInStatus: "unknown", checkedBag: "23 kg" },
    legs: [
      { id: "l1", from: { name: "Confins", code: "CNF", point: { lat: -19.63, lng: -43.97 } }, to: { name: "Guarulhos", code: "GRU", point: { lat: -23.43, lng: -46.47 } }, departDate: "2027-01-23", departTime: "14:10", departZone: "America/Sao_Paulo", arriveDate: "2027-01-23", arriveTime: "15:25", arriveZone: "America/Sao_Paulo", number: "XX 1234" },
      { id: "l2", from: { name: "Guarulhos", code: "GRU", point: { lat: -23.43, lng: -46.47 } }, to: { name: "Lisboa", code: "LIS", point: { lat: 38.77, lng: -9.13 } }, departDate: "2027-01-23", departTime: "17:30", departZone: "America/Sao_Paulo", arriveDate: "2027-01-24", arriveTime: "07:05", arriveZone: "Europe/Lisbon", number: "XX 88" },
    ],
  });
  t = saveVehicle(t, { id: "A", ownership: "rental", label: "Carro A", efficiency: 12.5, seats: 5, rental: { pickupPlace: "Aeroporto de Lisboa", pickupDate: "2027-01-24", pickupTime: "09:00", dropoffDate: "2027-02-01", currency: "EUR" } });
  t = saveVehicle(t, { id: "B", ownership: "rental", label: "Carro B", efficiency: 14, seats: 5, rental: { pickupPlace: "Aeroporto de Lisboa", pickupDate: "2027-01-24", pickupTime: "09:00", currency: "EUR" } });
  t = saveTransport(t, {
    id: "c1",
    kind: "rental_car",
    title: "Lisboa → Madrid",
    road: { vehicleIds: ["A", "B"], distanceKm: 625, distanceSource: "manual" },
    legs: [{ id: "lr", from: { name: "Lisboa", point: { lat: 38.72, lng: -9.14 } }, to: { name: "Madrid", point: { lat: 40.42, lng: -3.7 } }, departDate: "2027-01-25", departTime: "08:30", arriveDate: "2027-01-25", arriveTime: "15:30" }],
  });
  t = setCost(t, { transportId: "f1" }, "fare", { planned: 25000, paid: 25000, currency: "BRL", title: "Ida para Lisboa", kind: "flight" });
  t = setCost(t, { vehicleId: "A" }, "rental", { planned: 420, currency: "EUR", title: "Carro A" });
  t = setCost(t, { vehicleId: "B" }, "rental", { planned: 310, currency: "EUR", title: "Carro B" });
  const fuelA = fuelEstimate({ km: 625, consumption: 12.5, unit: "km_per_l", price: 1.7, currency: "EUR" }).cost;
  const fuelB = fuelEstimate({ km: 625, consumption: 14, unit: "km_per_l", price: 1.7, currency: "EUR" }).cost;
  t = setCost(t, { transportId: "c1" }, "fuel", { planned: fuelA + fuelB, currency: "EUR", title: "Lisboa → Madrid", kind: "rental_car" });
  t = setCost(t, { transportId: "c1" }, "tolls", { planned: 48.5 * 2, currency: "EUR", title: "Lisboa → Madrid", kind: "rental_car" });
  t.reservations = [{ id: "r1", title: "Entrada Prado", details: "", url: "", activityId: "a1" }];
  t.documents = [{ id: "d1", name: "eticket.pdf", mime: "application/pdf", size: 9, url: "data:application/pdf;base64," + btoa("%PDF-1.4 x"), transportId: "f1", category: "tickets" }];
  return t;
}

describe("cenário completo: módulos compartilham as mesmas informações", () => {
  it("linha do tempo, Modo Viagem e calendário mostram voo, chegada, carro e hotéis", () => {
    const t = scenario();
    const days = journeyTimeline(t);
    expect(days.find((d) => d.date === "2027-01-24")!.items.map((i) => i.kind)).toEqual(["arrive", "checkin"]);
    expect(days.find((d) => d.date === "2027-01-25")!.items.map((i) => i.kind)).toEqual(["checkout", "depart", "checkin"]);
    expect(legsOn(t, "2027-01-24").map((x) => x.leg.to.code)).toEqual(["LIS"]);
    expect(dayPanel(t, 2, "walking").stay?.name).toBe("Hotel Lisboa (teste)");
    expect(dayPanel(t, 3, "walking").stay?.name).toBe("Hotel Madrid (teste)");
  });
  it("orçamento recebe cada custo uma vez, em reais e euros, só a passagem paga", () => {
    const t = scenario();
    expect(t.expenses).toHaveLength(5);
    expect(t.expenses.filter((x) => x.status === "paid").map((x) => x.costKey)).toEqual(["fare"]);
    const eur = summarize(t.expenses, "EUR");
    // 420 + 310 + fuel (85 + 75.89) + tolls 97
    expect(eur.planned).toBe(98789);
    expect(eur.unconverted.map((x) => x.currency)).toEqual(["BRL"]);
  });
  it("carteira, lembretes e mapa usam os mesmos registros", () => {
    let t = scenario();
    const w = walletItems(t);
    expect(w.filter((i) => i.category === "tickets").map((i) => i.id)).toEqual(["t:f1", "t:c1", "d:d1"]);
    expect(w.find((i) => i.id === "t:f1")!.documentIds).toEqual(["d1"]);
    expect(w.filter((i) => i.category === "rentals")).toHaveLength(2);
    const c = candidates(t);
    expect(c.map((x) => x.kind)).toEqual(expect.arrayContaining(["flight_checkin", "boarding", "car_pickup", "hotel_checkin", "timed_ticket"]));
    t = addReminder(t, c.find((x) => x.kind === "car_pickup")!, 60);
    const map = tripMapData(t);
    expect(map.segments.map((s) => [s.mode, s.distanceKind])).toEqual([["air", "straight"], ["air", "straight"], ["road", "manual"]]);
    expect(filterMap(map, { date: "2027-01-25" }).segments.map((s) => s.transportId)).toEqual(["c1"]);
    expect(map.segments[2].costs).toEqual([{ currency: "EUR", planned: 257.89, paid: 0 }]);
  });
  it("backup preserva e religa tudo, sem localizador e com ids novos", () => {
    let t = scenario();
    t = addReminder(t, candidates(t).find((x) => x.kind === "boarding")!, 180);
    t = addItem(t, { title: "Passaporte", category: "documents", qty: 1, travelerId: "p2" });
    t = setPrep(t, "idp", { status: "ok", source: "https://exemplo.gov/pid", checkedAt: "2026-11-12" });
    t.carComparison = { currency: "BRL", km: 1200, options: [{ id: "o", name: "Dois carros", cars: [{ label: "A", rental: 1800 }, { label: "B", rental: 1000 }] }] };
    const [back] = parseBackup(JSON.stringify({ version: 1, trips: [t] }));
    expect(back.id).not.toBe(t.id);
    expect(back.transports).toHaveLength(2);
    const f = back.transports!.find((x) => x.kind === "flight")!;
    const road = back.transports!.find((x) => x.kind === "rental_car")!;
    expect(f.id).not.toBe("f1");
    expect(f.hasSecret).toBeUndefined();
    expect(f.legs.map((l) => l.number)).toEqual(["XX 1234", "XX 88"]);
    expect(f.passengers).toHaveLength(5);
    expect(f.passengers!.every((p) => back.participants!.some((x) => x.id === p))).toBe(true);
    expect(road.road!.vehicleIds!.every((v) => back.vehicles!.some((x) => x.id === v))).toBe(true);
    expect(back.expenses.filter((x) => x.transportId === f.id).map((x) => x.costKey)).toEqual(["fare"]);
    expect(back.expenses.filter((x) => x.vehicleId).length).toBe(2);
    expect(back.documents![0]).toMatchObject({ category: "tickets", transportId: f.id });
    expect(back.reminders![0].refId).toBe(f.id);
    expect(back.packing![0].travelerId).toBe(back.participants![2].id);
    expect(back.prep!.idp.status).toBe("ok");
    expect(back.carComparison!.options[0].cars.map((c) => c.rental)).toEqual([1800, 1000]);
    // Old trips without Etapa 16 data still import unchanged.
    const [old] = parseBackup(JSON.stringify({ version: 1, trips: [{ ...newTrip({ title: "Antiga" }), transports: undefined }] }));
    expect(old.title).toBe("Antiga");
    expect(old.transports).toEqual([]);
  });
  it("o assistente não recebe transportes, localizadores, veículos nem documentos", () => {
    const ctx = JSON.stringify(tripContext(scenario() as never));
    for (const s of ["XX 88", "Carro A", "eticket", "Aeroporto de Lisboa", "25000", "hasSecret"]) expect(ctx).not.toContain(s);
  });
});
