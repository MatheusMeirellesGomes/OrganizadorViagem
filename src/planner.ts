import { categories, distanceKm, validPoint, type Point } from "./places";
import { uid, type Activity, type Trip } from "./model";
import type { SavedPlace } from "./choices";
import { calendarDate } from "./travel-mode";
import { staysOnDate } from "./stays";
import { parseOpeningHours } from "./explore/hours";

/*
 * Smart itinerary planner (Fase 2).
 *
 * Deterministic, no paid AI. It groups the chosen places by day around the
 * stay of each day (multi-city trips use the right hotel per date), orders each
 * day to avoid back-and-forth (nearest neighbour + 2-opt), then schedules real
 * clock times: estimated visit length, estimated travel, registered opening
 * hours, meal breaks and the activities that already have a fixed time.
 *
 * Travel times are ESTIMATES from straight-line distance × a detour factor and
 * an average speed per transport mode. They are always labelled as such; they
 * are not routes. Visit lengths are estimates by category, editable in the
 * preview. Nothing is saved until the person confirms, and existing activities
 * are never moved or deleted.
 */

export type Mode = "walking" | "transit" | "driving" | "bicycling";
export type Pace = "relaxed" | "balanced" | "intense";
export type Strategy = "balanced" | "fast" | "budget" | "relaxed";

export const modeLabels: Record<Mode, string> = {
  walking: "A pé",
  transit: "Transporte público",
  driving: "Carro",
  bicycling: "Bicicleta",
};

/** Typical visit length in minutes by category (estimate, editable). */
export const visitMinutes: Record<string, number> = {
  museum: 120, gallery: 75, palace: 90, castle: 90, place_of_worship: 40,
  archaeological_site: 75, zoo: 180, aquarium: 120, theme_park: 300, square: 30,
  historic_center: 90, park: 60, garden: 60, viewpoint: 30, beach: 120, nature: 90,
  mountain: 150, trail: 150, marketplace: 60, culture: 120, stadium: 90, monument: 20,
  memorial: 20, historic: 30, attraction: 45, restaurant: 75, cafe: 40, fast_food: 30,
  food_court: 45, bakery: 20, ice_cream: 15, pastry: 20, other: 45,
};

const paceLimits: Record<Pace, { stops: number; ideal: number; buffer: number }> = {
  relaxed: { stops: 3, ideal: 2, buffer: 30 },
  balanced: { stops: 5, ideal: 3, buffer: 15 },
  intense: { stops: 7, ideal: 5, buffer: 5 },
};

/** Estimated door-to-door travel. Not a route: straight line × detour ÷ average speed. */
export function estimateTravel(a: Point, b: Point, mode: Mode): { km: number; minutes: number; mode: Mode } {
  const straight = distanceKm(a, b);
  if (straight < 0.05) return { km: 0, minutes: 0, mode };
  // Short hops are walked even when the main mode is transit or car.
  const effective: Mode = (mode === "transit" || mode === "driving") && straight < 0.8 ? "walking" : mode;
  const detour = effective === "transit" ? 1.4 : 1.3;
  const km = straight * detour;
  const speed =
    effective === "walking" ? 4.5 : effective === "bicycling" ? 13 : effective === "transit" ? 16 : km > 30 ? 70 : 22;
  const overhead = effective === "transit" ? 10 : effective === "driving" ? 10 : 0;
  return { km, minutes: Math.max(3, Math.round((km / speed) * 60 + overhead)), mode: effective };
}

export const toMinutes = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
export const toClock = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export type Meal = { kind: "breakfast" | "lunch" | "dinner"; at: string; minutes: number };

export type PlannerInput = {
  places: SavedPlace[];
  days: number[];
  dayStart: string;
  dayEnd: string;
  mode: Mode;
  pace: Pace;
  meals: Meal[];
  /** Hotel used when a day has no stay of its own. */
  stayId?: string;
  strategy?: Strategy;
  /** Visit length chosen by the person, by place id. */
  durations?: Record<string, number>;
  /** Day chosen by the person for a place (manual reorganization). */
  forcedDays?: Record<string, number>;
};

