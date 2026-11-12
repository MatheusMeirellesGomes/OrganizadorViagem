import { describe, expect, it } from "vitest";
import { newTrip, type Trip } from "../model";
import { summarize } from "../budget";
import { minutesBetween, toInstant } from "./time";
import { checkTransport, cleanTransport, journeyTimeline, legMinutes, removeTransport, saveTransport, sortedTransports } from "./transport";
import { linkedCosts, setCost } from "./costs";
import { compareOptions, fuelEstimate, newOption, removeVehicle, saveVehicle } from "./vehicles";
import { cleanCode, localSecretStore } from "./secrets";
import { drivingLinks, roadRoutes, simplify } from "./routing";
import type { Transport } from "./types";

/* Fictional scenario: 5 travelers, flight BH → São Paulo → Lisboa, two rental cars, drive to Madrid. */
const base = (): Trip =>
  newTrip({
    title: "Península (teste)",
    start: "2027-01-23",
    end: "2027-02-03",
    timeZone: "Europe/Lisbon",
    participants: ["Ana", "Bia", "Caio", "Duda", "Edu"].map((name, i) => ({ id: "p" + i, name })),
    stays: [
      { id: "s1", name: "Hotel Lisboa (teste)", address: "", city: "Lisboa", start: "2027-01-24", end: "2027-01-25", checkInTime: "15:00", checkOutTime: "11:00", url: "", confirmation: "", notes: "" },
      { id: "s2", name: "Hotel Madrid (teste)", address: "", city: "Madrid", start: "2027-01-25", end: "2027-01-29", checkInTime: "16:00", checkOutTime: "11:00", url: "", confirmation: "", notes: "" },
    ],
  });

const flight: Transport = {
  id: "f1",
  kind: "flight",
  title: "Ida para Lisboa",
  passengers: ["p0", "p1", "p2", "p3", "p4"],
  legs: [
    { id: "l1", from: { name: "Confins", code: "cnf" }, to: { name: "Guarulhos", code: "GRU" }, departDate: "2027-01-23", departTime: "14:10", departZone: "America/Sao_Paulo", arriveDate: "2027-01-23", arriveTime: "15:25", arriveZone: "America/Sao_Paulo", carrier: "Companhia Teste", number: "xx 1234" },
    { id: "l2", from: { name: "Guarulhos", code: "GRU" }, to: { name: "Lisboa", code: "LIS" }, departDate: "2027-01-23", departTime: "17:30", departZone: "America/Sao_Paulo", arriveDate: "2027-01-24", arriveTime: "07:05", arriveZone: "Europe/Lisbon", carrier: "Companhia Teste", number: "XX 88", seat: "23C" },
  ],
  flight: { cabinBag: "10 kg", checkedBag: "23 kg", checkInStatus: "unknown" },
};

describe("fusos horários", () => {
  it("converte hora local em instante, inclusive com horário de verão", () => {
    expect(new Date(toInstant("2027-01-23", "17:30", "America/Sao_Paulo")!).toISOString()).toBe("2027-01-23T20:30:00.000Z");
    expect(new Date(toInstant("2027-01-24", "07:05", "Europe/Lisbon")!).toISOString()).toBe("2027-01-24T07:05:00.000Z");
    expect(new Date(toInstant("2027-07-10", "10:00", "Europe/Madrid")!).toISOString()).toBe("2027-07-10T08:00:00.000Z");
  });
  it("voo transatlântico dura o tempo real, não a diferença dos relógios", () => {
    // 17:30 in São Paulo (UTC-3) to 07:05 in Lisbon (UTC+0): 10 h 35.
    expect(minutesBetween({ date: "2027-01-23", time: "17:30", zone: "America/Sao_Paulo" }, { date: "2027-01-24", time: "07:05", zone: "Europe/Lisbon" })).toBe(635);
    expect(legMinutes(base(), flight.legs[1])).toBe(635);
  });
});

