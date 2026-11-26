import { distanceKm, type Place, type Point } from "../places";
import { openNow, walkMinutes } from "./nearby";

/*
 * "O que fazer agora?" e roteiro espontâneo, por regras simples e dados reais:
 * distância, categoria, horário registrado e o tempo que a pessoa tem.
 * Os tempos de caminhada e de visita são estimativas e aparecem como tal.
 */

/** Tempo típico de visita por categoria, em minutos (estimativa). */
export const visitMinutes: Record<string, number> = {
  museum: 90, gallery: 60, palace: 75, castle: 75, zoo: 150, aquarium: 90, theme_park: 240, archaeological_site: 60,
  park: 40, garden: 40, nature: 60, beach: 90, viewpoint: 20, mountain: 120, trail: 120, waterfall: 45,
  monument: 15, memorial: 15, square: 15, historic_center: 60, historic: 20, place_of_worship: 25, marketplace: 40,
  culture: 90, stadium: 60, attraction: 30, restaurant: 60, cafe: 30, bakery: 20, pastry: 20, ice_cream: 15, fast_food: 25, food_court: 40,
};
export const visitOf = (p: Place) => visitMinutes[p.category] ?? 30;

const FOOD = ["restaurant", "cafe", "bakery", "pastry", "ice_cream", "fast_food", "food_court"];
const HISTORIC = ["palace", "castle", "monument", "memorial", "archaeological_site", "historic_center", "historic", "place_of_worship", "square"];
const OUTDOOR = ["park", "garden", "nature", "beach", "viewpoint", "mountain", "trail", "waterfall", "square", "zoo"];
const INDOOR = ["museum", "gallery", "aquarium", "palace", "castle", "culture", "marketplace", "place_of_worship", "food_court", "cafe", "restaurant"];

export type Preset = { id: string; label: string; minutes?: number; categories?: string[]; free?: boolean };
export const presets: Preset[] = [
  { id: "t30", label: "Tenho 30 minutos", minutes: 30 },
  { id: "t60", label: "Tenho 1 hora", minutes: 60 },
  { id: "t120", label: "Tenho 2 horas", minutes: 120 },
  { id: "t180", label: "Tenho 3 horas", minutes: 180 },
  { id: "day", label: "Tenho o dia inteiro", minutes: 480 },
  { id: "free", label: "Quero algo gratuito", free: true },
  { id: "eat", label: "Quero comer", categories: FOOD },
  { id: "history", label: "Quero um lugar histórico", categories: HISTORIC },
  { id: "outdoor", label: "Quero passear ao ar livre", categories: OUTDOOR },
  { id: "rain", label: "Está chovendo", categories: INDOOR },
];

export type Suggestion = { place: Place; km: number; walk: number; visit: number; open?: boolean; why: string[] };

/** Sugestões para agora, mais perto primeiro, sem lugares fechados (quando o horário diz). */
export function suggestNow(places: Place[], from: Point, preset: Preset, visited: Set<string>, now = new Date()): Suggestion[] {
  const out: Suggestion[] = [];
  for (const place of places) {
    if (visited.has(place.id) || place.category.startsWith("svc:")) continue;
    if (preset.categories && !preset.categories.includes(place.category)) continue;
    if (preset.free && place.tags.fee !== "no") continue;
    const open = openNow(place, now);
    if (open === false) continue;
    const km = distanceKm(from, place.coordinates);
    const walk = walkMinutes(km);
    const visit = visitOf(place);
    // Ida + visita precisam caber no tempo (a volta fica por conta da pessoa).
    if (preset.minutes && walk + visit > preset.minutes) continue;
    const why: string[] = [];
    if (open) why.push("Aberto agora");
    if (place.tags.fee === "no") why.push("Gratuito");
    out.push({ place, km, walk, visit, open, why });
  }
  // Abertos confirmados primeiro, depois distância.
  return out.sort((a, b) => Number(b.open === true) - Number(a.open === true) || a.km - b.km).slice(0, 30);
}

