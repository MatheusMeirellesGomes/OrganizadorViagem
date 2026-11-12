import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { saveTransport } from "./transport";
import { saveVehicle } from "./vehicles";
import { addReminder, candidates, cleanReminders, dueReminders, remindAt, setReminderDone, upcomingReminders } from "./reminders";
import { addItem, cleanPacking, progress, reuseFrom, suggestions, updateItem } from "./packing";
import { cleanPrep, relevantPrep, setPrep } from "./prep";
import { toInstant } from "./time";

const trip = () => {
  let t = newTrip({ start: "2027-01-23", end: "2027-02-02", scope: "international", timeZone: "Europe/Lisbon", participants: [{ id: "p0", name: "Ana" }, { id: "p1", name: "Bia" }] });
  t = saveTransport(t, { id: "f1", kind: "flight", flight: { checkInDate: "2027-01-22", checkInTime: "14:10", checkInStatus: "unknown" }, legs: [{ id: "l", from: { name: "Confins" }, to: { name: "Lisboa" }, departDate: "2027-01-23", departTime: "14:10", departZone: "America/Sao_Paulo", arriveDate: "2027-01-24", arriveTime: "07:05", arriveZone: "Europe/Lisbon" }] });
  t = saveVehicle(t, { id: "A", ownership: "rental", label: "Carro A", rental: { pickupDate: "2027-01-24", pickupTime: "10:00", countries: "Portugal, Espanha" } });
  t.stays = [{ id: "s", name: "Hotel Madrid (teste)", address: "", city: "Madrid", start: "2027-01-25", end: "2027-01-29", checkInTime: "16:00", checkOutTime: "11:00", url: "", confirmation: "", notes: "" }];
  return t;
};

describe("lembretes", () => {
  it("lista só eventos com data informada e no fuso certo", () => {
    const c = candidates(trip());
    expect(c.map((x) => x.kind)).toEqual(["flight_checkin", "boarding", "car_pickup", "hotel_checkin", "hotel_checkout"]);
    expect(c[1].eventAt).toBe(toInstant("2027-01-23", "14:10", "America/Sao_Paulo"));
  });
  it("cria com antecedência escolhida, sem duplicar, e avisa quando chega a hora", () => {
    const c = candidates(trip())[1];
    let t = addReminder(trip(), c, 180);
    t = addReminder(t, c, 180);
    expect(t.reminders).toHaveLength(1);
    const r = t.reminders![0];
    expect(remindAt(r)).toBe(c.eventAt - 3 * 3600_000);
    expect(dueReminders(t, remindAt(r) - 1)).toHaveLength(0);
    expect(upcomingReminders(t, remindAt(r) - 1)).toHaveLength(1);
    expect(dueReminders(t, remindAt(r))).toHaveLength(1);
    t = setReminderDone(t, r.id);
    expect(dueReminders(t, remindAt(r) + 1)).toHaveLength(0);
    expect(() => addReminder(trip(), c, -5)).toThrow();
  });
  it("lê lembretes de backup descartando inválidos", () => {
    expect(cleanReminders([{ kind: "boarding", eventAt: 1, before: 60, title: "x" }, { kind: "hack", eventAt: 1, before: 0 }, null])).toHaveLength(1);
  });
});

describe("bagagem", () => {
  it("sugere pela duração, escopo e transportes, sem repetir o que já existe", () => {
    const s = suggestions(trip());
    const titles = s.map((x) => x.title);
    expect(s.find((x) => x.title === "Camisetas")?.qty).toBe(7);
    expect(titles).toEqual(expect.arrayContaining(["Passaporte", "Adaptador de tomada", "Saco transparente para líquidos", "Carteira de motorista"]));
    expect(s.some((x) => /chuva|frio|calor/i.test(x.title))).toBe(false);
    const t = addItem(trip(), { title: "passaporte", category: "documents", qty: 1 });
    expect(suggestions(t).some((x) => x.title === "Passaporte")).toBe(false);
  });
  it("lista por viajante, marca preparado e reutiliza de outra viagem", () => {
    let t = addItem(trip(), { title: "Tênis", category: "shoes", qty: 1, travelerId: "p0" });
    t = addItem(t, { title: "Câmera", category: "electronics", qty: 1, list: "Mala de mão" });
    t = updateItem(t, t.packing![0].id, { packed: true });
    expect(progress(t.packing!)).toEqual({ done: 1, total: 2, pct: 50 });
    const other = { ...trip(), id: "x", participants: [{ id: "p0", name: "Ana" }] };
    const reused = reuseFrom(other, t);
    expect(reused.packing!.map((x) => [x.title, x.packed, x.travelerId ?? ""])).toEqual([["Tênis", false, "p0"], ["Câmera", false, ""]]);
    expect(reuseFrom(reused, t).packing).toHaveLength(2);
    expect(cleanPacking([{ title: "  ", qty: 5 }, { title: "Meias", qty: 400, category: "x" }])).toEqual([expect.objectContaining({ title: "Meias", qty: 99, category: "other" })]);
  });
});

describe("preparação internacional", () => {
  it("mostra itens de carro e fronteira só quando fazem sentido", () => {
    expect(relevantPrep(trip())).toEqual(expect.arrayContaining(["passport", "license", "idp", "rentalRules", "border"]));
    expect(relevantPrep(newTrip())).not.toContain("license");
  });
  it("guarda situação, fonte oficial e data, recusando links inválidos e números de documento", () => {
    const t = setPrep(trip(), "visa", { status: "ok", source: "https://exemplo.gov/visto", checkedAt: "2026-11-12" });
    expect(t.prep!.visa).toEqual({ status: "ok", source: "https://exemplo.gov/visto", checkedAt: "2026-11-12", note: undefined });
    expect(() => setPrep(trip(), "visa", { status: "ok", source: "javascript:alert(1)" })).toThrow("https://");
    expect(() => setPrep(trip(), "passport", { status: "ok", note: "passaporte FX123456" })).toThrow("números de documentos");
    expect(cleanPrep({ visa: { status: "ok" }, hack: { status: "ok" }, passport: { status: "x" } })).toEqual({ visa: { status: "ok", source: undefined, checkedAt: undefined, note: undefined } });
  });
});
