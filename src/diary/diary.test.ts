import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { removeEntry, retrospective, saveEntry, sortedJournal, toggleHighlight } from "./diary";
import { parseBackup } from "../offline";

const photo = (id: string) => ({ id, url: "data:image/png;base64,iVBORw0KGgo=", name: id + ".png" });

describe("diário de viagem", () => {
  it("salva, edita, destaca e remove registros", () => {
    let t = newTrip({ title: "Lisboa", start: "2027-03-10", end: "2027-03-14", photos: [photo("p1")] });
    t = saveEntry(t, { date: "2027-03-11", text: "Pastéis de Belém!", mood: "amazing", photoIds: ["p1", "nao-existe"] });
    t = saveEntry(t, { date: "2027-03-10", title: "Chegada", text: "" });
    expect(sortedJournal(t).map((e) => e.title ?? e.text)).toEqual(["Chegada", "Pastéis de Belém!"]);
    const id = sortedJournal(t)[1].id;
    expect(sortedJournal(t)[1].photoIds).toEqual(["p1"]);
    t = saveEntry(t, { id, date: "2027-03-11", text: "Pastéis de Belém, de novo" });
    expect(t.journal).toHaveLength(2);
    expect(t.journal!.find((e) => e.id === id)?.updatedAt).toBeTruthy();
    t = toggleHighlight(t, id);
    expect(retrospective(t).highlights.map((e) => e.id)).toEqual([id]);
    expect(() => saveEntry(t, { date: "ontem", text: "x" })).toThrow();
    t = removeEntry(removeEntry(t, id), sortedJournal(t)[0].id);
    expect(t.journal).toBeUndefined();
  });

  it("monta a retrospectiva só com o que foi registrado", () => {
    const t = newTrip({
      title: "Portugal",
      destination: "Lisboa, Portugal",
      start: "2027-03-10",
      end: "2027-03-14",
      activities: [
        { id: "a", title: "A", day: 2, time: "", address: "", done: true, kind: "tour" },
        { id: "b", title: "B", day: 2, time: "", address: "", done: true, kind: "tour" },
        { id: "c", title: "C", day: 3, time: "", address: "", done: false, kind: "tour" },
      ],
      expenses: [
        { id: "e1", title: "x", amount: 100, currency: "EUR", status: "paid" },
        { id: "e2", title: "y", amount: 0, estimate: 500, currency: "EUR", status: "planned" },
      ],
    });
    const r = retrospective(saveEntry(t, { date: "2027-03-11", text: "ótimo", mood: "good" }));
    expect(r).toMatchObject({ days: 5, places: 2, entries: 1, countries: ["PT"], spent: [{ currency: "EUR", amount: 100 }], busiestDay: { day: 2, count: 2 } });
    expect(r.moods).toEqual([{ mood: "good", count: 1 }]);
  });

  it("entra no backup com as fotos religadas", () => {
    let t = newTrip({ title: "Lisboa", photos: [photo("p1")] });
    t = saveEntry(t, { date: "2027-03-11", text: "oi", photoIds: ["p1"], highlight: true });
    const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [t] }));
    expect(copy.journal).toHaveLength(1);
    expect(copy.journal![0].photoIds).toEqual([copy.photos[0].id]);
    expect(copy.journal![0].highlight).toBe(true);
  });
});
