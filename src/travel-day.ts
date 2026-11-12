import type { Activity, Trip, Stay } from "./model";
import { validPoint, type Point } from "./places";
import { staysOnDate } from "./stays";
import { dateOfDay, estimateTravel, toClock, toMinutes, type Mode } from "./planner";
import { paidMinor, plannedMinor, toMajor, type Expense } from "./budget";
import { uid } from "./model";

/*
 * Travel Mode day logic (Fase 5): the day panel, activity actions with a
 * history of important changes, navigation links and re-planning when the
 * day runs late. Activities linked to a booking are fixed and are never moved
 * automatically. Every proposal is shown before anything is saved.
 */

export const isFixed = (trip: Trip, a: Activity) => trip.reservations.some((r) => r.activityId === a.id);

/** Day activities in clock order (activities without time keep their place at the end). */
export function timeline(trip: Trip, day: number): Activity[] {
  const items = trip.activities.filter((a) => a.day === day);
  const timed = items.filter((a) => toMinutes(a.time) !== undefined).sort((a, b) => toMinutes(a.time)! - toMinutes(b.time)!);
  return [...timed, ...items.filter((a) => toMinutes(a.time) === undefined)];
}

export const pending = (a: Activity) => !a.done && a.status !== "skipped";

export type DayPanel = {
  date?: string;
  city?: string;
  stay?: Stay;
  current?: Activity;
  next?: Activity;
  travel?: { minutes: number; km: number; mode: Mode; from: string };
  reservations: Trip["reservations"];
  expenses: { currency: string; spent: number; planned: number }[];
  done: number;
  total: number;
};

/** Minute of the day at the destination, if it is that day there (time zone of the trip). */
export function localMinute(trip: Trip, day: number, now: Date): number | undefined {
  const date = dateOfDay(trip, day);
  if (!date) return;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: trip.timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (`${get("year")}-${get("month")}-${get("day")}` !== date) return;
    return Number(get("hour")) * 60 + Number(get("minute"));
  } catch {
    return;
  }
}

export function dayPanel(trip: Trip, day: number, mode: Mode, now = new Date()): DayPanel {
  const date = dateOfDay(trip, day);
  const stay = date ? staysOnDate(trip, date)[0] : undefined;
  const list = timeline(trip, day);
  const current = list.find((a) => a.status === "started" && !a.done);
  const minute = localMinute(trip, day, now);
  const open = list.filter((a) => pending(a) && a !== current);
  // Today: the first pending activity from now on (or the earliest pending one).
  const next = minute !== undefined ? open.find((a) => (toMinutes(a.time) ?? Infinity) >= minute - 15) ?? open[0] : open[0];
  let travel: DayPanel["travel"];
  if (next?.coordinates && validPoint(next.coordinates)) {
    const before = [...list.slice(0, list.indexOf(next))].reverse().find((a) => a.coordinates && validPoint(a.coordinates) && (a.done || a.status === "started"));
    const from: { point: Point; name: string } | undefined = before
      ? { point: before.coordinates!, name: before.title }
      : stay?.coordinates
        ? { point: stay.coordinates, name: stay.name }
        : undefined;
    if (from) {
      const t = estimateTravel(from.point, next.coordinates, mode);
      travel = { ...t, from: from.name };
    }
  }
  const ids = new Set(list.map((a) => a.id));
  const reservations = trip.reservations.filter((r) => (r.activityId && ids.has(r.activityId)) || (r.stayId && r.stayId === stay?.id));
  const byCurrency = new Map<string, { spent: number; planned: number }>();
  for (const x of trip.expenses) {
    if (!(x.day === day || (date && x.date === date) || (x.activityId && ids.has(x.activityId)))) continue;
    const c = byCurrency.get(x.currency) ?? { spent: 0, planned: 0 };
    c.spent += paidMinor(x);
    c.planned += plannedMinor(x);
    byCurrency.set(x.currency, c);
  }
  return {
    date,
    city: stay?.city || trip.destination || undefined,
    stay,
    current,
    next,
    travel,
    reservations,
    expenses: [...byCurrency].map(([currency, v]) => ({ currency, spent: toMajor(v.spent, currency), planned: toMajor(v.planned, currency) })),
    done: list.filter((a) => a.done).length,
    total: list.length,
  };
}

export type HistoryKind = "started" | "done" | "skipped" | "resumed" | "postponed" | "rescheduled" | "note";
const stamp = (a: Activity, what: HistoryKind, from?: string, to?: string): Activity => ({
  ...a,
  history: [...(a.history ?? []), { at: new Date().toISOString(), what, ...(from !== undefined ? { from, to } : {}) }].slice(-50),
});
const update = (trip: Trip, id: string, f: (a: Activity) => Activity): Trip => {
  if (!trip.activities.some((a) => a.id === id)) throw new Error("Atividade não encontrada.");
  return { ...trip, activities: trip.activities.map((a) => (a.id === id ? f(a) : a)) };
};

export const startActivity = (trip: Trip, id: string) =>
  update(trip, id, (a) => stamp({ ...a, status: "started", done: false }, "started"));
export const completeActivity = (trip: Trip, id: string) =>
  update(trip, id, (a) => stamp({ ...a, status: undefined, done: true }, "done"));
export const skipActivity = (trip: Trip, id: string) =>
  update(trip, id, (a) => stamp({ ...a, status: "skipped", done: false }, "skipped"));