describe("transportes e voos", () => {
  it("cadastra voo com escala e mantém cada trecho com seus dados", () => {
    const t = saveTransport(base(), flight);
    const f = t.transports![0];
    expect(f.legs).toHaveLength(2);
    expect(f.legs[0].from.code).toBe("CNF");
    expect(f.legs[0].number).toBe("XX 1234");
    expect(f.legs[1].seat).toBe("23C");
    expect(checkTransport(t, f).warnings).toEqual([]);
  });
  it("recusa chegada antes da partida e trecho que sai antes do anterior chegar", () => {
    const wrong = { ...flight, legs: [{ ...flight.legs[0], arriveTime: "13:00" }] };
    expect(() => saveTransport(base(), wrong)).toThrow("chegada está antes da partida");
    const overlap = { ...flight, legs: [flight.legs[0], { ...flight.legs[1], departTime: "15:00" }] };
    expect(() => saveTransport(base(), overlap)).toThrow("parte antes de o anterior chegar");
    const tight = { ...flight, legs: [flight.legs[0], { ...flight.legs[1], departTime: "15:55" }] };
    expect(checkTransport(base(), cleanTransport(tight)!).warnings).toContain("Conexão com menos de 45 minutos.");
  });
  it("o localizador nunca entra nos dados da viagem", () => {
    const t = saveTransport(base(), { ...flight, ...({ pnr: "ABC123", secret: "ABC123" } as object) } as Transport);
    expect(JSON.stringify(t)).not.toContain("ABC123");
  });
  it("descarta link de check-in que não é https e campos desconhecidos", () => {
    const t = cleanTransport({ ...flight, flight: { checkInUrl: "javascript:alert(1)" }, evil: 1 })!;
    expect(t.flight?.checkInUrl).toBeUndefined();
    expect("evil" in t).toBe(false);
  });
  it("linha do tempo junta voo, chegada no outro dia, hospedagens e atividades em ordem", () => {
    let t = saveTransport(base(), flight);
    t = saveTransport(t, { id: "c1", kind: "rental_car", legs: [{ id: "x", from: { name: "Lisboa" }, to: { name: "Madrid" }, departDate: "2027-01-25", departTime: "08:00", arriveDate: "2027-01-25", arriveTime: "15:00" }] });
    t.activities = [{ id: "a", title: "Museo del Prado", day: 4, time: "10:00", address: "", done: false, kind: "Museu" }];
    const days = journeyTimeline(t);
    expect(days.map((d) => d.date)).toEqual(["2027-01-23", "2027-01-24", "2027-01-25", "2027-01-26", "2027-01-29"]);
    expect(days[0].items.map((i) => i.kind)).toEqual(["depart", "depart"]);
    expect(days[1].items.map((i) => i.kind)).toEqual(["arrive", "checkin"]);
    expect(days[2].items.map((i) => i.kind)).toEqual(["depart", "checkout", "checkin"]);
    expect(days[3].items[0]).toMatchObject({ kind: "activities", count: 1 });
    expect(sortedTransports(t).map((x) => x.id)).toEqual(["f1", "c1"]);
  });
});

describe("custos vinculados", () => {
  it("passagem vai ao orçamento sem duplicar e só fica paga quando informado", () => {
    let t = saveTransport(base(), flight);
    t = setCost(t, { transportId: "f1" }, "fare", { planned: 12500, currency: "BRL", title: "Ida", kind: "flight" });
    t = setCost(t, { transportId: "f1" }, "fare", { planned: 12000, currency: "BRL", title: "Ida", kind: "flight" });
    expect(linkedCosts(t, { transportId: "f1" })).toHaveLength(1);
    expect(t.expenses[0]).toMatchObject({ estimate: 12000, amount: 0, status: "planned", category: "flights" });
    t = setCost(t, { transportId: "f1" }, "fare", { paid: 6000, currency: "BRL", title: "Ida" });
    expect(t.expenses[0]).toMatchObject({ estimate: 12000, amount: 6000, status: "partial" });
    // Unknown value: nothing is created.
    expect(setCost(t, { transportId: "f1" }, "tolls", { currency: "BRL", title: "Ida" }).expenses).toHaveLength(1);
  });
  it("remover o transporte mantém a despesa, sem vínculo", () => {
    let t = saveTransport(base(), flight);
    t = setCost(t, { transportId: "f1" }, "fare", { planned: 100, currency: "EUR", title: "Ida" });
    t = removeTransport(t, "f1");
    expect(t.transports).toEqual([]);
    expect(t.expenses).toHaveLength(1);
    expect(t.expenses[0].transportId).toBeUndefined();
  });
});

