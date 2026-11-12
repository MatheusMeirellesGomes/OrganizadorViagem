import { describe, it, expect } from "vitest";
import { newTrip, type Trip } from "./model";
import { addNote, addPaidExpense, completeActivity, dayPanel, isFixed, localMinute, navigationLinks, postpone, replanOptions, reschedule, skipActivity, startActivity, timeline } from "./travel-day";

const trip = (): Trip =>
  newTrip({
    start: "2027-01-25",
    end: "2027-01-28",
    destination: "Madrid",
    timeZone: "Europe/Madrid",
    stays: [{ id: "h", name: "Hotel Madrid", address: "Gran Vía 1", city: "Madrid", start: "2027-01-25", end: "2027-01-29", checkInTime: "", checkOutTime: "", url: "", confirmation: "ABC123", notes: "", coordinates: { lat: 40.42, lng: -3.702 } }],
    activities: [
      { id: "p", title: "Palacio Real", day: 2, time: "10:00", address: "", done: false, kind: "Palácios", coordinates: { lat: 40.418, lng: -3.7142 } },
      { id: "m", title: "Prado", day: 2, time: "12:30", address: "", done: false, kind: "Museus", coordinates: { lat: 40.4138, lng: -3.6921 } },
      { id: "j", title: "Jantar reservado", day: 2, time: "14:00", address: "", done: false, kind: "Restaurante", coordinates: { lat: 40.415, lng: -3.706 } },
      { id: "r", title: "Retiro", day: 2, time: "16:00", address: "", done: false, kind: "Parques", coordinates: { lat: 40.4153, lng: -3.6844 } },
    ],
    reservations: [{ id: "res", title: "Mesa no Botín", details: "Código 99", url: "", activityId: "j" }],
    expenses: [{ id: "e", title: "Prado", amount: 15, currency: "EUR", status: "paid", activityId: "m" }],
  });

describe("painel do dia", () => {
  it("mostra cidade, hospedagem, próxima atividade, deslocamento estimado, reservas e gastos", () => {
    // 26/01/2027 09:00 em Madrid = 08:00 UTC
    const p = dayPanel(trip(), 2, "walking", new Date("2027-01-26T08:00:00Z"));
    expect(p).toMatchObject({ date: "2027-01-26", city: "Madrid", next: { id: "p" }, done: 0, total: 4 });
    expect(p.stay?.name).toBe("Hotel Madrid");
    expect(p.travel?.from).toBe("Hotel Madrid");
    expect(p.reservations.map((r) => r.id)).toEqual(["res"]);
    expect(p.expenses).toEqual([{ currency: "EUR", spent: 15, planned: 15 }]);
  });
  it("hora local é a do destino, não a do aparelho", () => {
    expect(localMinute(trip(), 2, new Date("2027-01-26T08:00:00Z"))).toBe(9 * 60);
    expect(localMinute(trip(), 3, new Date("2027-01-26T08:00:00Z"))).toBeUndefined();
  });
  it("depois de concluir, a próxima é a seguinte e o deslocamento parte dela", () => {
    let t = completeActivity(trip(), "p");
    const p = dayPanel(t, 2, "walking", new Date("2027-01-26T10:30:00Z"));
    expect(p.next?.id).toBe("m");
    expect(p.travel?.from).toBe("Palacio Real");
    t = startActivity(t, "m");
    expect(dayPanel(t, 2, "walking").current?.id).toBe("m");
  });
});

describe("ações com histórico", () => {
  it("iniciar, pular, adiar, reagendar e observar ficam registrados", () => {
    let t = startActivity(trip(), "p");
    t = skipActivity(t, "r");
    t = postpone(t, "m", 30);
    t = reschedule(t, "r", 3, "11:00");
    t = addNote(t, "p", "fila grande");
    const p = t.activities.find((a) => a.id === "p")!;
    expect(p.status).toBe("started");
    expect(p.notes).toBe("fila grande");
    expect(t.activities.find((a) => a.id === "m")!.time).toBe("13:00");
    const r = t.activities.find((a) => a.id === "r")!;
    expect([r.day, r.time, r.status]).toEqual([3, "11:00", "skipped"]);
    expect(r.history!.map((h) => [h.what, h.from, h.to])).toEqual([["skipped", undefined, undefined], ["rescheduled", "2 16:00", "3 11:00"]]);
    expect(() => postpone(t, "m", 12 * 60)).toThrow("meia-noite");
  });
  it("registrar gasto pago ligado à atividade", () => {
    const t = addPaidExpense(trip(), trip().activities[0], 19.9, "EUR");
    expect(t.expenses.at(-1)).toMatchObject({ amount: 19.9, status: "paid", activityId: "p", date: "2027-01-26" });
    expect(() => addPaidExpense(trip(), trip().activities[0], 0, "EUR")).toThrow();
  });
});

describe("navegação", () => {
  it("usa as coordenadas e o modo; Apple Maps não tem bicicleta", () => {
    const links = navigationLinks({ coordinates: { lat: 40.418, lng: -3.7142 }, address: "" }, "transit")!;
    expect(links.google).toContain("destination=40.418%2C-3.7142");
    expect(links.google).toContain("travelmode=transit");
    expect(links.apple).toContain("dirflg=r");
    expect(navigationLinks({ coordinates: { lat: 40, lng: -3 }, address: "" }, "bicycling")!.apple).toBeUndefined();
  });
});

describe("reorganização quando o dia atrasa", () => {
  it("nunca move a reserva fixa e mostra conflitos antes de aplicar", () => {
    const t = startActivity(trip(), "p");
    expect(isFixed(t, t.activities[2])).toBe(true);
    const options = replanOptions(t, 2, 60);
    expect(options.map((o) => o.key)).toEqual(["keep", "next", "shift", "move"]);
    const keep = options[0];
    expect(keep.trip).toBe(t);
    const shift = options.find((o) => o.key === "shift")!;
    expect(shift.trip.activities.find((a) => a.id === "j")!.time).toBe("14:00");
    expect(shift.changes.map((c) => [c.title, c.to])).toEqual([["Prado", "13:30"], ["Retiro", "17:00"]]);
    expect(shift.conflicts).toEqual([{ title: "Prado", fixed: "Jantar reservado", time: "14:00" }]);
    const move = options.find((o) => o.key === "move")!;
    expect(move.trip.activities.find((a) => a.id === "r")!.day).toBe(3);
    expect(timeline(t, 2).map((a) => a.id)).toEqual(["p", "m", "j", "r"]);
  });
});