export type PlannedStop = {
  place: SavedPlace;
  start: number;
  end: number;
  visit: number;
  visitEstimated: boolean;
  travel: { km: number; minutes: number; mode: Mode };
  notes: string[];
};
export type Busy = { start: number; end: number; title: string; point?: Point; kind: "fixed" | "meal"; meal?: Meal["kind"] };
export type DayPlan = {
  day: number;
  date?: string;
  base?: Point;
  baseName?: string;
  stops: PlannedStop[];
  busy: Busy[];
  conflicts: Conflict[];
};
export type Conflict = { kind: "overlap" | "closed" | "closes"; title: string; other?: string; time?: string };
export type Plan = {
  strategy: Strategy;
  days: DayPlan[];
  unassigned: { place: SavedPlace; reason: string }[];
  warnings: string[];
  summary: {
    daysUsed: number;
    places: number;
    leftOut: number;
    travelMinutes: number;
    travelKm: number;
    conflicts: number;
    free: number;
    paid: number;
    unknownPrice: number;
  };
};

export function dateOfDay(trip: Trip, day: number): string | undefined {
  const start = calendarDate(trip.start);
  if (!start) return;
  return new Date(+start + (day - 1) * 86400000).toISOString().slice(0, 10);
}

/** Weekday 0 = Monday, from the calendar date (no device time zone involved). */
const weekday = (date: string) => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;

function dayBase(trip: Trip, day: number, fallbackStay?: string) {
  const date = dateOfDay(trip, day);
  const stay =
    (date ? staysOnDate(trip, date).find((s) => s.coordinates && validPoint(s.coordinates)) : undefined) ??
    trip.stays?.find((s) => s.id === fallbackStay && s.coordinates) ??
    undefined;
  if (stay?.coordinates) return { point: stay.coordinates, name: stay.name, date, missing: false };
  // With stays registered, a day without one is not guessed: it gets no places.
  const hasStays = (trip.stays ?? []).some((s) => s.coordinates);
  if (!hasStays && trip.coordinates && validPoint(trip.coordinates))
    return { point: trip.coordinates, name: trip.destination || undefined, date, missing: false };
  return { point: undefined, name: undefined, date, missing: hasStays };
}

const price = (p: SavedPlace) => (p.tags?.fee === "no" ? "free" : p.tags?.fee === "yes" || p.tags?.charge ? "paid" : "unknown");
const relevance = (p: SavedPlace) => Number(p.tags?.sitelinks || 0);

/** Groups points into k clusters (deterministic k-means with farthest-point seeds). */
export function cluster<T extends { point: Point }>(items: T[], k: number, from?: Point): T[][] {
  if (k <= 1 || items.length <= 1) return [items];
  const sorted = [...items];
  const seeds: Point[] = [];
  let first = sorted[0].point;
  if (from) first = sorted.reduce((a, b) => (distanceKm(from, a.point) >= distanceKm(from, b.point) ? a : b)).point;
  seeds.push(first);
  while (seeds.length < Math.min(k, items.length)) {
    const next = sorted.reduce((best, it) =>
      Math.min(...seeds.map((s) => distanceKm(s, it.point))) > Math.min(...seeds.map((s) => distanceKm(s, best.point))) ? it : best,
    );
    seeds.push(next.point);
  }
  let groups: T[][] = [];
  for (let round = 0; round < 12; round++) {
    groups = seeds.map(() => []);
    for (const it of sorted) {
      let best = 0;
      seeds.forEach((s, i) => {
        if (distanceKm(s, it.point) < distanceKm(seeds[best], it.point)) best = i;
      });
      groups[best].push(it);
    }
    let moved = false;
    groups.forEach((g, i) => {
      if (!g.length) return;
      const c = { lat: g.reduce((s, x) => s + x.point.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.point.lng, 0) / g.length };
      if (distanceKm(c, seeds[i]) > 0.001) moved = true;
      seeds[i] = c;
    });
    if (!moved) break;
  }
  return groups;
}

