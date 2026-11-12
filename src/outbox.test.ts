import { describe, it, expect } from "vitest";
import { newTrip, type Trip } from "./model";
import { applyOps, diffOps, onlyQueueable } from "./outbox";
import { completeActivity, postpone, addPaidExpense, addNote } from "./travel-day";

const base = (): Trip =>
  newTrip({
    id: "t",
    activities: [
      { id: "a", title: "Palacio Real", day: 1, time: "10:00", address: "", done: false, kind: "Palácios" },
      { id: "b", title: "Prado", day: 1, time: "13:00", address: "", done: false, kind: "Museus" },
    ],
  });

describe("mudanças feitas sem internet", () => {
  it("vira operações e aplica sobre a versão mais nova da conta", () => {
    const before = base();
    let after = completeActivity(before, "a");
    after = postpone(after, "b", 30);
    after = addPaidExpense(after, after.activities[0], 20, "EUR");
    expect(onlyQueueable(before, after)).toBe(true);
    const ops = diffOps(before, after);
    // Outro aparelho mudou o título da viagem enquanto isso.
    const remote = { ...before, title: "Madrid 2027" };
    const r = applyOps(remote, ops);
    expect(r.conflicts).toEqual([]);
    expect(r.trip.title).toBe("Madrid 2027");
    expect(r.trip.activities[0].done).toBe(true);
    expect(r.trip.activities[1].time).toBe("13:30");
    expect(r.trip.expenses).toHaveLength(1);
    expect(applyOps(r.trip, ops).applied).toBe(0); // aplicar de novo não duplica
  });
  it("conflito: o outro aparelho mudou o mesmo campo ou apagou a atividade", () => {
    const before = base();
    const ops = diffOps(before, postpone(before, "b", 30));
    const changedRemotely = { ...before, activities: before.activities.map((a) => (a.id === "b" ? { ...a, time: "15:00" } : a)) };
    const r = applyOps(changedRemotely, ops);
    expect(r.trip.activities[1].time).toBe("15:00");
    expect(r.conflicts).toEqual([{ title: "Prado", field: "time", reason: "changed" }]);
    const removed = { ...before, activities: [before.activities[0]] };
    expect(applyOps(removed, ops).conflicts).toEqual([{ title: "Prado", reason: "removed" }]);
  });
  it("históricos dos dois aparelhos são somados; outras edições não entram na fila", () => {
    const before = base();
    const mine = diffOps(before, addNote(before, "a", "fila"));
    const theirs = { ...before, activities: before.activities.map((a) => (a.id === "a" ? { ...a, notes: "chuva", history: [{ at: "2027-01-01T00:00:00Z", what: "note" }] } : a)) };
    const r = applyOps(theirs, mine);
    expect(r.trip.activities[0].history).toHaveLength(2);
    expect(r.trip.activities[0].notes).toBe("chuva");
    expect(r.conflicts).toEqual([{ title: "Palacio Real", field: "notes", reason: "changed" }]);
    expect(onlyQueueable(before, { ...before, title: "Outro" })).toBe(false);
  });
});
