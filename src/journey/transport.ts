import { uid, type Activity, type Stay, type Trip } from "../model";
import { safeExternalUrl } from "../travel-mode";
import { validPoint } from "../places";
import { minutesBetween, toInstant, validZone } from "./time";
import { transportKinds, type Leg, type RoadRoute, type Stop, type Transport } from "./types";

const text = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const time = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "");
const zone = (v: unknown) => (typeof v === "string" && validZone(v) ? v : undefined);
const opt = (v: unknown, max = 120) => text(v, max) || undefined;

export function cleanStop(v: unknown): Stop {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const p = s.point as Stop["point"];
  return {
    name: text(s.name),
    code: opt(s.code, 8)?.toUpperCase(),
    point: p && validPoint(p) ? { lat: Number(p.lat), lng: Number(p.lng) } : undefined,
    terminal: opt(s.terminal, 20),
  };
}

export function cleanLeg(v: unknown): Leg {
  const l = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    id: typeof l.id === "string" && l.id ? l.id : uid(),
    from: cleanStop(l.from),
    to: cleanStop(l.to),
    departDate: date(l.departDate),
    departTime: time(l.departTime),
    departZone: zone(l.departZone),
    arriveDate: date(l.arriveDate),
    arriveTime: time(l.arriveTime),
    arriveZone: zone(l.arriveZone),
    carrier: opt(l.carrier, 60),
    number: opt(l.number, 12)?.toUpperCase(),
    gate: opt(l.gate, 10),
    cabin: opt(l.cabin, 40),
    seat: opt(l.seat, 12),
  };
}

/** Normalizes a transport from a form or a backup (unknown fields are dropped). */
export function cleanTransport(v: unknown): Transport | undefined {
  const t = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (typeof t.kind !== "string" || !(t.kind in transportKinds)) return;
  const legs = (Array.isArray(t.legs) ? t.legs : []).slice(0, 12).map(cleanLeg).filter((l) => l.from.name || l.to.name);
  if (!legs.length) return;
  const f = (t.flight && typeof t.flight === "object" ? t.flight : undefined) as Record<string, unknown> | undefined;
  const r = (t.road && typeof t.road === "object" ? t.road : undefined) as Record<string, unknown> | undefined;
  const km = Number(r?.distanceKm);
  const route = r?.route as RoadRoute | undefined;
  return {
    id: typeof t.id === "string" && t.id ? t.id : uid(),
    kind: t.kind as Transport["kind"],
    title: opt(t.title),
    legs,
    passengers: Array.isArray(t.passengers) ? t.passengers.filter((x): x is string => typeof x === "string").slice(0, 60) : undefined,
    reservationId: opt(t.reservationId, 60),
    documentIds: Array.isArray(t.documentIds) ? t.documentIds.filter((x): x is string => typeof x === "string") : undefined,
    notes: opt(t.notes, 1000),
    hasSecret: t.hasSecret === true || undefined,
    flight: f
      ? {
          cabinBag: opt(f.cabinBag, 80),
          checkedBag: opt(f.checkedBag, 80),
          checkInDate: date(f.checkInDate) || undefined,
          checkInTime: time(f.checkInTime) || undefined,
          checkInStatus: f.checkInStatus === "open" || f.checkInStatus === "done" ? f.checkInStatus : "unknown",
          checkInUrl: safeExternalUrl(text(f.checkInUrl, 500)) || undefined,
        }
      : undefined,
    road: r
      ? {
          vehicleIds: Array.isArray(r.vehicleIds) ? r.vehicleIds.filter((x): x is string => typeof x === "string") : undefined,
          distanceKm: km > 0 && km < 40000 ? Math.round(km * 10) / 10 : undefined,
          distanceSource: km > 0 ? (r.distanceSource === "route" ? "route" : "manual") : undefined,
          durationMin: Number(r.durationMin) > 0 ? Math.round(Number(r.durationMin)) : undefined,
          route:
            route && typeof route === "object" && Array.isArray(route.line) && Number(route.distanceKm) > 0
              ? {
                  provider: text(route.provider, 80),
                  distanceKm: Number(route.distanceKm),
                  durationMin: Number(route.durationMin) || 0,
                  line: route.line.filter((p) => Array.isArray(p) && validPoint({ lat: p[0], lng: p[1] })).slice(0, 400) as [number, number][],
                  fetchedAt: text(route.fetchedAt, 40),
                }
              : undefined,
          via: Array.isArray(r.via) ? r.via.map(cleanStop).filter((s) => s.name).slice(0, 10) : undefined,
        }
      : undefined,
  };
}

const zoneOf = (trip: Trip, z?: string) => z || trip.timeZone || undefined;

/** Departure instant of a leg (ms), using the trip zone when the leg has none. */
export const departInstant = (trip: Trip, l: Leg) => (l.departDate ? toInstant(l.departDate, l.departTime || "00:00", zoneOf(trip, l.departZone)) : undefined);

export function legMinutes(trip: Trip, l: Leg) {
  return minutesBetween(
    { date: l.departDate, time: l.departTime, zone: zoneOf(trip, l.departZone) },
    { date: l.arriveDate || l.departDate, time: l.arriveTime, zone: zoneOf(trip, l.arriveZone) },
  );
}

