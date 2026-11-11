import type { Trip } from "./model";
import { calendarDate, travelDays } from "./travel-mode";
import { distanceKm, validPoint, type Point } from "./places";
export function validTimeZone(zone: string) {
  if (!zone) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function dateInZone(now: Date, zone?: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function currentTripDay(
  trip: Trip,
  now = new Date(),
): number | undefined {
  const start = calendarDate(trip.start);
  if (!start || !validTimeZone(trip.timeZone || "")) return;
  const today = calendarDate(dateInZone(now, trip.timeZone));
  if (!today) return;
  const day = Math.floor((+today - +start) / 86400000) + 1;
  return day >= 1 && day <= travelDays(trip).length ? day : undefined;
}
export function nearbySavedPlaces(trip: Trip, point: Point) {
  if (!validPoint(point)) return [];
  const unique = new Map<
    string,
    {
      id: string;
      title: string;
      address: string;
      coordinates: Point;
      kind: string;
    }
  >();
  for (const a of trip.activities)
    if (a.coordinates && validPoint(a.coordinates))
      unique.set(a.placeId || a.id, { ...a, coordinates: a.coordinates });
  for (const c of trip.placeChoices || [])
    if (
      c.decision !== "skip" &&
      c.place.coordinates &&
      validPoint(c.place.coordinates) &&
      !unique.has(c.place.id)
    )
      unique.set(c.place.id, {
        id: c.place.id,
        title: c.place.name,
        address: c.place.address,
        coordinates: c.place.coordinates,
        kind: c.place.category,
      });
  return [...unique.values()]
    .map((p) => ({ ...p, distance: distanceKm(point, p.coordinates) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
}
