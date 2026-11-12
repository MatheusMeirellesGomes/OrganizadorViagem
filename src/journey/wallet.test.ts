import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { saveTransport } from "./transport";
import { saveVehicle } from "./vehicles";
import { countByCategory, filterWallet, organizeDocument, reservationCategory, walletItems } from "./wallet";

const trip = () => {
  let t = newTrip({ start: "2027-01-23", end: "2027-02-02" });
  t = saveTransport(t, { id: "f1", kind: "flight", hasSecret: true, legs: [{ id: "l", from: { name: "Confins" }, to: { name: "Lisboa" }, departDate: "2027-01-23", departTime: "", arriveDate: "", arriveTime: "", carrier: "Companhia Teste", number: "XX 88" }] });
  t = saveVehicle(t, { id: "A", ownership: "rental", label: "Carro A", rental: { company: "Locadora Teste", pickupDate: "2027-01-24" } });
  t.stays = [{ id: "s", name: "Hotel Madrid (teste)", address: "", city: "Madrid", start: "2027-01-25", end: "2027-01-29", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "" }];
  t.activities = [{ id: "a", title: "Jantar", day: 3, time: "20:00", address: "", done: false, kind: "Restaurante", meal: "dinner" }];
  t.reservations = [
    { id: "r1", title: "Restaurante (teste)", details: "", url: "https://exemplo.com", activityId: "a" },
    { id: "r2", title: "Seguro viagem", details: "apólice", url: "" },
    { id: "r3", title: "Museu", details: "", url: "", category: "entries" },
  ];
  t.documents = [{ id: "d1", name: "eticket.pdf", mime: "application/pdf", size: 1000, url: "data:", transportId: "f1" }, { id: "d2", name: "recibo.jpg", mime: "image/jpeg", size: 10, url: "data:", category: "receipts", day: 2 }];
  return t;
};

describe("carteira", () => {
  it("reúne passagens, hotel, locação, reservas e arquivos sem copiar registros", () => {
    const items = walletItems(trip());
    expect(items.map((i) => i.id)).toEqual(["t:f1", "v:A", "d:d2", "s:s", "r:r1", "r:r2", "r:r3", "d:d1"]);
    expect(items.map((i) => i.category)).toEqual(["tickets", "rentals", "receipts", "hotels", "restaurants", "insurance", "entries", "tickets"]);
    expect(items[0]).toMatchObject({ source: "transport", hasSecret: true, documentIds: ["d1"] });
    expect(countByCategory(items)).toMatchObject({ tickets: 2, hotels: 1, rentals: 1, receipts: 1, restaurants: 1, insurance: 1, entries: 1, other: 0 });
  });
  it("busca sem acento, filtra por categoria, data e só arquivos", () => {
    const items = walletItems(trip());
    expect(filterWallet(items, { q: "companhia" }).map((i) => i.id)).toEqual(["t:f1"]);
    expect(filterWallet(items, { q: "MUSEU" })).toHaveLength(1);
    expect(filterWallet(items, { q: "recibo", category: "receipts" })).toHaveLength(1);
    expect(filterWallet(items, { date: "2027-01-25" }).map((i) => i.id)).toEqual(["s:s", "r:r1"]);
    expect(filterWallet(items, { onlyFiles: true })).toHaveLength(2);
  });
  it("organiza o arquivo e ignora vínculos inexistentes", () => {
    const t = organizeDocument(trip(), "d2", { category: "hotels", day: 3, stayId: "s", vehicleId: "nao-existe" });
    expect(t.documents![1]).toMatchObject({ category: "hotels", day: 3, stayId: "s", vehicleId: undefined });
    expect(() => organizeDocument(trip(), "x", {})).toThrow();
  });
  it("deduz a categoria de reservas antigas", () => {
    const t = trip();
    expect(reservationCategory(t, { id: "x", title: "Voo para Lisboa", details: "", url: "" })).toBe("tickets");
    expect(reservationCategory(t, { id: "x", title: "Hotel em Segóvia", details: "", url: "" })).toBe("hotels");
    expect(reservationCategory(t, { id: "x", title: "Algo", details: "", url: "" })).toBe("other");
  });
});
