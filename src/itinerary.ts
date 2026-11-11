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
type BuildOptions = {
  days: number;
  capacity: number;
  /** Lower tiers are visited first (e.g. free places before paid ones). */
  tier?: (p: SavedPlace) => number;
};

function candidatesFor(trip: Trip, includeMaybe: boolean) {
  const seen = new Set<string>();
  return (trip.placeChoices || [])
    .filter(
      (c) => c.decision === "want" || (includeMaybe && c.decision === "maybe"),
    )
    .map((c) => c.place)
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
}

function buildPlan(
  trip: Trip,
  candidates: SavedPlace[],
  { days, capacity, tier = () => 0 }: BuildOptions,
): PlanDraft {
  if (!Number.isInteger(days) || days < 1 || days > 3660)
    throw new Error("Escolha entre 1 e 3660 dias.");
  const remaining = [...candidates];
  const activities: Activity[] = [];
  let previous: Point | undefined =
    trip.stays?.find((s) => s.coordinates)?.coordinates || trip.coordinates;
  for (let day = 1; day <= days && remaining.length; day++) {
    for (let stop = 0; stop < capacity && remaining.length; stop++) {
      // Lowest tier first; inside a tier, the nearest place (straight line).
      const best = Math.min(...remaining.map(tier));
      let index = remaining.findIndex((p) => tier(p) === best);
      if (previous) {
        let closest = Infinity;
        remaining.forEach((p, i) => {
          if (tier(p) !== best || !p.coordinates) return;
          const distance = distanceKm(previous!, p.coordinates);
          if (distance < closest) {
            closest = distance;
            index = i;
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
      "Alguns lugares ficaram fora da capacidade escolhida. Aumente os dias ou o ritmo para incluí-los.",
    );
  return { activities, unassigned: remaining, warnings };
}

export function generateItinerary(trip: Trip, options: PlanOptions): PlanDraft {
  const capacity = { relaxed: 3, balanced: 5, intense: 7 }[options.pace];
  return buildPlan(trip, candidatesFor(trip, options.includeMaybe), {
    days: options.days,
    capacity,
  });
}

export type Strategy = "fast" | "budget" | "relaxed";
export type PlanSummary = {
  daysUsed: number;
  places: number;
  leftOut: number;
  km: number;
  kmComplete: boolean;
  maxPerDay: number;
  free: number;
  paid: number;
  unknownPrice: number;
};
export type Alternative = {
  strategy: Strategy;
  draft: PlanDraft;
  summary: PlanSummary;
};

/** Price as listed in the source: never guessed from the category. */
export function listedPrice(p: SavedPlace): "free" | "paid" | "unknown" {
  const fee = (p.tags?.fee || "").toLowerCase();
  if (fee === "no") return "free";
  if (fee && fee !== "no") return "paid";
  return "unknown";
}

export function summarize(draft: PlanDraft): PlanSummary {
  const perDay = new Map<number, number>();
  draft.activities.forEach((a) => perDay.set(a.day, (perDay.get(a.day) || 0) + 1));
  const line = straightLineLength(draft.activities);
  return {
    daysUsed: perDay.size,
    places: draft.activities.length,
    leftOut: draft.unassigned.length,
    km: line.km,
    kmComplete: line.missing === 0,
    maxPerDay: Math.max(0, ...perDay.values()),
    free: 0,
    paid: 0,
    unknownPrice: 0,
  };
}

/**
 * Three alternatives from the same chosen places, to compare before accepting:
 * - fast: as few days as possible (up to 7 places per day);
 * - budget: places listed as free first, listed as paid last (5 per day);
 * - relaxed: at most 3 per day, spread over the available days.
 */
export function generateAlternatives(
  trip: Trip,
  options: { days: number; includeMaybe: boolean },
): Alternative[] {
  const candidates = candidatesFor(trip, options.includeMaybe);
  const priceOf = new Map(candidates.map((p) => [p.id, listedPrice(p)]));
  const n = candidates.length;
  const plans: [Strategy, BuildOptions][] = [
    [
      "fast",
      { days: Math.max(1, Math.min(options.days, Math.ceil(n / 7))), capacity: 7 },
    ],
    [
      "budget",
      {
        days: options.days,
        capacity: 5,
        tier: (p) => ({ free: 0, unknown: 1, paid: 2 })[listedPrice(p)],
      },
    ],
    [
      "relaxed",
      {
        days: options.days,
        capacity: Math.max(1, Math.min(3, Math.ceil(n / options.days))),
      },
    ],
  ];
  return plans.map(([strategy, opts]) => {
    const draft = buildPlan(trip, candidates, opts);
    const summary = summarize(draft);
    summary.free = summary.paid = summary.unknownPrice = 0;
    for (const a of draft.activities) {
      const price = priceOf.get(a.placeId || "") || "unknown";
      if (price === "free") summary.free++;
      else if (price === "paid") summary.paid++;
      else summary.unknownPrice++;
    }
    return { strategy, draft, summary };
  });
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