/** Visiting order: nearest neighbour from the base, improved with 2-opt. */
export function orderStops<T extends { point: Point }>(items: T[], base?: Point): T[] {
  if (items.length < 2) return items;
  const rest = [...items];
  const route: T[] = [];
  let at = base ?? rest[0].point;
  while (rest.length) {
    let best = 0;
    rest.forEach((it, i) => {
      if (distanceKm(at, it.point) < distanceKm(at, rest[best].point)) best = i;
    });
    const [it] = rest.splice(best, 1);
    route.push(it);
    at = it.point;
  }
  const length = (r: T[]) =>
    r.reduce((sum, it, i) => sum + distanceKm(i ? r[i - 1].point : base ?? r[0].point, it.point), 0) +
    (base ? distanceKm(r[r.length - 1].point, base) : 0);
  let improved = true;
  for (let guard = 0; improved && guard < 50; guard++) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++)
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (length(candidate) + 1e-9 < length(route)) {
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
  }
  return route;
}

function fixedBusy(trip: Trip, day: number): Busy[] {
  return trip.activities
    .filter((a) => a.day === day && toMinutes(a.time) !== undefined)
    .map((a) => {
      const start = toMinutes(a.time)!;
      return { start, end: start + 60, title: a.title, point: a.coordinates, kind: "fixed" as const };
    })
    .sort((a, b) => a.start - b.start);
}

