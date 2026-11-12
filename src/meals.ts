import { distanceKm, validPoint, type Place, type Point } from "./places";
import { categories } from "./places";
import { uid, type Activity, type Trip } from "./model";
import { staysOnDate } from "./stays";
import { dateOfDay, toMinutes } from "./planner";
import { parseOpeningHours } from "./explore/hours";
import type { Meal as RestaurantMeal } from "./explore/restaurants";

/*
 * Meals inside the itinerary (Fase 3): where to look for a restaurant at a
 * given time of a day, adding it in the right place of the timeline, swapping
 * it for another one and, optionally, a planned expense. Opening hours and
 * prices are only the registered ones.
 */

export type MealKind = "breakfast" | "brunch" | "lunch" | "afternoon" | "dinner" | "dessert";
export const mealKinds: MealKind[] = ["breakfast", "brunch", "lunch", "afternoon", "dinner", "dessert"];
export const mealNames: Record<MealKind, string> = {
  breakfast: "Café da manhã",
  brunch: "Brunch",
  lunch: "Almoço",
  afternoon: "Café da tarde",
  dinner: "Jantar",
  dessert: "Sobremesa",
};
export const defaultMealTimes: Record<MealKind, string> = {
  breakfast: "08:00",
  brunch: "11:00",
  lunch: "13:00",
  afternoon: "16:30",
  dinner: "20:30",
  dessert: "21:30",
};
/** Restaurant search kinds used by the Explorar service for each meal. */
export const mealSearch: Record<MealKind, RestaurantMeal> = {
  breakfast: "breakfast",
  brunch: "brunch",
  lunch: "lunch",
  afternoon: "afternoon",
  dinner: "dinner",
  dessert: "dessert",
};

export function mealTime(trip: Trip, meal: MealKind): string {
  return trip.mealTimes?.[meal] ?? defaultMealTimes[meal];
}

export type Anchor = { point: Point; name: string; why: "before" | "after" | "stay" | "trip" };

/** Where to look for a meal: the visit right before it, the next visit, the stay of the day or the destination. */
export function mealAnchor(trip: Trip, day: number, time: string): Anchor | undefined {
  const at = toMinutes(time) ?? 13 * 60;
  const items = trip.activities.filter((a) => a.day === day && a.coordinates && validPoint(a.coordinates));
  const timed = items.filter((a) => toMinutes(a.time) !== undefined).sort((a, b) => toMinutes(a.time)! - toMinutes(b.time)!);
  const before = timed.filter((a) => toMinutes(a.time)! <= at).pop();
  if (before) return { point: before.coordinates!, name: before.title, why: "before" };
  const after = timed.find((a) => toMinutes(a.time)! > at) ?? items[0];
  if (after) return { point: after.coordinates!, name: after.title, why: "after" };
  const date = dateOfDay(trip, day);
  const stay = date ? staysOnDate(trip, date).find((s) => s.coordinates) : undefined;
  if (stay?.coordinates) return { point: stay.coordinates, name: stay.name, why: "stay" };
  if (trip.coordinates && validPoint(trip.coordinates)) return { point: trip.coordinates, name: trip.destination, why: "trip" };
  return;
}

/** Pairs of consecutive visits of the day, to look for restaurants on the way. */
export function waySegments(trip: Trip, day: number): { from: Activity; to: Activity; center: Point; radius: number }[] {
  const items = trip.activities.filter((a) => a.day === day && a.coordinates && validPoint(a.coordinates));
  const out = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].coordinates!,
      b = items[i].coordinates!;
    const km = distanceKm(a, b);
    if (km < 0.3) continue;
    out.push({
      from: items[i - 1],
      to: items[i],
      center: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 },
      // Half the distance plus a margin, between 1 and 5 km.
      radius: Math.round(Math.min(5000, Math.max(1000, (km / 2 + 0.4) * 1000))),
    });
  }
  return out;
}

/** Open at that moment of that date, from the registered hours; undefined when unknown. */
export function openAt(place: Pick<Place, "tags">, date: string | undefined, time: string): boolean | undefined {
  const week = parseOpeningHours(place.tags?.opening_hours);
  const minute = toMinutes(time);
  if (!week || !date || minute === undefined) return;
  const d = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const m = d * 1440 + minute;
  return week.some(([s, e]) => (m >= s && m < e) || (e > 10080 && m + 10080 < e));
}

const foodKind = (p: Place) => categories[p.category] || "Restaurante";

/** Index where an activity at `time` fits in the day without moving the others. */
function insertIndex(activities: Activity[], day: number, time: string) {
  const t = toMinutes(time);
  if (t === undefined) {
    const last = activities.map((a) => a.day).lastIndexOf(day);
    return last < 0 ? activities.length : last + 1;
  }
  const next = activities.findIndex((a) => a.day === day && toMinutes(a.time) !== undefined && toMinutes(a.time)! > t);
  if (next >= 0) return next;
  const last = activities.map((a) => a.day).lastIndexOf(day);
  return last < 0 ? activities.length : last + 1;
}

export type AddMealOptions = {
  day: number;
  time: string;
  meal: MealKind;
  notes?: string;
  /** Optional planned cost (not money spent). */
  cost?: { amount: number; currency: string };
};

export function addMeal(trip: Trip, place: Place, options: AddMealOptions): Trip {
  const { day, time, meal, notes = "", cost } = options;
  if (!Number.isInteger(day) || day < 1 || day > 3660) throw new Error("Escolha um dia válido.");
  if (time && toMinutes(time) === undefined) throw new Error("Horário inválido.");
  if (trip.activities.some((a) => a.day === day && a.placeId === place.id))
    throw new Error("Este restaurante já está neste dia do roteiro.");
  const activity: Activity = {
    id: uid(),
    placeId: place.id,
    source: place.source || undefined,
    coordinates: place.coordinates,
    title: place.name,
    day,
    time,
    address: [place.address, place.city, place.country].filter(Boolean).join(", "),
    done: false,
    kind: foodKind(place),
    meal,
    ...(notes.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
  };
  const activities = [...trip.activities];
  activities.splice(insertIndex(activities, day, time), 0, activity);
  const expenses = [...trip.expenses];
  if (cost && Number.isFinite(cost.amount) && cost.amount > 0)
    expenses.push({
      id: uid(),
      title: place.name,
      amount: 0,
      estimate: Math.round(cost.amount * 100) / 100,
      currency: cost.currency,
      category: "food",
      status: "planned",
      day,
      activityId: activity.id,
    });
  return { ...trip, activities, expenses };
}

/** Swaps the restaurant of a meal, keeping its day, time, note and linked expense. */
export function replaceMeal(trip: Trip, activityId: string, place: Place): Trip {
  const current = trip.activities.find((a) => a.id === activityId);
  if (!current) throw new Error("Atividade não encontrada.");
  if (trip.activities.some((a) => a.id !== activityId && a.day === current.day && a.placeId === place.id))
    throw new Error("Este restaurante já está neste dia do roteiro.");
  return {
    ...trip,
    activities: trip.activities.map((a) =>
      a.id === activityId
        ? {
            ...a,
            placeId: place.id,
            source: place.source || undefined,
            coordinates: place.coordinates,
            title: place.name,
            address: [place.address, place.city, place.country].filter(Boolean).join(", "),
            kind: foodKind(place),
          }
        : a,
    ),
    expenses: trip.expenses.map((x) => (x.activityId === activityId ? { ...x, title: place.name } : x)),
  };
}

export const isMealActivity = (a: Activity) =>
  Boolean(a.meal) || /restaurante|café|cafeteria|lanche|padaria|sorveteria|confeitaria/i.test(a.kind);
