import type { Trip } from "./model";
import { uid } from "./model";
import type { Expense } from "./budget";
import { dateOfDay } from "./planner";

/*
 * Planned expenses suggested from the rest of the trip (Fase 4): stays,
 * bookings and activities with a registered price. Nothing is created until
 * the person confirms, and an item already linked to an expense is not
 * suggested again (no duplicates).
 */

export type Suggestion = { key: string; expense: Expense; from: string };

export function plannedSuggestions(trip: Trip, currency: string): Suggestion[] {
  const linked = new Set(trip.expenses.flatMap((x) => [x.stayId, x.reservationId, x.activityId].filter(Boolean) as string[]));
  const out: Suggestion[] = [];
  for (const s of trip.stays ?? []) {
    if (linked.has(s.id)) continue;
    out.push({
      key: "stay:" + s.id,
      from: "Hospedagem",
      expense: { id: uid(), title: s.name, amount: 0, currency, status: "planned", category: "lodging", stayId: s.id, date: s.start || undefined },
    });
  }
  for (const r of trip.reservations) {
    if (linked.has(r.id) || (r.stayId && linked.has(r.stayId))) continue;
    out.push({
      key: "res:" + r.id,
      from: "Reserva",
      expense: { id: uid(), title: r.title, amount: 0, currency, status: "reserved", category: "other", reservationId: r.id },
    });
  }
  for (const a of trip.activities) {
    if (linked.has(a.id) || !a.placeId) continue;
    const choice = trip.placeChoices?.find((c) => c.place.id === a.placeId);
    const tags = choice?.place.tags ?? {};
    // Only real prices from the source: never a guessed ticket price.
    if (!tags.charge || !tags.currency) continue;
    const price = Number(tags.charge);
    if (!(price > 0)) continue;
    out.push({
      key: "act:" + a.id,
      from: "Ingresso",
      expense: { id: uid(), title: a.title, amount: 0, estimate: price, currency: tags.currency, status: "planned", category: "tickets", activityId: a.id, day: a.day, date: dateOfDay(trip, a.day) },
    });
  }
  return out;
}