export function planItinerary(trip: Trip, input: PlannerInput): Plan {
  const strategy = input.strategy ?? "balanced";
  const pace: Pace = strategy === "fast" ? "intense" : strategy === "relaxed" ? "relaxed" : input.pace;
  const limits = paceLimits[pace];
  const dayStart = toMinutes(input.dayStart) ?? 9 * 60;
  const dayEnd = toMinutes(input.dayEnd) ?? 19 * 60;
  if (dayEnd <= dayStart) throw new Error("O horário de término precisa ser depois do início.");
  const days = [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 3660).sort((a, b) => a - b);
  if (!days.length) throw new Error("Escolha pelo menos um dia.");
  const already = new Set(trip.activities.map((a) => a.placeId).filter(Boolean));
  const unassigned: Plan["unassigned"] = [];
  const pool: { place: SavedPlace; point: Point }[] = [];
  const seen = new Set<string>();
  for (const place of input.places) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    if (already.has(place.id)) unassigned.push({ place, reason: "Já está no roteiro" });
    else if (!place.coordinates || !validPoint(place.coordinates)) unassigned.push({ place, reason: "Sem coordenadas: adicione manualmente" });
    else pool.push({ place, point: place.coordinates });
  }

  // Bases per day (multi-city trips use the stay of each date).
  const bases = days.map((day) => ({ day, ...dayBase(trip, day, input.stayId) }));
  // Each place goes to the days whose base is within 60 km (or any day without base).
  const byDay = new Map<number, { place: SavedPlace; point: Point }[]>(days.map((d) => [d, []]));
  const groups = new Map<string, { days: number[]; base?: Point; items: { place: SavedPlace; point: Point }[] }>();
  for (const b of bases) {
    if (b.missing) continue;
    const key = b.point ? `${b.point.lat.toFixed(3)},${b.point.lng.toFixed(3)}` : "none";
    const g = groups.get(key) ?? { days: [], base: b.point, items: [] };
    g.days.push(b.day);
    groups.set(key, g);
  }
  const groupList = [...groups.values()];
  for (const item of pool) {
    const forced = input.forcedDays?.[item.place.id];
    if (forced && byDay.has(forced)) {
      byDay.get(forced)!.push(item);
      continue;
    }
    const near = groupList
      .map((g) => ({ g, km: g.base ? distanceKm(g.base, item.point) : 0 }))
      .filter((x) => x.km <= 60)
      .sort((a, b) => a.km - b.km)[0];
    if (!near) unassigned.push({ place: item.place, reason: "Longe das hospedagens dos dias escolhidos" });
    else near.g.items.push(item);
  }

  for (const g of groupList) {
    if (!g.items.length) continue;
    // Budget: when not everything fits, keep free and unknown-price places first.
    const ranked = [...g.items].sort((a, b) =>
      strategy === "budget"
        ? ({ free: 0, unknown: 1, paid: 2 }[price(a.place)] - { free: 0, unknown: 1, paid: 2 }[price(b.place)]) || relevance(b.place) - relevance(a.place)
        : relevance(b.place) - relevance(a.place),
    );
    const capacity = g.days.length * limits.stops;
    const chosen = ranked.slice(0, capacity);
    for (const extra of ranked.slice(capacity)) unassigned.push({ place: extra.place, reason: "Não coube no ritmo escolhido" });
    // Enough days for an ideal number of visits per day (fast fills days up to the limit).
    const perDay = strategy === "fast" ? limits.stops : limits.ideal;
    const usedDays = g.days.slice(0, Math.max(1, Math.min(g.days.length, Math.ceil(chosen.length / perDay))));
    const clusters = cluster(chosen, usedDays.length, g.base);
    // Balance: no day above the stop limit; extras go to the nearest day with room.
    const overflow: typeof chosen = [];
    clusters.forEach((c) => {
      while (c.length > limits.stops) overflow.push(c.pop()!);
    });
    for (const item of overflow) {
      let best = -1;
      clusters.forEach((c, i) => {
        if (c.length >= limits.stops) return;
        const center = c[0]?.point ?? g.base ?? item.point;
        if (best < 0 || distanceKm(center, item.point) < distanceKm(clusters[best][0]?.point ?? g.base ?? item.point, item.point)) best = i;
      });
      if (best >= 0) clusters[best].push(item);
      else unassigned.push({ place: item.place, reason: "Não coube no ritmo escolhido" });
    }
    // Busiest clusters go to the first days; relaxed spreads them evenly.
    clusters
      .map((c, i) => ({ c, i }))
      .sort((a, b) => b.c.length - a.c.length)
      .forEach(({ c }, i) => byDay.get(usedDays[i % usedDays.length])!.push(...c));
  }

  const plans: DayPlan[] = bases.map((b) => {
    const busy = fixedBusy(trip, b.day);
    const conflicts: Conflict[] = [];
    for (let i = 1; i < busy.length; i++)
      if (busy[i].start < busy[i - 1].end) conflicts.push({ kind: "overlap", title: busy[i - 1].title, other: busy[i].title });
    const ordered = orderStops(byDay.get(b.day) ?? [], b.point);
    const meals = [...input.meals].sort((x, y) => (toMinutes(x.at) ?? 0) - (toMinutes(y.at) ?? 0));
    const placedMeals = new Set<string>();
    const stops: PlannedStop[] = [];
    let cursor = dayStart;
    let at = b.point;
    const blocks = () => [...busy].sort((x, y) => x.start - y.start);
    const week = b.date !== undefined ? weekday(b.date) : undefined;
    const conflictsFor: Conflict[] = [];
    for (const item of ordered) {
      const p = item.place;
      conflictsFor.length = 0;
      const visit = input.durations?.[p.id] ?? visitMinutes[p.category] ?? 45;
      const travel = at ? estimateTravel(at, item.point, input.mode) : { km: 0, minutes: 0, mode: input.mode };
      // Meals: take the break when its time arrives.
      for (const m of meals) {
        const mAt = toMinutes(m.at)!;
        if (placedMeals.has(m.kind) || cursor + travel.minutes + visit / 2 < mAt) continue;
        if (mAt < dayStart || mAt > dayEnd) continue;
        const start = Math.max(cursor, mAt - 30);
        busy.push({ start, end: start + m.minutes, title: m.kind, kind: "meal", meal: m.kind });
        placedMeals.add(m.kind);
        cursor = start + m.minutes;
      }
      let start = cursor + travel.minutes;
      const notes: string[] = [];
      const hours = parseOpeningHours(p.tags?.opening_hours);
      if (hours && week !== undefined) {
        const open = hours.filter(([s, e]) => s < (week + 1) * 1440 && e > week * 1440).map(([s, e]) => [s - week * 1440, e - week * 1440]);
        if (!open.length) {
          notes.push("Fechado neste dia da semana segundo o horário cadastrado");
          conflictsFor.push({ kind: "closed", title: p.name });
        } else {
          const slot = open.find(([, e]) => e >= start + visit) ?? open[open.length - 1];
          if (slot[0] > start) start = slot[0];
          if (start + visit > slot[1]) {
            notes.push("Fecha antes do fim da visita");
            conflictsFor.push({ kind: "closes", title: p.name, time: toClock(slot[1]) });
          }
        }
      } else if (!hours) notes.push("Horário de funcionamento não informado");
      // Do not overlap fixed commitments or meals.
      for (const blk of blocks()) if (start < blk.end && start + visit > blk.start) start = blk.end + (blk.point && item.point ? estimateTravel(blk.point, item.point, input.mode).minutes : 0);
      const end = start + visit;
      if (end > dayEnd) {
        unassigned.push({ place: p, reason: "Sem tempo no dia depois dos compromissos" });
        continue;
      }
      stops.push({ place: p, start, end, visit, visitEstimated: input.durations?.[p.id] === undefined, travel, notes });
      conflicts.push(...conflictsFor.splice(0));
      cursor = end + limits.buffer;
      at = item.point;
    }
    conflictsFor.splice(0);
    // Meals not reached by the visits: keep the break at the preferred time if it is free.
    if (stops.length)
      for (const m of meals) {
        const mAt = toMinutes(m.at)!;
        if (placedMeals.has(m.kind) || mAt < dayStart || mAt + m.minutes > dayEnd) continue;
        const clash = [...stops.map((x) => [x.start, x.end]), ...busy.map((x) => [x.start, x.end])].some(([a, z]) => a < mAt + m.minutes && z > mAt);
        if (!clash) busy.push({ start: mAt, end: mAt + m.minutes, title: m.kind, kind: "meal", meal: m.kind });
      }
    return { day: b.day, date: b.date, base: b.point, baseName: b.name, stops, busy: busy.sort((x, y) => x.start - y.start), conflicts };
  });

  const all = plans.flatMap((d) => d.stops);
  return {
    strategy,
    days: plans,
    unassigned,
    warnings: [
      ...(bases.some((b) => b.missing) ? ["Dias sem hospedagem cadastrada não recebem lugares automaticamente. Cadastre a hospedagem ou escolha o dia de cada lugar."] : []),
      "Deslocamentos estimados pela distância em linha reta e velocidade média do meio de transporte; não são rotas reais.",
      "Duração das visitas estimada pela categoria do lugar; ajuste antes de salvar.",
    ],
    summary: {
      daysUsed: plans.filter((d) => d.stops.length).length,
      places: all.length,
      leftOut: unassigned.length,
      travelMinutes: all.reduce((s, x) => s + x.travel.minutes, 0),
      travelKm: Math.round(all.reduce((s, x) => s + x.travel.km, 0) * 10) / 10,
      conflicts: plans.reduce((s, d) => s + d.conflicts.length, 0),
      free: all.filter((x) => price(x.place) === "free").length,
      paid: all.filter((x) => price(x.place) === "paid").length,
      unknownPrice: all.filter((x) => price(x.place) === "unknown").length,
    },
  };
}

