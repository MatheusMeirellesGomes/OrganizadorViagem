import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { carLinks, experienceLinks, flightLinks, hotelLinks } from "./links";
import { addOption, chooseOption, optionsOf } from "./options";
import { centralItems, moneySummary } from "../bookings/central";

const input = { origin: "GRU", destination: "LIS", start: "2027-03-10", end: "2027-03-20", adults: 2, children: 1 };

describe("links de busca", () => {
  it("preenche voos com aeroportos, datas e pessoas", () => {
    const l = flightLinks(input);
    expect(l.map((x) => x.id)).toEqual(["google", "skyscanner", "kayak"]);
    expect(l[1].url).toContain("/gru/lis/270310/270320/");
    expect(l[1].url).toContain("adultsv2=2");
    expect(l[2].url).toBe("https://www.kayak.com.br/flights/GRU-LIS/2027-03-10/2027-03-20/2adults/children-11");
    expect(new URL(l[0].url).searchParams.get("q")).toContain("de GRU");
  });
  it("sem códigos de aeroporto, deixa só o Google preenchido", () => {
    const l = flightLinks({ origin: "São Paulo", destination: "Lisboa" });
    expect(l[1].note).toBeTruthy();
  });
  it("hotéis, carros e passeios usam o destino e as datas", () => {
    const h = hotelLinks({ destination: "Lisboa", start: "2027-03-10", end: "2027-03-15", adults: 2 });
    expect(h[0].url).toContain("ss=Lisboa");
    expect(h[0].url).toContain("checkin=2027-03-10");
    expect(h[1].url).toContain("/s/Lisboa/homes?");
    expect(carLinks({ destination: "Lisboa", start: "2027-03-10", end: "2027-03-15" })[0].url).toBe("https://www.kayak.com.br/cars/Lisboa/2027-03-10/2027-03-15");
    expect(experienceLinks({ destination: "Lisboa" })[0].url).toContain("q=Lisboa");
  });
});

describe("opções para comparar", () => {
  it("salva como reserva em pesquisa, ordena pelo preço e não conta como gasto", () => {
    let t = newTrip({ title: "Lisboa" });
    t = addOption(t, "hotels", { title: "Hotel B", url: "https://b.example", price: 900, currency: "EUR" });
    t = addOption(t, "hotels", { title: "Hotel A", price: 700, currency: "eur" });
    t = addOption(t, "hotels", { title: "Hotel C" });
    expect(optionsOf(t, "hotels").map((o) => o.title)).toEqual(["Hotel A", "Hotel B", "Hotel C"]);
    expect(() => addOption(t, "hotels", { title: "hotel a" })).toThrow();
    expect(() => addOption(t, "hotels", { title: "X", url: "javascript:alert(1)" })).toThrow();
    expect(moneySummary(centralItems([t]))).toEqual([]);
    const a = optionsOf(t, "hotels")[0];
    t = chooseOption(t, a.id);
    expect(t.bookings?.["r:" + a.id]).toEqual({ status: "reserved", price: 700, currency: "EUR" });
    expect(t.reservations).toHaveLength(3);
  });
});
