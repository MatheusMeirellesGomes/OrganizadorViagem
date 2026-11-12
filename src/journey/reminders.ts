import { uid, type Trip } from "../model";
import { dateOfDay } from "../planner";
import { toInstant } from "./time";
import { transportTitle } from "./transport";
import { vehicleName } from "./vehicles";

/*
 * Reminders (Etapa 16, Fase 8). Only created when the person chooses one.
 * They are shown inside the app; browser notifications only with permission
 * and only while the app is open — there is no push server.
 */

export const reminderKinds = {
  flight_checkin: "Check-in do voo",
  boarding: "Embarque",
  car_pickup: "Retirada do carro",
  car_dropoff: "Devolução do carro",
  hotel_checkin: "Check-in da hospedagem",
  hotel_checkout: "Check-out da hospedagem",
  timed_ticket: "Ingresso com horário",
  payment: "Pagamento pendente",
  documents: "Documentos necessários",
  booking: "Reserva importante",
  custom: "Lembrete",
} as const;
export type ReminderKind = keyof typeof reminderKinds;

export type Reminder = {
  id: string;
  kind: ReminderKind;
  /** Transport, vehicle, stay, activity, expense or prep item it refers to. */
  refId?: string;
  title: string;
  /** Moment of the event (ms) and how long before it to remind. */
  eventAt: number;
  before: number;
  done?: boolean;
};

export const offsets = [
  [0, "Na hora"],
  [60, "1 hora antes"],
  [180, "3 horas antes"],
  [1440, "1 dia antes"],
  [4320, "3 dias antes"],
  [10080, "1 semana antes"],
] as const;

export type Candidate = { kind: ReminderKind; refId: string; title: string; eventAt: number; note?: string };

const at = (trip: Trip, date?: string, time?: string, zone?: string) => (date ? toInstant(date, time || "09:00", zone || trip.timeZone) : undefined);

/** Events of the trip that can have a reminder (only with dates the person entered). */
export function candidates(trip: Trip): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Omit<Candidate, "eventAt"> & { eventAt?: number }) => c.eventAt !== undefined && out.push(c as Candidate);
  for (const t of trip.transports || []) {
    const l = t.legs[0];
    if (t.kind === "flight" && t.flight?.checkInDate)
      push({ kind: "flight_checkin", refId: t.id, title: transportTitle(t), eventAt: at(trip, t.flight.checkInDate, t.flight.checkInTime, l?.departZone) });
    if (l?.departDate) push({ kind: "boarding", refId: t.id, title: transportTitle(t), eventAt: at(trip, l.departDate, l.departTime, l.departZone), note: l.departTime ? undefined : "sem horário" });
  }
  for (const v of trip.vehicles || []) {
    const r = v.rental;
    if (r?.pickupDate) push({ kind: "car_pickup", refId: v.id, title: vehicleName(v), eventAt: at(trip, r.pickupDate, r.pickupTime) });
    if (r?.dropoffDate) push({ kind: "car_dropoff", refId: v.id, title: vehicleName(v), eventAt: at(trip, r.dropoffDate, r.dropoffTime) });
  }
  for (const s of trip.stays || []) {
    push({ kind: "hotel_checkin", refId: s.id, title: s.name, eventAt: at(trip, s.start, s.checkInTime) });
    push({ kind: "hotel_checkout", refId: s.id, title: s.name, eventAt: at(trip, s.end, s.checkOutTime) });
  }
  const booked = new Set(trip.reservations.map((r) => r.activityId).filter(Boolean));
  for (const a of trip.activities)
    if (a.time && booked.has(a.id)) push({ kind: "timed_ticket", refId: a.id, title: a.title, eventAt: at(trip, dateOfDay(trip, a.day), a.time) });
  for (const x of trip.expenses)
    if ((x.status === "planned" || x.status === "reserved" || x.status === "partial") && x.date) push({ kind: "payment", refId: x.id, title: x.title, eventAt: at(trip, x.date, "09:00") });
  return out.sort((a, b) => a.eventAt - b.eventAt);
}

export const remindAt = (r: Pick<Reminder, "eventAt" | "before">) => r.eventAt - r.before * 60000;

export function addReminder(trip: Trip, c: { kind: ReminderKind; refId?: string; title: string; eventAt: number }, before: number): Trip {
  if (!Number.isFinite(c.eventAt)) throw new Error("Escolha a data do lembrete.");
  if (!Number.isInteger(before) || before < 0 || before > 60 * 24 * 60) throw new Error("Antecedência inválida.");
  const list = trip.reminders || [];
  if (list.some((r) => r.kind === c.kind && r.refId === c.refId && r.before === before && r.eventAt === c.eventAt)) return trip;
  return { ...trip, reminders: [...list, { id: uid(), kind: c.kind, refId: c.refId, title: c.title.slice(0, 120), eventAt: c.eventAt, before }] };
}

export const setReminderDone = (trip: Trip, id: string, done = true): Trip => ({ ...trip, reminders: (trip.reminders || []).map((r) => (r.id === id ? { ...r, done } : r)) });
export const removeReminder = (trip: Trip, id: string): Trip => ({ ...trip, reminders: (trip.reminders || []).filter((r) => r.id !== id) });

/** Reminders whose time has come and that were not marked as done. */
export const dueReminders = (trip: Trip, now = Date.now()) => (trip.reminders || []).filter((r) => !r.done && remindAt(r) <= now).sort((a, b) => remindAt(a) - remindAt(b));
export const upcomingReminders = (trip: Trip, now = Date.now()) => (trip.reminders || []).filter((r) => !r.done && remindAt(r) > now).sort((a, b) => remindAt(a) - remindAt(b));

export function cleanReminders(v: unknown): Reminder[] {
  return (Array.isArray(v) ? v : [])
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.kind === "string" && r.kind in reminderKinds && Number.isFinite(Number(r.eventAt)) && Number.isInteger(Number(r.before)))
    .slice(0, 300)
    .map((r) => ({
      id: typeof r.id === "string" && r.id ? r.id : uid(),
      kind: r.kind as ReminderKind,
      refId: typeof r.refId === "string" ? r.refId : undefined,
      title: typeof r.title === "string" ? r.title.slice(0, 120) : "",
      eventAt: Number(r.eventAt),
      before: Math.max(0, Number(r.before)),
      done: r.done === true || undefined,
    }));
}