export function planAlternatives(trip: Trip, input: PlannerInput): Plan[] {
  return (["fast", "budget", "relaxed"] as Strategy[]).map((strategy) =>
    planItinerary(trip, {
      ...input,
      strategy,
      meals: strategy === "relaxed" ? input.meals.map((m) => ({ ...m, minutes: Math.max(m.minutes, 90) })) : input.meals,
    }),
  );
}

/** Activities that the plan would add (existing ones are never changed). */
export function planActivities(plan: Plan): Activity[] {
  return plan.days.flatMap((d) =>
    d.stops.map((s) => ({
      id: uid(),
      placeId: s.place.id,
      source: s.place.source || undefined,
      coordinates: s.place.coordinates,
      title: s.place.name,
      day: d.day,
      time: toClock(s.start),
      address: [s.place.address, s.place.city, s.place.country].filter(Boolean).join(", "),
      done: false,
      kind: categories[s.place.category] || "Passeio",
      period: s.start < 12 * 60 ? ("morning" as const) : s.start < 18 * 60 ? ("afternoon" as const) : ("evening" as const),
    })),
  );
}

/** Applies a plan: keeps every existing activity and never adds a place twice. */
export function applyPlan(trip: Trip, plan: Plan): Trip {
  const existing = new Set(trip.activities.map((a) => a.placeId).filter(Boolean));
  const added = planActivities(plan).filter((a) => !existing.has(a.placeId));
  return { ...trip, activities: [...trip.activities, ...added] };
}

/** Before/after count of activities per day. */
export function changesByDay(trip: Trip, plan: Plan) {
  return plan.days.map((d) => ({
    day: d.day,
    before: trip.activities.filter((a) => a.day === d.day).length,
    added: d.stops.length,
  }));
}
