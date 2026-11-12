import { distanceKm, type Place, type Point } from "../places";
import { attractionGroups, familyCategories, indoorCategories, outdoorCategories } from "./categories";
import { matchesCuisine, matchesMeal, openNow, priceLevel, type Meal } from "./restaurants";
import { verifiedPhoto } from "./photos";

export type ExploreKind = "attractions" | "food";
export type SortKey = "relevance" | "distance" | "name" | "price";

export type Filters = {
  text: string;
  groups: string[];
  fee: "all" | "free" | "paid";
  maxKm: number;
  setting: "all" | "indoor" | "outdoor";
  family: boolean;
  accessible: boolean;
  withPhoto: boolean;
  meals: Meal[];
  cuisines: string[];
  prices: number[];
  openNow: boolean;
  vegetarian: boolean;
  reservation: boolean;
  /** Keep places that do not have the information a filter needs. */
  includeUnknown: boolean;
  sort: SortKey;
};

export const emptyFilters = (kind: ExploreKind): Filters => ({
  text: "",
  groups: [],
  fee: "all",
  maxKm: 20,
  setting: "all",
  family: false,
  accessible: false,
  withPhoto: false,
  meals: [],
  cuisines: [],
  prices: [],
  openNow: false,
  vegetarian: false,
  reservation: false,
  includeUnknown: true,
  sort: kind === "food" ? "distance" : "relevance",
});

/** Number of filters in use (shown on the "Limpar filtros" button). */
export function activeCount(f: Filters, kind: ExploreKind) {
  const base = emptyFilters(kind);
  return (Object.keys(base) as (keyof Filters)[]).filter(
    (k) => k !== "sort" && k !== "includeUnknown" && JSON.stringify(f[k]) !== JSON.stringify(base[k]),
  ).length;
}

const fold = (s: string) =>
  s.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** A tri-state check: unknown passes only when the person asked to include unknowns. */
const ok = (value: boolean | undefined, includeUnknown: boolean) =>
  value === true || (value === undefined && includeUnknown);

export function applyFilters(
  places: Place[],
  f: Filters,
  kind: ExploreKind,
  center?: Point,
  now = new Date(),
): Place[] {
  const text = fold(f.text.trim());
  const groups = attractionGroups.filter((g) => f.groups.includes(g.id)).flatMap((g) => g.categories);
  const out = places.filter((p) => {
    if (text && !fold([p.name, p.tags.official_name, p.tags.description, p.tags.cuisine].filter(Boolean).join(" ")).includes(text))
      return false;
    if (center && distanceKm(center, p.coordinates) > f.maxKm) return false;
    if (f.withPhoto && !verifiedPhoto(p)) return false;
    if (f.accessible && !ok(p.tags.wheelchair ? p.tags.wheelchair === "yes" : undefined, false)) return false;
    if (kind === "attractions") {
      if (groups.length && !groups.includes(p.category)) return false;
      if (f.fee === "free" && !ok(p.tags.fee ? p.tags.fee === "no" : undefined, f.includeUnknown)) return false;
      if (f.fee === "paid" && !ok(p.tags.fee ? p.tags.fee === "yes" : undefined, f.includeUnknown)) return false;
      if (f.setting === "indoor" && !indoorCategories.has(p.category)) return false;
      if (f.setting === "outdoor" && !outdoorCategories.has(p.category)) return false;
      if (f.family && !familyCategories.has(p.category)) return false;
    } else {
      if (f.meals.length && !f.meals.some((m) => ok(matchesMeal(p, m), f.includeUnknown))) return false;
      if (!matchesCuisine(p, f.cuisines)) return false;
      if (f.prices.length) {
        const level = priceLevel(p);
        if (!(level ? f.prices.includes(level) : f.includeUnknown)) return false;
      }
      if (f.openNow && openNow(p, now) !== true) return false;
      if (f.vegetarian && !["yes", "only"].includes(p.tags["diet:vegetarian"] ?? "")) return false;
      if (f.reservation && !["yes", "recommended", "required"].includes(p.tags.reservation ?? "")) return false;
      if (f.family && !["yes"].includes(p.tags.kids_area ?? p.tags.highchair ?? p.tags["kids"] ?? "")) return false;
    }
    return true;
  });
  return sortPlaces(out, f.sort, center);
}

export function sortPlaces(places: Place[], sort: SortKey, center?: Point): Place[] {
  const list = [...places];
  const relevance = (p: Place) => Number(p.tags.sitelinks || 0);
  if (sort === "distance" && center)
    list.sort((a, b) => distanceKm(center, a.coordinates) - distanceKm(center, b.coordinates));
  else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "price") {
    // Free first, then by price; places without a price go last.
    const price = (p: Place) =>
      p.tags.fee === "no" ? 0 : p.tags.charge ? Number(p.tags.charge) : priceLevel(p) ?? Infinity;
    list.sort((a, b) => price(a) - price(b));
  } else if (sort === "relevance") list.sort((a, b) => relevance(b) - relevance(a));
  return list;
}

/* Recent searches and saved filters stay on this device only. */
const KEY = "gomes-explorar-v1";
type Stored = {
  recent: { name: string; point: Point }[];
  saved: { name: string; kind: ExploreKind; filters: Filters }[];
};
function read(storage: Storage | undefined): Stored {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "{}");
    return { recent: Array.isArray(v.recent) ? v.recent : [], saved: Array.isArray(v.saved) ? v.saved : [] };
  } catch {
    return { recent: [], saved: [] };
  }
}
function write(storage: Storage | undefined, data: Stored) {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* no storage: nothing is remembered */
  }
}
const store = () => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

export function recentSearches(storage = store()) {
  return read(storage).recent;
}
export function rememberSearch(name: string, point: Point, storage = store()) {
  const data = read(storage);
  data.recent = [{ name, point }, ...data.recent.filter((r) => r.name !== name)].slice(0, 6);
  write(storage, data);
}
export function savedFilters(storage = store()) {
  return read(storage).saved;
}
export function saveFilters(name: string, kind: ExploreKind, filters: Filters, storage = store()) {
  const data = read(storage);
  data.saved = [{ name, kind, filters }, ...data.saved.filter((s) => s.name !== name)].slice(0, 8);
  write(storage, data);
}
export function forgetHistory(storage = store()) {
  write(storage, { recent: [], saved: [] });
}
