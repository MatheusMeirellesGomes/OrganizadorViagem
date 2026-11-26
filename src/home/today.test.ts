import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { featuredTrip, nextActivity, tripMoment } from "./today";

const act = (id: string, day: number, time = "", done = false) => ({ id, title: id, day, time, address: "", done, kind: "tour" });

describe("visão geral", () => {
  const past = newTrip({ id: "p", start: "2026-01-01", end: "2026-01-05", status: "upcoming" });
  const later = newTrip({ id: "l", start: "2027-05-01", end: "2027-05-10", status: "upcoming" });
  const soon = newTrip({ id: "s", start: "2026-12-10", end: "2026-12-20", status: "upcoming" });
  const idea = newTrip({ id: "i", start: "", end: "", status: "planning" });

  it("destaca a viagem em andamento, senão a mais próxima", () => {
    expect(featuredTrip([later, soon, idea, past], "2026-11-25")?.id).toBe("s");
    expect(featuredTrip([later, soon], "2026-12-12")?.id).toBe("s");
    expect(featuredTrip([idea, past], "2026-11-25")?.id).toBe("i");
    expect(featuredTrip([past], "2026-11-25")).toBeUndefined();
  });

  it("conta os dias antes e durante", () => {
    expect(tripMoment(soon, "2026-11-25")).toEqual({ kind: "before", days: 15 });
    expect(tripMoment(soon, "2026-12-12")).toEqual({ kind: "during", day: 3, total: 11 });
    expect(tripMoment(idea, "2026-11-25")).toEqual({ kind: "undated" });
  });

  it("acha a próxima atividade sem repetir as que já passaram", () => {
    const t = { ...soon, activities: [act("a", 3, "08:00"), act("b", 3, "15:00"), act("c", 4), act("d", 3, "18:00", true)] };
    expect(nextActivity(t, "2026-12-12", "10:30")?.id).toBe("b");
    expect(nextActivity(t, "2026-12-12", "16:00")?.id).toBe("c");
    expect(nextActivity(t, "2026-11-25", "10:00")).toMatchObject({ id: "a", date: "2026-12-12" });
  });
});
