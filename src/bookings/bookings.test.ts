import { describe, expect, it } from "vitest";
import { newTrip, type Trip } from "../model";
import { cancelSoon, centralItems, cleanBookings, filterCentral, moneySummary, nextBooking, setBooking } from "./central";
import { tripAlerts } from "./alerts";
import { tripEvents, tripIcs } from "./ics";
import type { Leg, Transport } from "../journey/types";

const leg = (p: Partial<Leg>): Leg => ({ id: "l" + Math.random(), from: { name: "São Paulo", code: "GRU" }, to: { name: "Lisboa", code: "LIS" }, departDate: "2027-03-10", departTime: "22:00", arriveDate: "2027-03-11", arriveTime: "11:00", ...p });
const flight = (id: string, legs: Leg[]): Transport => ({ id, kind: "flight", legs });

function trip(extra: Partial<Trip> = {}): Trip {
  return newTrip({ id: "trip1", title: "Portugal", destination: "Lisboa", start: "2027-03-10", end: "2027-03-15", timeZone: "UTC", ...extra });
}

describe("central de reservas", () => {
  it("lista voos, hospedagens e carros de todas as viagens em ordem", () => {
    const a = trip({
      transports: [flight("f1", [leg({})])],
      stays: [{ id: "h1", name: "Hotel Alfama", address: "", city: "Lisboa", start: "2027-03-11", end: "2027-03-15", checkInTime: "15:00", checkOutTime: "11:00", url: "", confirmation: "", notes: "" }],
    });
    const items = centralItems([a]);
    expect(items.map((i) => i.id)).toEqual(["t:f1", "s:h1"]);
    expect(items[0].legs?.[0]).toMatchObject({ from: "GRU", to: "LIS" });
    expect(nextBooking(items, Date.parse("2027-01-01"))?.id).toBe("t:f1");
  });

  it("guarda a situação sem tocar nos dados da reserva e descarta lixo", () => {
    const a = trip({ transports: [flight("f1", [leg({})])] });
    const b = setBooking(a, "t:f1", { status: "confirmed", cancelBy: "2027-03-01" });
    expect(b.transports).toBe(a.transports);
    expect(b.bookings).toEqual({ "t:f1": { status: "confirmed", cancelBy: "2027-03-01" } });
    expect(setBooking(b, "t:f1", {}).bookings).toBeUndefined();
    expect(cleanBookings({ "t:f1": { status: "x", cancelBy: "amanhã" }, "zz": { status: "done" } })).toBeUndefined();
  });

  it("filtra, mostra prazos e soma só o que não é pesquisa nem cancelado", () => {
    const a = trip({
      transports: [flight("f1", [leg({})]), flight("f2", [leg({ departDate: "2027-03-15", arriveDate: "2027-03-16" })])],
      expenses: [
        { id: "e1", title: "Ida", amount: 0, estimate: 3000, status: "planned", currency: "BRL", transportId: "f1" },
        { id: "e2", title: "Volta", amount: 2500, status: "paid", currency: "BRL", transportId: "f2" },
      ],
      bookings: { "t:f1": { status: "researching", cancelBy: "2027-03-05" }, "t:f2": { status: "confirmed", cancelBy: "2027-03-09" } },
    });
    const items = centralItems([a]);
    expect(filterCentral(items, { status: "confirmed" }).map((i) => i.id)).toEqual(["t:f2"]);
    expect(cancelSoon(items, "2027-03-01").map((i) => i.id)).toEqual(["t:f1", "t:f2"]);
    expect(moneySummary(items)).toEqual([{ currency: "BRL", planned: 2500, paid: 2500, pending: 0 }]);
  });
});

describe("alertas da linha do tempo", () => {
  it("acha transportes sobrepostos e conexões curtas", () => {
    const a = trip({
      transports: [flight("f1", [leg({})]), flight("f2", [leg({ from: { name: "Lisboa" }, to: { name: "Porto" }, departDate: "2027-03-11", departTime: "11:30", arriveDate: "2027-03-11", arriveTime: "12:30" })])],
    });
    const al = tripAlerts(a);
    expect(al.some((x) => x.title === "Conexão curta")).toBe(true);
    const b = trip({ transports: [flight("f1", [leg({})]), flight("f3", [leg({ departDate: "2027-03-11", departTime: "08:00", arriveDate: "2027-03-11", arriveTime: "09:00" })])] });
    expect(tripAlerts(b)[0].level).toBe("danger");
  });

  it("avisa carro retirado antes de o voo pousar, hotéis em conflito, noites sem hotel e atividade em voo", () => {
    const a = trip({
      transports: [flight("f1", [leg({})])],
      vehicles: [{ id: "c1", ownership: "rental", label: "Carro", rental: { pickupDate: "2027-03-11", pickupTime: "09:00" } }],
      stays: [
        { id: "h1", name: "A", address: "", city: "", start: "2027-03-11", end: "2027-03-14", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "" },
        { id: "h2", name: "B", address: "", city: "", start: "2027-03-13", end: "2027-03-14", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "" },
      ],
      activities: [{ id: "a1", title: "Museu", day: 2, time: "08:00", address: "", done: false, kind: "tour" }],
    });
    const titles = tripAlerts(a).map((x) => x.title);
    expect(titles).toContain("Retirada do carro durante o trajeto");
    expect(titles).toContain("Hospedagens com noites em comum");
    expect(titles).toContain("1 noite sem hospedagem"); // 14/03; a noite de 10/03 é no voo
    expect(titles).toContain("Atividade durante um trajeto");
  });

  it("lembra de reservas sem confirmação perto da data", () => {
    const a = trip({ transports: [flight("f1", [leg({})])] });
    const al = tripAlerts(a, centralItems([a]), Date.parse("2027-03-08T00:00:00Z"));
    expect(al.map((x) => x.title)).toContain("Reserva sem confirmação");
  });
});

describe("calendário .ics", () => {
  it("gera eventos válidos sem códigos de reserva", () => {
    const a = trip({
      transports: [flight("f1", [leg({ carrier: "TP", number: "88" })])],
      stays: [{ id: "h1", name: "Hotel, Alfama", address: "Rua X", city: "Lisboa", start: "2027-03-11", end: "2027-03-15", checkInTime: "15:00", checkOutTime: "11:00", url: "", confirmation: "ABC123", notes: "" }],
    });
    expect(tripEvents(a)).toHaveLength(2);
    const ics = tripIcs(a, new Date("2027-01-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270310T220000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270311");
    expect(ics).toContain("Hotel\\, Alfama");
    expect(ics).not.toContain("ABC123");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe("backup", () => {
  it("mantém a situação das reservas com os ids novos", async () => {
    const { parseBackup } = await import("../offline");
    const a = trip({ transports: [flight("f1", [leg({})])], bookings: { "t:f1": { status: "confirmed" }, "t:sumiu": { status: "done" } } });
    const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [a] }));
    const id = copy.transports![0].id;
    expect(copy.bookings).toEqual({ ["t:" + id]: { status: "confirmed" } });
  });
});

describe("lembretes", () => {
  it("oferece lembrete para o prazo de cancelamento grátis", async () => {
    const { candidates } = await import("../journey/reminders");
    const a = trip({ transports: [flight("f1", [leg({})])], bookings: { "t:f1": { status: "reserved", cancelBy: "2027-03-01" }, "t:sumiu": { cancelBy: "2027-03-02" } } });
    const c = candidates(a).filter((x) => x.kind === "cancel_deadline");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ refId: "t:f1", eventAt: Date.parse("2027-03-01T09:00:00Z") });
  });
});
