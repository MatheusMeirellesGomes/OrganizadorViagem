import type { Activity, Trip } from "./model";
const DAY = 86400000;
// Calendar arithmetic uses UTC, never the device's timezone as the destination's.
export function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return;
  return date;
}
export function travelDays(trip: Trip, selectedDay = 1): number[] {
  const start = calendarDate(trip.start),
    end = calendarDate(trip.end);
  const datedDays =
    start && end && end >= start ? Math.floor((+end - +start) / DAY) + 1 : 0;
  const activityDays = trip.activities.map((a) =>
    Number.isInteger(a.day) && a.day > 0 ? a.day : 1,
  );
  const count = Math.min(
    3660,
    Math.max(datedDays || 3, selectedDay, ...activityDays),
  );
  return Array.from({ length: count }, (_, index) => index + 1);
}
export function dayLabel(
  trip: Trip,
  day: number,
): { short: string; full: string } {
  const start = calendarDate(trip.start);
  if (!start) return { short: `Dia ${day}`, full: `Dia ${day}` };
  const date = new Date(+start + (day - 1) * DAY);
  return {
    short: new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
    full: new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date),
  };
}
export function dayActivities(trip: Trip, day: number) {
  return trip.activities.filter((a) => a.day === day);
}
export function dayProgress(trip: Trip, day: number) {
  const activities = dayActivities(trip, day);
  return {
    total: activities.length,
    done: activities.filter((a) => a.done).length,
  };
}
export function nextActivity(trip: Trip, day: number): Activity | undefined {
  // No destination timezone exists in the current model. Follow the user's order.
  return dayActivities(trip, day).find((a) => !a.done);
}
export function toggleVisited(trip: Trip, activityId: string): Trip {
  return {
    ...trip,
    activities: trip.activities.map((a) =>
      a.id === activityId ? { ...a, done: !a.done } : a,
    ),
  };
}
export function navigationUrl(activity: Activity): string | undefined {
  const address = activity.coordinates
    ? `${activity.coordinates.lat},${activity.coordinates.lng}`
    : activity.address?.trim();
  return address
    ? "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(address)
    : undefined;
}
export function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return;
  }
}
export function hasTravelInformation(trip: Trip): boolean {
  return Boolean(
    trip.stays?.length ||
    trip.hotel?.trim() ||
    trip.notes?.trim() ||
    trip.reservations?.length ||
    trip.checklist?.length,
  );
}
