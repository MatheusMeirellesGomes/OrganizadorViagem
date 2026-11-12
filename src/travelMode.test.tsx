import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newTrip, type Activity, type Trip } from "./model";
import { TravelMode } from "./TravelMode";
import {
  calendarDate,
  dayActivities,
  dayLabel,
  dayProgress,
  hasTravelInformation,
  navigationUrl,
  nextActivity,
  safeExternalUrl,
  toggleVisited,
  travelDays,
} from "./travel-mode";
import { readLocal, saveLocal } from "./store";
import { offlineDocument, parseBackup } from "./offline";
const activity = (id: string, patch: Partial<Activity> = {}): Activity => ({
  id,
  title: `Passeio ${id}`,
  day: 1,
  time: "",
  address: "",
  done: false,
  kind: "Passeio",
  ...patch,
});
const render = (trip: Trip, day = 1, online = true) =>
  renderToStaticMarkup(
    <TravelMode
      trip={trip}
      day={day}
      onDayChange={() => {}}
      onBack={() => {}}
      onSave={async () => true}
      online={online}
      busy={false}
    />,
  );
afterEach(() => vi.unstubAllGlobals());
describe("Modo Viagem: dates and itinerary", () => {
  it("works with a completely empty trip and does not require classification or budget", () => {
    const trip = newTrip();
    expect(travelDays(trip)).toEqual([1, 2, 3]);
    const html = render(trip);
    expect(html).toContain("Modo Viagem");
    expect(html).toContain("Sem datas definidas");
    expect(html).toContain("Não há atividades neste dia");
    expect(html).not.toContain("Informações da viagem");
    expect(trip.budgetEnabled).toBe(false);
    expect(trip.status).toBe("planning");
  });
  it("includes every calendar day, including DST and leap days", () => {
    expect(
      travelDays(newTrip({ start: "2027-03-27", end: "2027-03-29" })),
    ).toEqual([1, 2, 3]);
    expect(dayLabel(newTrip({ start: "2028-02-28" }), 2).full).toContain(
      "29 de fevereiro",
    );
    expect(
      travelDays(newTrip({ start: "2027-01-22", end: "2027-02-03" })),
    ).toHaveLength(13);
  });
  it("handles invalid and reversed dates without an invalid date label", () => {
    expect(calendarDate("2027-02-30")).toBeUndefined();
    expect(calendarDate("invalid")).toBeUndefined();
    expect(dayLabel(newTrip({ start: "invalid" }), 1).short).toBe("Dia 1");
    expect(
      travelDays(newTrip({ start: "2027-02-03", end: "2027-01-22" })),
    ).toHaveLength(3);
  });
  it("preserves selected days and activities beyond the trip dates", () => {
    const trip = newTrip({
      start: "2027-01-01",
      end: "2027-01-02",
      activities: [activity("late", { day: 5 })],
    });
    expect(travelDays(trip, 6)).toHaveLength(6);
    expect(dayActivities(trip, 5)[0].id).toBe("late");
  });
  it("selects a day without sorting, filtering out untimed activities or inventing times", () => {
    const trip = newTrip({
      activities: [
        activity("b", { time: "17:00" }),
        activity("other", { day: 2 }),
        activity("a", { time: "08:00" }),
        activity("untimed"),
      ],
    });
    expect(dayActivities(trip, 1).map((a) => a.id)).toEqual([
      "b",
      "a",
      "untimed",
    ]);
    expect(nextActivity(trip, 1)?.id).toBe("b");
    const html = render(trip);
    expect(html).toContain("Sem horário");
    // The timeline keeps the person's order (the day panel above may highlight by time).
    const timeline = html.slice(html.indexOf('class="tm-timeline"'));
    expect(timeline.indexOf("Passeio b")).toBeLessThan(timeline.indexOf("Passeio a"));
    expect(html).not.toContain("em 10 minutos");
    expect(html).not.toContain("Hoje");
  });
  it("highlights the selected day and limits the timeline to that day", () => {
    const trip = newTrip({
      activities: [activity("one"), activity("two", { day: 2 })],
    });
    const html = render(trip, 2);
    expect(html).toContain('aria-pressed="true" aria-label="Dia 2: Dia 2"');
    expect(html).toContain("Passeio two");
    expect(html).not.toContain("Passeio one");
  });
  it("falls back to the next unvisited item in the original order and reports completion", () => {
    const trip = newTrip({
      activities: [activity("a", { done: true }), activity("b")],
    });
    expect(nextActivity(trip, 1)?.id).toBe("b");
    const done = toggleVisited(trip, "b");
    expect(nextActivity(done, 1)).toBeUndefined();
    expect(dayProgress(done, 1)).toEqual({ total: 2, done: 2 });
    expect(render(done)).toContain(
      "Todas as atividades estão marcadas como visitadas",
    );
  });
  it.each(["national", "international", "undecided"] as const)(
    "works for %s trips regardless of status",
    (scope) => {
      const trip = newTrip({
        scope,
        status: "past",
        activities: [activity("a")],
      });
      expect(render(trip)).toContain("Passeio a");
      expect(trip.status).toBe("past");
    },
  );
});
describe("Modo Viagem: shared persistence and backups", () => {
  it("marks and unmarks the original activity without changing order, IDs or trip status", () => {
    const trip = newTrip({ activities: [activity("a"), activity("b")] });
    const marked = toggleVisited(trip, "a");
    expect(marked.id).toBe(trip.id);
    expect(marked.status).toBe(trip.status);
    expect(marked.activities.map((a) => a.id)).toEqual(["a", "b"]);
    expect(dayActivities(marked, 1)[0].done).toBe(true);
    expect(trip.activities[0].done).toBe(false);
    expect(toggleVisited(marked, "a").activities).toEqual(trip.activities);
  });
  it("persists offline changes through the same store and reflects them after reload", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    vi.stubGlobal("navigator", { onLine: false });
    const trip = newTrip({ activities: [activity("a")] });
    saveLocal([toggleVisited(trip, "a")]);
    const reloaded = readLocal();
    expect(reloaded).toHaveLength(1);
    expect(dayActivities(reloaded[0], 1)[0].done).toBe(true);
    saveLocal([toggleVisited(reloaded[0], "a")]);
    expect(readLocal()[0].activities[0].done).toBe(false);
  });
  it("keeps backup and HTML offline export compatible after marking a visit", () => {
    const marked = toggleVisited(
      newTrip({ cover: "waterfall", activities: [activity("a")] }),
      "a",
    );
    const [restored] = parseBackup(
      JSON.stringify({ version: 1, trips: [marked] }),
    );
    expect(restored.cover).toBe("waterfall");
    expect(restored.activities[0].done).toBe(true);
    expect(offlineDocument(restored)).toContain("✓ Passeio a");
  });
});
describe("Modo Viagem: incomplete data, links and offline UX", () => {
  it("does not create navigation without an address, even if the trip has coordinates", () => {
    const trip = newTrip({
      coordinates: { lat: 0, lng: 0 },
      activities: [activity("a")],
    });
    expect(navigationUrl(trip.activities[0])).toBeUndefined();
    expect(render(trip)).not.toContain("Como chegar");
    expect(render(trip)).toContain("ainda não tem endereço");
  });
  it("encodes the destination, omits an invented origin and only accepts http links", () => {
    expect(navigationUrl(activity("a", { address: "Rua A & B, 12" }))).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Rua%20A%20%26%20B%2C%2012",
    );
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("https://example.com")).toBe("https://example.com/");
  });
  it("explains offline limitations and disables external map/reservation links", () => {
    const trip = newTrip({
      activities: [activity("a", { address: "Rua A" })],
      reservations: [
        {
          id: "r",
          title: "Hotel",
          details: "Código",
          url: "https://example.com",
        },
      ],
    });
    const html = render(trip, 1, false);
    expect(html).toContain("Sem conexão");
    expect(html).toContain("precisa de internet");
    expect(html).not.toContain('href="https://');
    expect(html).toContain("Marcar visita");
  });
  it("shows only populated travel information and does not invent reservation associations", () => {
    const trip = newTrip({
      hotel: "Pousada · Rua A, 12",
      notes: "Levar documento",
      reservations: [{ id: "r", title: "Museu", details: "Voucher", url: "" }],
      checklist: [{ id: "c", title: "Documentos", done: false }],
    });
    expect(hasTravelInformation(trip)).toBe(true);
    const html = render(trip);
    expect(html).toContain("Copiar hospedagem");
    expect(html).toContain("Reservas gerais, sem vínculo automático");
    expect(html).not.toContain("Abrir reserva");
    expect(html).toContain("Documentos");
    expect(hasTravelInformation(newTrip())).toBe(false);
  });
  it("renders semantic keyboard controls, progress and live action feedback", () => {
    const html = render(newTrip({ activities: [activity("a")] }));
    expect(html).toContain('aria-label="Dias da viagem"');
    expect(html).toContain("<progress");
    expect(html).toContain("<summary>Ver detalhes");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-pressed="false"');
  });
});
