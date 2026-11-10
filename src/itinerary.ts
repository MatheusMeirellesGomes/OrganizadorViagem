import { categories, distanceKm, type Point } from "./places";
import { type Activity, type Trip, uid } from "./model";
import type { SavedPlace } from "./choices";
export type PlanOptions = {
  days: number;
  pace: "relaxed" | "balanced" | "intense";
  includeMaybe: boolean;
};
export type PlanDraft = {
  activities: Activity[];
  unassigned: SavedPlace[];
  warnings: string[];
};
export function generateItinerary(trip: Trip, options: PlanOptions): PlanDraft {
  if (
    !Number.isInteger(options.days) ||
    options.days < 1 ||
    options.days > 3660
  )
    throw new Error("Escolha entre 1 e 3660 dias.");
  const candidates = (trip.placeChoices || [])
    .filter(
      (c) =>
        c.decision === "want" ||
        (options.includeMaybe && c.decision === "maybe"),
    )
    .map((c) => c.place);
  const seen = new Set<string>();
  const remaining = candidates.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const capacity = { relaxed: 3, balanced: 5, intense: 7 }[options.pace],
    activities: Activity[] = [];
  let previous: Point | undefined =
    trip.stays?.find((s) => s.coordinates)?.coordinates || trip.coordinates;
  for (let day = 1; day <= options.days && remaining.length; day++) {
    for (let stop = 0; stop < capacity && remaining.length; stop++) {
      let index = 0;
      if (previous) {
        let closest = Infinity;
        remaining.forEach((p, i) => {
          if (p.coordinates) {
            const distance = distanceKm(previous!, p.coordinates);
            if (distance < closest) {
              closest = distance;
              index = i;
            }
          }
        });
      }
      const [p] = remaining.splice(index, 1);
      if (p.coordinates) previous = p.coordinates;
      activities.push({
        id: "draft:" + p.id,
        placeId: p.id,
        title: p.name,
        day,
        time: "",
        address: [p.address, p.city, p.country].filter(Boolean).join(", "),
        coordinates: p.coordinates,
        source: p.source || undefined,
        kind: categories[p.category] || "Passeio",
        done: false,
        period: "any",
      });
    }
  }
  const warnings = [
    "Agrupamento por distância em linha reta, não por trajetos reais.",
    "Horários de abertura, duração, ingressos, orçamento e transporte não foram confirmados. Revise antes de aceitar.",
  ];
  if (candidates.some((p) => !p.coordinates))
    warnings.push(
      "Lugares sem coordenadas mantêm a ordem de seleção; não foi possível otimizar sua localização.",
    );
  if (remaining.length)
    warnings.push(
      `${remaining.length} lugares ficaram fora da capacidade escolhida. Aumente os dias ou o ritmo para incluí-los.`,
    );
  return { activities, unassigned: remaining, warnings };
}
export function appendDraft(trip: Trip, activities: Activity[]): Trip {
  const existing = new Set(
    trip.activities.filter((a) => a.placeId).map((a) => a.placeId),
  );
  const added = activities
    .filter((a) => !a.placeId || !existing.has(a.placeId))
    .map((a) => ({ ...a, id: uid() }));
  if (added.some((a) => !Number.isInteger(a.day) || a.day < 1 || a.day > 3660))
    throw new Error("Confira os dias na prévia.");
  return { ...trip, activities: [...trip.activities, ...added] };
}
export function straightLineLength(activities: Activity[]) {
  let km = 0,
    segments = 0,
    missing = 0;
  for (let i = 1; i < activities.length; i++) {
    const a = activities[i - 1],
      b = activities[i];
    if (a.day !== b.day) continue;
    if (a.coordinates && b.coordinates) {
      km += distanceKm(a.coordinates, b.coordinates);
      segments++;
    } else missing++;
  }
  return { km, segments, missing };
}
