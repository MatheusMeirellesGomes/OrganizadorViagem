import type { Trip } from "../model";
import { distanceKm, validPoint, type Point } from "../places";
import { dateOfDay } from "../planner";
import { toMajor, plannedMinor, paidMinor } from "../budget";
import { linkedCosts } from "./costs";
import { legMinutes, transportTitle } from "./transport";
import { roadKinds, type TransportKind } from "./types";

/*
 * Whole-trip map (Etapa 16, Fase 11). Flights are drawn as a dashed straight
 * line and labelled as such; roads use the stored route geometry when there
 * is one, otherwise a dotted "no route" line with the distance the person typed.
 * The two are never mixed.
 */

export type MapMode = "air" | "road" | "rail" | "water" | "other";
export const modeOf = (k: TransportKind): MapMode =>
  k === "flight" ? "air" : roadKinds.includes(k) || k === "taxi" || k === "bus" ? "road" : k === "train" || k === "transit" ? "rail" : k === "ferry" ? "water" : "other";

export type MapSegment = {
  id: string;
  transportId: string;
  title: string;
  kind: TransportKind;
  mode: MapMode;
  from: { name: string; point: Point };
  to: { name: string; point: Point };
  line: [number, number][];
  /** true when the line is not a real road route (flights, or roads without a calculated route). */
  straight: boolean;
  distanceKm?: number;
  distanceKind: "route" | "manual" | "straight" | "none";
  minutes?: number;
  date?: string;
  costs: { currency: string; planned: number; paid: number }[];
};

export type MapPoint = {
  id: string;
  kind: "stay" | "attraction" | "restaurant" | "airport" | "station" | "stop";
  name: string;
  point: Point;
  dates: string[];
};

const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

function costsOf(trip: Trip, transportId: string, vehicleIds: string[] = []) {
  const by = new Map<string, { planned: number; paid: number }>();
  const all = [...linkedCosts(trip, { transportId }), ...vehicleIds.flatMap((v) => linkedCosts(trip, { vehicleId: v }).filter((x) => x.costKey !== "rental"))];
  for (const x of all) {
    const c = by.get(x.currency) ?? { planned: 0, paid: 0 };
    c.planned += plannedMinor(x);
    c.paid += paidMinor(x);
    by.set(x.currency, c);
  }
  return [...by].map(([currency, v]) => ({ currency, planned: toMajor(v.planned, currency), paid: toMajor(v.paid, currency) }));
}

export function tripMapData(trip: Trip) {
  const segments: MapSegment[] = [];
  const points = new Map<string, MapPoint>();
  const addPoint = (p: MapPoint) => {
    const key = `${p.kind}:${p.point.lat.toFixed(4)},${p.point.lng.toFixed(4)}`;
    const old = points.get(key);
    points.set(key, old ? { ...old, dates: [...new Set([...old.dates, ...p.dates])] } : p);
  };
  for (const t of trip.transports || []) {
    const mode = modeOf(t.kind);
    t.legs.forEach((l, i) => {
      const ends = [l.from, l.to];
      ends.forEach((s, j) => {
        if (s.point && validPoint(s.point))
          addPoint({ id: `${t.id}:${i}:${j}`, kind: mode === "air" ? "airport" : mode === "rail" ? "station" : "stop", name: s.code ? `${s.name} (${s.code})` : s.name, point: s.point, dates: [iso(j ? l.arriveDate || l.departDate : l.departDate)].filter(Boolean) as string[] });
      });
      if (!l.from.point || !l.to.point || !validPoint(l.from.point) || !validPoint(l.to.point)) return;
      const road = mode === "road" && t.legs.length === 1 ? t.road : undefined;
      const route = road?.route?.line?.length ? road.route.line : undefined;
      const straightKm = Math.round(distanceKm(l.from.point, l.to.point));
      segments.push({
        id: `${t.id}:${i}`,
        transportId: t.id,
        title: transportTitle(t),
        kind: t.kind,
        mode,
        from: { name: l.from.code || l.from.name, point: l.from.point },
        to: { name: l.to.code || l.to.name, point: l.to.point },
        line: route ?? [
          [l.from.point.lat, l.from.point.lng],
          [l.to.point.lat, l.to.point.lng],
        ],
        straight: !route,
        // Road distance only from a route or typed by the person; flights show the straight line, labelled.
        distanceKm: mode === "road" ? road?.distanceKm : mode === "air" ? straightKm : undefined,
        distanceKind: mode === "road" ? (road?.distanceKm ? (road.distanceSource === "route" ? "route" : "manual") : "none") : mode === "air" ? "straight" : "none",
        minutes: legMinutes(trip, l) ?? road?.durationMin,
        date: iso(l.departDate),
        costs: i === 0 ? costsOf(trip, t.id, t.road?.vehicleIds) : [],
      });
    });
    for (const v of t.road?.via ?? []) if (v.point && validPoint(v.point)) addPoint({ id: `${t.id}:via:${v.name}`, kind: "stop", name: v.name, point: v.point, dates: [iso(t.legs[0]?.departDate)].filter(Boolean) as string[] });
  }
  for (const s of trip.stays || [])
    if (s.coordinates && validPoint(s.coordinates)) {
      const dates: string[] = [];
      if (iso(s.start) && iso(s.end)) for (let d = Date.parse(s.start + "T12:00:00Z"); d <= Date.parse(s.end + "T12:00:00Z") && dates.length < 60; d += 86400000) dates.push(new Date(d).toISOString().slice(0, 10));
      addPoint({ id: "s:" + s.id, kind: "stay", name: s.name, point: s.coordinates, dates });
    }
  for (const a of trip.activities)
    if (a.coordinates && validPoint(a.coordinates)) addPoint({ id: "a:" + a.id, kind: a.meal ? "restaurant" : "attraction", name: a.title, point: a.coordinates, dates: [dateOfDay(trip, a.day)].filter(Boolean) as string[] });
  const dates = [...new Set([...segments.map((s) => s.date), ...[...points.values()].flatMap((p) => p.dates)].filter(Boolean) as string[])].sort();
  return { segments, points: [...points.values()], dates };
}

export type MapFilter = { date?: string; transportId?: string };

export function filterMap(data: ReturnType<typeof tripMapData>, f: MapFilter) {
  if (f.transportId) {
    const segments = data.segments.filter((s) => s.transportId === f.transportId);
    const ids = new Set(segments.map((s) => s.transportId));
    return { segments, points: data.points.filter((p) => [...ids].some((id) => p.id.startsWith(id + ":"))) };
  }
  if (f.date) return { segments: data.segments.filter((s) => s.date === f.date), points: data.points.filter((p) => p.dates.includes(f.date!)) };
  return { segments: data.segments, points: data.points };
}