/** Problems that block saving. Connections that are too short are only warnings. */
export function checkTransport(trip: Trip, t: Transport): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  t.legs.forEach((l, i) => {
    if (!l.from.name || !l.to.name) errors.push("Informe a origem e o destino de cada trecho.");
    const m = legMinutes(trip, l);
    if (m !== undefined && m <= 0) errors.push(i ? "Um trecho chega antes de partir. Confira datas e fusos horários." : "A chegada está antes da partida. Confira datas e fusos horários.");
    const next = t.legs[i + 1];
    if (next && l.arriveDate && next.departDate) {
      const gap = minutesBetween(
        { date: l.arriveDate, time: l.arriveTime, zone: zoneOf(trip, l.arriveZone) },
        { date: next.departDate, time: next.departTime, zone: zoneOf(trip, next.departZone) },
      );
      if (gap !== undefined && gap < 0) errors.push("Um trecho parte antes de o anterior chegar.");
      else if (gap !== undefined && gap < 45) warnings.push("Conexão com menos de 45 minutos.");
    }
  });
  return { errors: [...new Set(errors)], warnings };
}

export function saveTransport(trip: Trip, input: Transport): Trip {
  const t = cleanTransport(input);
  if (!t) throw new Error("Informe o tipo de transporte e pelo menos um trecho.");
  const { errors } = checkTransport(trip, t);
  if (errors.length) throw new Error(errors[0]);
  const list = trip.transports || [];
  return { ...trip, transports: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] };
}

/** Removes the transport. Its expenses stay (unlinked) so no money record disappears. */
export function removeTransport(trip: Trip, id: string): Trip {
  return {
    ...trip,
    transports: (trip.transports || []).filter((t) => t.id !== id),
    expenses: trip.expenses.map((x) => (x.transportId === id ? { ...x, transportId: undefined, costKey: undefined } : x)),
    reservations: trip.reservations.map((r) => (r.transportId === id ? { ...r, transportId: undefined } : r)),
  };
}

export function sortedTransports(trip: Trip): Transport[] {
  const key = (t: Transport) => departInstant(trip, t.legs[0]) ?? Infinity;
  return [...(trip.transports || [])].sort((a, b) => key(a) - key(b));
}

export const routeLabel = (t: Pick<Transport, "legs">) =>
  [t.legs[0]?.from.name, ...t.legs.map((l) => l.to.name)].filter(Boolean).join(" → ");

export const transportTitle = (t: Transport) => t.title || routeLabel(t);

export type TimelineItem =
  | { kind: "depart"; time: string; transport: Transport; leg: Leg; index: number }
  | { kind: "arrive"; time: string; transport: Transport; leg: Leg; index: number }
  | { kind: "checkin"; time: string; stay: Stay }
  | { kind: "checkout"; time: string; stay: Stay }
  | { kind: "activities"; time: string; count: number; first: Activity; day: number };
export type TimelineDay = { date: string; items: TimelineItem[] };

const dayOf = (trip: Trip, d: string) => {
  if (!trip.start || !d) return;
  const n = Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(trip.start + "T12:00:00Z")) / 86400000) + 1;
  return n >= 1 ? n : undefined;
};

/**
 * Chronological view of the whole trip: every leg (departure and, on another
 * day, arrival), stay check-ins and check-outs, and how many activities each
 * day has. Undated records are left out and listed by the caller.
 */
export function journeyTimeline(trip: Trip): TimelineDay[] {
  const map = new Map<string, TimelineItem[]>();
  const add = (d: string, item: TimelineItem) => d && map.set(d, [...(map.get(d) ?? []), item]);
  for (const t of trip.transports || [])
    t.legs.forEach((leg, index) => {
      add(leg.departDate, { kind: "depart", time: leg.departTime, transport: t, leg, index });
      if (leg.arriveDate && leg.arriveDate !== leg.departDate) add(leg.arriveDate, { kind: "arrive", time: leg.arriveTime, transport: t, leg, index });
    });
  for (const s of trip.stays || []) {
    add(s.start, { kind: "checkin", time: s.checkInTime, stay: s });
    add(s.end, { kind: "checkout", time: s.checkOutTime, stay: s });
  }
  if (trip.start) {
    const byDay = new Map<number, Activity[]>();
    for (const a of trip.activities) byDay.set(a.day, [...(byDay.get(a.day) ?? []), a]);
    for (const [day, list] of byDay) {
      const d = new Date(Date.parse(trip.start + "T12:00:00Z") + (day - 1) * 86400000).toISOString().slice(0, 10);
      const sorted = [...list].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      add(d, { kind: "activities", time: sorted[0].time || "", count: list.length, first: sorted[0], day });
    }
  }
  const order = { checkout: 0, depart: 1, arrive: 2, checkin: 3, activities: 4 } as const;
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.time && b.time && a.time !== b.time ? a.time.localeCompare(b.time) : order[a.kind] - order[b.kind])),
    }));
}

/** Legs that depart or arrive on a date (for the calendar and the Travel Mode). */
export function legsOn(trip: Trip, d: string) {
  return (trip.transports || []).flatMap((t) =>
    t.legs.filter((l) => l.departDate === d || l.arriveDate === d).map((leg) => ({ transport: t, leg, day: dayOf(trip, d) })),
  );
}

export const undatedTransports = (trip: Trip) => (trip.transports || []).filter((t) => !t.legs[0]?.departDate);