export const resumeActivity = (trip: Trip, id: string) =>
  update(trip, id, (a) => stamp({ ...a, status: undefined, done: false }, "resumed"));

export function postpone(trip: Trip, id: string, minutes: number): Trip {
  return update(trip, id, (a) => {
    const t = toMinutes(a.time);
    if (t === undefined) throw new Error("Esta atividade não tem horário para adiar.");
    const next = t + minutes;
    if (next >= 24 * 60) throw new Error("O novo horário passaria da meia-noite. Use Reagendar.");
    return stamp({ ...a, time: toClock(next) }, "postponed", a.time, toClock(next));
  });
}

export function reschedule(trip: Trip, id: string, day: number, time: string): Trip {
  if (!Number.isInteger(day) || day < 1 || day > 3660) throw new Error("Escolha um dia válido.");
  if (time && toMinutes(time) === undefined) throw new Error("Horário inválido.");
  return update(trip, id, (a) => stamp({ ...a, day, time }, "rescheduled", `${a.day} ${a.time}`.trim(), `${day} ${time}`.trim()));
}

export function addNote(trip: Trip, id: string, note: string): Trip {
  const text = note.trim().slice(0, 500);
  if (!text) throw new Error("Escreva a observação.");
  return update(trip, id, (a) => stamp({ ...a, notes: a.notes ? `${a.notes}\n${text}`.slice(-1000) : text }, "note"));
}

export function addPaidExpense(trip: Trip, activity: Activity, amount: number, currency: string): Trip {
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero.");
  const x: Expense = {
    id: uid(),
    title: activity.title,
    amount: Math.round(amount * 100) / 100,
    currency,
    status: "paid",
    category: activity.meal ? "food" : "tickets",
    day: activity.day,
    date: dateOfDay(trip, activity.day),
    activityId: activity.id,
  };
  return { ...trip, expenses: [...trip.expenses, x] };
}

export type NavMode = "walking" | "driving" | "transit" | "bicycling";
/** Links to Google Maps and Apple Maps with the exact coordinates. Apple Maps has no cycling links. */
export function navigationLinks(target: Pick<Activity, "coordinates" | "address">, mode: NavMode) {
  const point = target.coordinates && validPoint(target.coordinates) ? `${target.coordinates.lat},${target.coordinates.lng}` : target.address?.trim();
  if (!point) return;
  const google = "https://www.google.com/maps/dir/?" + new URLSearchParams({ api: "1", destination: point, travelmode: mode });
  const flag = { walking: "w", driving: "d", transit: "r" } as Record<string, string>;
  const apple = flag[mode] ? "https://maps.apple.com/?" + new URLSearchParams({ daddr: point, dirflg: flag[mode] }) : undefined;
  return { google, apple };
}

export type Proposal = {
  key: "keep" | "next" | "shift" | "move";
  trip: Trip;
  changes: { id: string; title: string; from: string; to: string }[];
  conflicts: { title: string; fixed: string; time: string }[];
};

/**
 * Options when the day is running `delay` minutes late. Fixed activities
 * (linked to bookings) never move; overlaps with them are reported.
 */
export function replanOptions(trip: Trip, day: number, delay: number, dayEnd = "22:00"): Proposal[] {
  const list = timeline(trip, day).filter(pending).filter((a) => a.status !== "started");
  const flexible = list.filter((a) => !isFixed(trip, a) && toMinutes(a.time) !== undefined);
  const fixed = list.filter((a) => isFixed(trip, a) && toMinutes(a.time) !== undefined);
  const end = toMinutes(dayEnd) ?? 22 * 60;
  const overlaps = (moved: { a: Activity; t: number }[]) =>
    moved.flatMap(({ a, t }) => fixed.filter((f) => Math.abs(toMinutes(f.time)! - t) < 60).map((f) => ({ title: a.title, fixed: f.title, time: f.time })));
  const shiftTrip = (items: Activity[]) => {
    let next = trip;
    const changes: Proposal["changes"] = [];
    const moved: { a: Activity; t: number }[] = [];
    for (const a of items) {
      const t = toMinutes(a.time)! + delay;
      if (t >= 24 * 60) continue;
      next = postpone(next, a.id, delay);
      changes.push({ id: a.id, title: a.title, from: a.time, to: toClock(t) });
      moved.push({ a, t });
    }
    return { trip: next, changes, conflicts: overlaps(moved) };
  };
  const options: Proposal[] = [{ key: "keep", trip, changes: [], conflicts: [] }];
  if (flexible[0]) options.push({ key: "next", ...shiftTrip([flexible[0]]) });
  if (flexible.length > 1) options.push({ key: "shift", ...shiftTrip(flexible) });
  // Move to the next day the flexible activities that no longer fit before the end of the day.
  const late = flexible.filter((a) => toMinutes(a.time)! + delay + 60 > end);
  const toMove = late.length ? late : flexible.slice(-1);
  if (toMove.length) {
    let next = trip;
    const changes: Proposal["changes"] = [];
    for (const a of toMove) {
      next = reschedule(next, a.id, day + 1, "");
      changes.push({ id: a.id, title: a.title, from: `${a.time}`, to: `+1` });
    }
    options.push({ key: "move", trip: next, changes, conflicts: [] });
  }
  return options;
}