export type Stop = { place: Place; walk: number; visit: number; arrive: number };
export type WalkPlan = { stops: Stop[]; walkMinutes: number; visitMinutes: number; totalMinutes: number; km: number };

/**
 * Roteiro a pé a partir de onde a pessoa está: escolhe o próximo lugar mais
 * perto que ainda cabe no tempo. Com `endWithFood`, termina num café ou
 * restaurante se houver um perto da última parada.
 */
export function planWalk(
  places: Place[],
  from: Point,
  minutes: number,
  options: { categories?: string[]; endWithFood?: boolean; maxStops?: number; visited?: Set<string>; now?: Date } = {},
): WalkPlan {
  const { categories, endWithFood = false, maxStops = 6, visited = new Set(), now = new Date() } = options;
  const usable = places.filter(
    (p) => !visited.has(p.id) && !p.category.startsWith("svc:") && openNow(p, now) !== false && (!categories || categories.includes(p.category) || FOOD.includes(p.category)),
  );
  const sights = usable.filter((p) => !FOOD.includes(p.category));
  const food = usable.filter((p) => FOOD.includes(p.category));
  const stops: Stop[] = [];
  let here = from,
    used = 0,
    km = 0;
  const reserve = endWithFood && food.length ? 35 : 0;
  while (stops.length < maxStops) {
    let best: { p: Place; walk: number; d: number } | undefined;
    for (const p of sights) {
      if (stops.some((s) => s.place.id === p.id)) continue;
      const d = distanceKm(here, p.coordinates);
      const walk = walkMinutes(d);
      if (used + walk + visitOf(p) + reserve > minutes) continue;
      if (!best || d < best.d) best = { p, walk, d };
    }
    if (!best) break;
    stops.push({ place: best.p, walk: best.walk, visit: visitOf(best.p), arrive: used + best.walk });
    used += best.walk + visitOf(best.p);
    km += best.d;
    here = best.p.coordinates;
  }
  if (endWithFood && food.length) {
    const near = food
      .map((p) => ({ p, d: distanceKm(here, p.coordinates) }))
      .sort((a, b) => a.d - b.d)
      .find(({ p, d }) => used + walkMinutes(d) + Math.min(visitOf(p), 30) <= minutes);
    if (near) {
      const walk = walkMinutes(near.d);
      const visit = Math.min(visitOf(near.p), 30);
      stops.push({ place: near.p, walk, visit, arrive: used + walk });
      used += walk + visit;
      km += near.d;
    }
  }
  const walkTotal = stops.reduce((s, x) => s + x.walk, 0);
  return { stops, walkMinutes: walkTotal, visitMinutes: used - walkTotal, totalMinutes: used, km: Math.round(km * 10) / 10 };
}

/** Move uma parada e recalcula os tempos de caminhada na nova ordem. */
export function reorder(plan: WalkPlan, from: Point, index: number, delta: number): WalkPlan {
  const list = plan.stops.map((s) => s.place);
  const to = index + delta;
  if (to < 0 || to >= list.length) return plan;
  [list[index], list[to]] = [list[to], list[index]];
  return recompute(list, from);
}
export function removeStop(plan: WalkPlan, from: Point, index: number): WalkPlan {
  return recompute(plan.stops.filter((_, i) => i !== index).map((s) => s.place), from);
}
function recompute(list: Place[], from: Point): WalkPlan {
  let here = from,
    used = 0,
    km = 0;
  const stops = list.map((place) => {
    const d = distanceKm(here, place.coordinates);
    const walk = walkMinutes(d);
    const stop = { place, walk, visit: visitOf(place), arrive: used + walk };
    used += walk + stop.visit;
    km += d;
    here = place.coordinates;
    return stop;
  });
  const walkTotal = stops.reduce((s, x) => s + x.walk, 0);
  return { stops, walkMinutes: walkTotal, visitMinutes: used - walkTotal, totalMinutes: used, km: Math.round(km * 10) / 10 };
}