describe("carros e combustível", () => {
  it("calcula o exemplo: 500 km a 12,5 km/L com €1,70 = 40 L e €68", () => {
    expect(fuelEstimate({ km: 500, consumption: 12.5, unit: "km_per_l", price: 1.7, currency: "EUR" })).toMatchObject({ quantity: 40, unit: "L", cost: 68 });
    expect(fuelEstimate({ km: 625, consumption: 7, unit: "l_per_100km", price: 1.659, currency: "EUR" }).cost).toBe(72.58);
    expect(fuelEstimate({ km: 300, consumption: 18, unit: "kwh_per_100km", price: 0.4, currency: "EUR" })).toMatchObject({ quantity: 54, unit: "kWh", cost: 21.6 });
    expect(() => fuelEstimate({ km: 0, consumption: 12, unit: "km_per_l", price: 1, currency: "EUR" })).toThrow("distância");
  });
  it("cadastra dois carros alugados, aluguel previsto sem duplicar e remove sem apagar despesas", () => {
    let t = saveVehicle(base(), { id: "A", ownership: "rental", label: "Carro A", efficiency: "14,2", seats: "5", rental: { company: "Locadora Teste", pickupDate: "2027-01-24", pickupTime: "09:00", dropoffDate: "2027-02-02", dropoffTime: "10:00", drivers: "Ana, Bia", countries: "Portugal; Espanha", currency: "brl" } });
    t = saveVehicle(t, { id: "B", ownership: "rental", label: "Carro B", seats: 5 });
    expect(t.vehicles![0]).toMatchObject({ efficiency: 14.2, rental: { drivers: ["Ana", "Bia"], countries: ["Portugal", "Espanha"], currency: "BRL" } });
    expect(() => saveVehicle(t, { id: "A", ownership: "rental", rental: { pickupDate: "2027-01-24", dropoffDate: "2027-01-20" } })).toThrow("devolução");
    t = setCost(t, { vehicleId: "A" }, "rental", { planned: 1800, currency: "BRL", title: "Carro A" });
    t = setCost(t, { vehicleId: "A" }, "rental", { planned: 1800, currency: "BRL", title: "Carro A" });
    t = setCost(t, { vehicleId: "B" }, "rental", { planned: 1000, currency: "BRL", title: "Carro B" });
    expect(t.expenses.filter((x) => x.costKey === "rental")).toHaveLength(2);
    expect(t.expenses.every((x) => x.status === "planned")).toBe(true);
    t = removeVehicle(t, "A");
    expect(t.vehicles!.map((v) => v.id)).toEqual(["B"]);
    expect(t.expenses).toHaveLength(2);
  });
  it("compara dois carros (R$ 1.800 + R$ 1.000) com uma SUV de 7 lugares", () => {
    const c = {
      currency: "BRL",
      km: 1200,
      fuelPrice: 9,
      tolls: 150,
      parkingPerDay: 40,
      days: 5,
      passengers: 5,
      bags: 5,
      drivers: 2,
      options: [
        newOption("Dois carros", [
          { label: "Carro A", rental: 1800, efficiency: 12, seats: 5, bags: 3 },
          { label: "Carro B", rental: 1000, efficiency: 14, seats: 5, bags: 2 },
        ]),
        newOption("SUV 7 lugares", [{ label: "SUV", rental: 2600, efficiency: 9, seats: 7, bags: 5 }]),
      ],
    };
    const { results, cheapest } = compareOptions(c);
    // Two cars: rental 2800 + fuel 900 + 771.43 + tolls 300 + parking 400 = 5171.43
    expect(results[0].parts.rental).toBe(280000);
    expect(results[0].totalMinor).toBe(517143);
    // SUV: 2600 + 1200 + 150 + 200 = 4150 → the single car wins here.
    expect(results[1].totalMinor).toBe(415000);
    expect(cheapest).toBe(results[1].id);
    expect(results[1].perPersonMinor).toBe(83000);
    // Two cars need two drivers: with one driver they do not qualify.
    expect(compareOptions({ ...c, drivers: 1 }).results[0].driversOk).toBe(false);
    // Cheaper SUV is not assumed when its price is unknown.
    const unknown = compareOptions({ ...c, options: [c.options[0], newOption("SUV", [{ label: "SUV", efficiency: 9, seats: 7 }])] });
    expect(unknown.results[1].totalMinor).toBeUndefined();
    expect(unknown.results[1].missing).toEqual(["Aluguel"]);
    expect(unknown.cheapest).toBe(unknown.results[0].id);
  });
  it("orçamento soma as estimativas em reais e não mistura euros sem cotação registrada", () => {
    let t = saveTransport(base(), flight);
    t = setCost(t, { transportId: "f1" }, "fare", { planned: 12500, currency: "BRL", title: "Ida", kind: "flight" });
    t = setCost(t, { vehicleId: "A" }, "rental", { planned: 450, currency: "EUR", title: "Carro A" });
    const s = summarize(t.expenses, "BRL");
    expect(s.planned).toBe(1250000);
    expect(s.spent).toBe(0);
    expect(s.byCategory.flights.planned).toBe(1250000);
    expect(s.unconverted.map((x) => x.currency)).toEqual(["EUR"]);
  });
});

