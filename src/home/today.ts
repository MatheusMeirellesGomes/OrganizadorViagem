import type { Activity, Trip } from "../model";
import { dateOfDay } from "../planner";

/*
 * Visão geral: qual viagem merece destaque agora e o que vem a seguir nela.
 * Tudo sai dos dados da pessoa; nada é inventado quando falta informação.
 */

const dayMs = 86400000;
const parse = (d: string) => Date.parse(d + "T00:00:00Z");
const valid = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parse(d)));

/** Viagem em andamento; senão a próxima com data; senão a primeira em planejamento. */
export function featuredTrip(trips: Trip[], today: string): Trip | undefined {
  const open = trips.filter((t) => t.status !== "past" && !(valid(t.end) && t.end < today));
  const now = open.find((t) => valid(t.start) && t.start <= today && (!valid(t.end) || t.end >= today));
  if (now) return now;
  const dated = open.filter((t) => valid(t.start) && t.start > today).sort((a, b) => a.start.localeCompare(b.start));
  return dated[0] ?? open[0];
}

export type Moment = { kind: "before"; days: number } | { kind: "during"; day: number; total?: number } | { kind: "undated" };
export function tripMoment(trip: Trip, today: string): Moment {
  if (!valid(trip.start)) return { kind: "undated" };
  if (trip.start > today) return { kind: "before", days: Math.round((parse(trip.start) - parse(today)) / dayMs) };
  const day = Math.round((parse(today) - parse(trip.start)) / dayMs) + 1;
  const total = valid(trip.end) ? Math.round((parse(trip.end) - parse(trip.start)) / dayMs) + 1 : undefined;
  return { kind: "during", day, total };
}

/** Próxima atividade não concluída: hoje a partir de agora, ou do próximo dia com programação. */
export function nextActivity(trip: Trip, today: string, time: string): (Activity & { date?: string }) | undefined {
  const m = tripMoment(trip, today);
  const fromDay = m.kind === "during" ? m.day : 1;
  const list = (trip.activities ?? [])
    .filter((a) => !a.done && a.day >= fromDay && !(m.kind === "during" && a.day === m.day && /^\d{2}:\d{2}$/.test(a.time) && a.time < time))
    .sort((a, b) => a.day - b.day || (a.time || "99").localeCompare(b.time || "99"));
  const a = list[0];
  return a ? { ...a, date: dateOfDay(trip, a.day) } : undefined;
}
