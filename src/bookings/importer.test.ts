import { describe, expect, it } from "vitest";
import { findDates, parseConfirmation } from "./importer";

describe("importar confirmação", () => {
  it("entende vários formatos de data", () => {
    expect(findDates("Ida: 10/03/2027 e volta 2027-03-20").map((d) => d.iso)).toEqual(["2027-03-10", "2027-03-20"]);
    expect(findDates("Sexta, 12 de março de 2027").map((d) => d.iso)).toEqual(["2027-03-12"]);
    expect(findDates("Fri, 12 Mar 2027").map((d) => d.iso)).toEqual(["2027-03-12"]);
    expect(findDates("March 12, 2027").map((d) => d.iso)).toEqual(["2027-03-12"]);
    expect(findDates("12 mar", 2028).map((d) => d.iso)).toEqual(["2028-03-12"]);
  });

  it("lê um voo com conexão", () => {
    const text = `Sua reserva está confirmada!
Localizador: XYZ123
Voo TP 88 - Sexta, 10 de março de 2027
São Paulo (GRU) 22:00 → Lisboa (LIS) 11:15
Voo TP 1944 - Sábado, 11 de março de 2027
Lisboa (LIS) 13:00 → Porto (OPO) 13:55
Total pago: R$ 6.432,90`;
    const r = parseConfirmation(text, 2027);
    expect(r.kind).toBe("flight");
    expect(r.legs).toEqual([
      { from: "GRU", to: "LIS", departDate: "2027-03-10", departTime: "22:00", arriveDate: "2027-03-11", arriveTime: "11:15", carrier: "TP", number: "88" },
      { from: "LIS", to: "OPO", departDate: "2027-03-11", departTime: "13:00", arriveDate: "2027-03-11", arriveTime: "13:55", carrier: "TP", number: "1944" },
    ]);
    expect(r.price).toEqual({ amount: 6432.9, currency: "BRL" });
    expect(r.codeFound).toBe(true);
    expect(JSON.stringify(r)).not.toContain("XYZ123");
  });

  it("lê uma hospedagem", () => {
    const text = `Booking confirmation
Hotel Alfama Lisboa
Address: Rua dos Remédios 10, Lisboa
Check-in: Fri, 12 Mar 2027 (from 15:00)
Check-out: Mon, 15 Mar 2027 (until 11:00)
Total price € 540.00`;
    const r = parseConfirmation(text, 2027);
    expect(r.kind).toBe("stay");
    expect(r.stay).toMatchObject({ name: "Hotel Alfama Lisboa", address: "Rua dos Remédios 10, Lisboa", start: "2027-03-12", end: "2027-03-15", checkInTime: "15:00", checkOutTime: "11:00" });
    expect(r.price).toEqual({ amount: 540, currency: "EUR" });
  });

  it("lê um aluguel de carro", () => {
    const text = `Aluguel de carro confirmado - Localiza
Retirada: 12/03/2027 às 10:00
Local de retirada: Aeroporto de Lisboa
Devolução: 15/03/2027 às 09:30
Valor total: € 210,50`;
    const r = parseConfirmation(text, 2027);
    expect(r.kind).toBe("car");
    expect(r.car).toMatchObject({ company: "Localiza", pickupDate: "2027-03-12", pickupTime: "10:00", dropoffDate: "2027-03-15", dropoffTime: "09:30", pickupPlace: "Aeroporto de Lisboa" });
    expect(r.price).toEqual({ amount: 210.5, currency: "EUR" });
  });

  it("não inventa quando não entende", () => {
    const r = parseConfirmation("Obrigado pela compra! Até breve.");
    expect(r.kind).toBe("unknown");
    expect(r.price).toBeUndefined();
  });
});

describe("aplicar importação", () => {
  it("cria o voo, marca como reservado e registra o valor previsto", async () => {
    const { applyImport } = await import("./importer");
    const { newTrip } = await import("../model");
    const { centralItems, moneySummary } = await import("./central");
    const t0 = newTrip({ title: "Portugal", start: "2027-03-10", end: "2027-03-20" });
    const data = parseConfirmation("Voo TP 88 - 10/03/2027\nGRU 22:00 → LIS 11:15\nTotal: R$ 3.000,00", 2027);
    const t = applyImport(t0, data, { expense: true });
    expect(t.transports).toHaveLength(1);
    expect(t.transports![0].legs[0]).toMatchObject({ from: { code: "GRU" }, to: { code: "LIS" }, carrier: "TP", number: "88" });
    const items = centralItems([t]);
    expect(items[0].status).toBe("reserved");
    expect(moneySummary(items)).toEqual([{ currency: "BRL", planned: 3000, paid: 0, pending: 3000 }]);
    const s = applyImport(t0, { kind: "stay", legs: [], stay: { name: "Hotel", start: "2027-03-11", end: "2027-03-15" }, codeFound: false });
    expect(s.stays).toHaveLength(1);
    expect(() => applyImport(t0, { kind: "unknown", legs: [], codeFound: false })).toThrow();
    expect(t0.transports ?? []).toHaveLength(0);
  });
});