describe("localizadores privados", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  const key = crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
  it("guarda cifrado, devolve só com a chave e apaga", async () => {
    const s = memory();
    const store = localSecretStore(s, () => key);
    await store.set("trip", "f1", "  ABC 123 ");
    expect(s.m.get("gomes-localizadores-v1")).not.toContain("ABC");
    expect(await store.get("trip", "f1")).toBe("ABC 123");
    const other = localSecretStore(s, () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>);
    await expect(other.get("trip", "f1")).rejects.toThrow();
    await store.remove("trip", "f1");
    expect(await store.get("trip", "f1")).toBeUndefined();
  });
  it("valida o formato do código", () => {
    expect(cleanCode(" ab-12/3 ")).toBe("ab-12/3");
    expect(() => cleanCode("<script>")).toThrow();
    expect(() => cleanCode("x".repeat(41))).toThrow();
  });
});

describe("rotas", () => {
  it("usa a distância por estrada do provedor e nunca linha reta", async () => {
    let url = "";
    const fetcher = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 625430, duration: 22800, geometry: { coordinates: [[-9.14, 38.72], [-3.7, 40.42]] } }] }));
    }) as unknown as typeof fetch;
    const [r] = await roadRoutes([{ lat: 38.72, lng: -9.14 }, { lat: 40.42, lng: -3.7 }], { fetcher, base: "https://rotas.exemplo" });
    expect(url).toContain("/route/v1/driving/-9.14000,38.72000;-3.70000,40.42000");
    expect(r).toMatchObject({ distanceKm: 625.4, durationMin: 380, line: [[38.72, -9.14], [40.42, -3.7]] });
  });
  it("sem provedor, pede a quilometragem manual", async () => {
    await expect(roadRoutes([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], { base: "off" })).rejects.toThrow("manualmente");
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(roadRoutes([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], { fetcher: down, base: "https://x.y" })).rejects.toThrow("manualmente");
  });
  it("simplifica a linha e monta links do Google e da Apple", () => {
    expect(simplify(Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number]), 200)).toHaveLength(200);
    const l = drivingLinks([{ lat: 38.72, lng: -9.14 }, { lat: 39.47, lng: -6.37 }, { lat: 40.42, lng: -3.7 }])!;
    expect(l.google).toContain("waypoints=39.47%2C-6.37");
    expect(l.apple).toContain("dirflg=d");
  });
});
