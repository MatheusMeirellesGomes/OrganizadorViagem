import { describe, it, expect } from "vitest";
import { allocate, balances, converted, paidMinor, plannedMinor, shares, suggestTransfers, summarize, toMinor, decimals, type Expense } from "./budget";

const people = ["ana", "bia", "caio", "duda", "edu"];
const x = (over: Partial<Expense>): Expense => ({ id: Math.random().toString(), title: "x", amount: 0, currency: "BRL", ...over });

describe("valores em centavos", () => {
  it("respeita casas decimais de cada moeda", () => {
    expect(decimals("BRL")).toBe(2);
    expect(decimals("JPY")).toBe(0);
    expect(toMinor(0.1 + 0.2, "EUR")).toBe(30);
    expect(toMinor(1500, "JPY")).toBe(1500);
  });
  it("divide sem perder ou criar centavos", () => {
    expect(allocate(1000, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }])).toEqual({ a: 334, b: 333, c: 333 });
    const r = allocate(200000, people.map((id) => ({ id, weight: 1 })));
    expect(Object.values(r)).toEqual([40000, 40000, 40000, 40000, 40000]);
  });
});

describe("planejado versus realizado", () => {
  it("previsto não conta como gasto; despesas antigas sem status contam como pagas", () => {
    expect(paidMinor(x({ amount: 0, estimate: 2000, status: "planned" }))).toBe(0);
    expect(plannedMinor(x({ amount: 0, estimate: 2000, status: "planned" }))).toBe(200000);
    expect(paidMinor(x({ amount: 50 }))).toBe(5000);
    expect(plannedMinor(x({ amount: 50, status: "cancelled" }))).toBe(0);
    expect(paidMinor(x({ amount: 300, estimate: 1000, status: "partial" }))).toBe(30000);
  });
});

describe("divisão e acerto de contas", () => {
  it("hospedagem de R$ 2.000 entre 5 pessoas: R$ 400 cada, pagador não é participante obrigatório", () => {
    const hotel = x({ title: "Hospedagem Madrid", amount: 2000, status: "paid", payerId: "ana", split: { mode: "equal", participants: people } });
    expect(shares(hotel, 200000, people)).toEqual({ ana: 40000, bia: 40000, caio: 40000, duda: 40000, edu: 40000 });
    const b = balances([hotel], [], people, "BRL");
    expect(b.find((p) => p.id === "ana")).toMatchObject({ paid: 200000, owes: 40000, balance: 160000 });
    const t = suggestTransfers(b);
    expect(t).toHaveLength(4);
    expect(t.every((s) => s.to === "ana" && s.amount === 40000)).toBe(true);
  });
  it("por casal (pesos), porcentagem e valores exatos", () => {
    const couple = shares(x({ amount: 300, split: { mode: "shares", participants: ["ana", "bia", "caio"], values: { ana: 2, bia: 1, caio: 0 } } }), 30000, people);
    expect(couple).toEqual({ ana: 20000, bia: 10000, caio: 0 });
    expect(shares(x({ split: { mode: "percent", participants: ["ana", "bia"], values: { ana: 70, bia: 30 } } }), 10001, people)).toEqual({ ana: 7001, bia: 3000 });
    expect(() => shares(x({ split: { mode: "percent", participants: ["ana"], values: { ana: 50 } } }), 100, people)).toThrow("100%");
    expect(shares(x({ split: { mode: "amounts", participants: ["ana", "bia"], values: { ana: 12.5, bia: 7.5 } } }), 2000, people)).toEqual({ ana: 1250, bia: 750 });
    expect(() => shares(x({ split: { mode: "amounts", participants: ["ana"], values: { ana: 1 } } }), 2000, people)).toThrow("não bate");
  });
  it("dois carros alugados são despesas separadas e reembolsos feitos entram no saldo", () => {
    const carros = [
      x({ title: "Carro 1", amount: 600, status: "paid", payerId: "bia", category: "car_rental", split: { mode: "equal", participants: ["ana", "bia", "caio"] } }),
      x({ title: "Carro 2", amount: 450, status: "paid", payerId: "duda", category: "car_rental", split: { mode: "equal", participants: ["duda", "edu", "caio"] } }),
    ];
    let b = balances(carros, [], people, "BRL");
    expect(b.reduce((s, p) => s + p.balance, 0)).toBe(0);
    expect(b.find((p) => p.id === "caio")!.owes).toBe(20000 + 15000);
    b = balances(carros, [{ id: "s", from: "caio", to: "bia", amount: 200, currency: "BRL", date: "2027-01-30", done: true }], people, "BRL");
    expect(b.find((p) => p.id === "caio")!.balance).toBe(-15000);
    expect(suggestTransfers(b).reduce((s, t) => s + t.amount, 0)).toBe(15000 + 20000 + 15000);
  });
});

describe("moedas", () => {
  it("só converte com taxa registrada e mantém o valor original", () => {
    const eur = x({ amount: 10, currency: "EUR", conversion: { currency: "BRL", rate: 6.1234, date: "2027-01-25", source: "BCE" } });
    expect(converted(1000, eur, "BRL")).toBe(6123);
    expect(converted(1000, x({ amount: 10, currency: "USD" }), "BRL")).toBeUndefined();
    const s = summarize([eur, x({ amount: 10, currency: "USD" }), x({ amount: 100, status: "planned", estimate: 100, category: "food" })], "BRL", { budget: { amount: 1000, currency: "BRL" } });
    expect(s.spent).toBe(6123);
    expect(s.planned).toBe(6123 + 10000);
    expect(s.unconverted).toHaveLength(1);
    expect(s.available).toBe(100000 - 6123);
  });
});
