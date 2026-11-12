import type { Place } from "../places";
import { isOpenAt, opensDuring, parseOpeningHours, type Week } from "./hours";

/*
 * Food discovery on OpenStreetMap data. Every filter uses only what is
 * registered: a restaurant is never called cheap, open or vegetarian without
 * the tag that says so. Places without the information are counted and can be
 * included with "inclusive sem informação".
 */

export type Meal =
  | "breakfast"
  | "brunch"
  | "lunch"
  | "afternoon"
  | "dinner"
  | "dessert"
  | "cafe"
  | "bakery"
  | "ice_cream"
  | "traditional"
  | "fast_food";

export const mealLabels: Record<Meal, string> = {
  breakfast: "Café da manhã",
  brunch: "Brunch",
  lunch: "Almoço",
  afternoon: "Café da tarde",
  dinner: "Jantar",
  dessert: "Sobremesas",
  cafe: "Cafeterias",
  bakery: "Padarias",
  ice_cream: "Sorveterias",
  traditional: "Restaurantes tradicionais",
  fast_food: "Comida rápida",
};

/** Nominatim search phrases needed for each kind of meal. */
export const mealPhrases: Record<Meal, string[]> = {
  breakfast: ["cafe", "bakery"],
  brunch: ["cafe", "restaurant"],
  lunch: ["restaurant"],
  afternoon: ["cafe", "bakery"],
  dinner: ["restaurant"],
  dessert: ["ice cream", "pastry shop"],
  cafe: ["cafe"],
  bakery: ["bakery"],
  ice_cream: ["ice cream"],
  traditional: ["restaurant"],
  fast_food: ["fast food"],
};

export function phrasesFor(meals: Meal[]): string[] {
  const list = meals.length ? meals.flatMap((m) => mealPhrases[m]) : ["restaurant", "cafe", "fast food", "bakery"];
  return [...new Set(list)];
}

/** Meal times (minutes of the day) used with registered opening hours. */
const mealWindows: Partial<Record<Meal, [number, number]>> = {
  breakfast: [7 * 60, 10 * 60],
  brunch: [10 * 60, 13 * 60],
  lunch: [12 * 60 + 30, 15 * 60],
  afternoon: [15 * 60 + 30, 18 * 60],
  dinner: [20 * 60, 22 * 60 + 30],
};

const cuisinesOf = (p: Place) =>
  (p.tags.cuisine || "").toLowerCase().split(/[;,]/).map((c) => c.trim()).filter(Boolean);

/** Country → its own cuisine value in OpenStreetMap, for "traditional". */
const nationalCuisine: Record<string, string[]> = {
  ES: ["spanish", "tapas", "basque", "catalan", "galician", "andalusian"],
  PT: ["portuguese"],
  BR: ["brazilian", "mineira", "regional_brazilian", "churrasco"],
  FR: ["french"],
  IT: ["italian", "pizza"],
  MX: ["mexican"],
  JP: ["japanese"],
  GR: ["greek"],
};

export const hoursCache = new WeakMap<Place, Week | null>();
export function hoursOf(p: Place): Week | undefined {
  if (!hoursCache.has(p)) hoursCache.set(p, parseOpeningHours(p.tags.opening_hours) ?? null);
  return hoursCache.get(p) ?? undefined;
}

/** True/false when the data allows saying; undefined when it does not. */
export function matchesMeal(p: Place, meal: Meal): boolean | undefined {
  const t = p.tags,
    cuisines = cuisinesOf(p),
    cat = p.category;
  switch (meal) {
    case "cafe":
      return cat === "cafe" || cuisines.includes("coffee_shop");
    case "bakery":
      return cat === "bakery" || cat === "pastry";
    case "ice_cream":
      return cat === "ice_cream" || cuisines.includes("ice_cream");
    case "fast_food":
      return cat === "fast_food";
    case "dessert":
      return ["ice_cream", "pastry"].includes(cat) || cuisines.some((c) => ["dessert", "cake", "crepe", "chocolate", "pastry", "ice_cream", "waffle"].includes(c));
    case "traditional": {
      if (cuisines.some((c) => ["regional", "traditional", "local"].includes(c))) return true;
      const own = nationalCuisine[t.country_code ?? ""];
      if (own && cuisines.some((c) => own.includes(c))) return true;
      return cuisines.length ? false : undefined;
    }
    default: {
      if (t[meal] === "yes" || cuisines.includes(meal)) return true;
      if (t[meal] === "no") return false;
      const week = hoursOf(p),
        window = mealWindows[meal];
      if (!week || !window) return;
      const right =
        meal === "lunch" || meal === "dinner"
          ? ["restaurant", "fast_food", "food_court"].includes(cat)
          : ["cafe", "bakery", "pastry", "restaurant"].includes(cat);
      return right && opensDuring(week, window[0], window[1]);
    }
  }
}

/** €, €€, €€€, €€€€ when the place has a registered price range. */
export function priceLevel(p: Place): number | undefined {
  const v = (p.tags.price_range || p.tags["price:range"] || p.tags.price_level || "").trim();
  if (!v) return;
  if (/^(?:R\$|[€$£¥])+$/.test(v)) {
    const n = v.replace(/R\$/g, "$").length;
    return n >= 1 && n <= 4 ? n : undefined;
  }
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
  return;
}

export const cuisineOptions: { id: string; label: string; values: string[] }[] = [
  { id: "spanish", label: "Espanhola", values: ["spanish", "tapas", "basque", "catalan", "galician", "andalusian"] },
  { id: "portuguese", label: "Portuguesa", values: ["portuguese"] },
  { id: "italian", label: "Italiana", values: ["italian", "pizza", "pasta"] },
  { id: "brazilian", label: "Brasileira", values: ["brazilian", "mineira", "churrasco", "regional_brazilian"] },
  { id: "japanese", label: "Japonesa", values: ["japanese", "sushi", "ramen"] },
  { id: "chinese", label: "Chinesa", values: ["chinese"] },
  { id: "mexican", label: "Mexicana", values: ["mexican", "tex-mex"] },
  { id: "mediterranean", label: "Mediterrânea", values: ["mediterranean", "greek", "lebanese"] },
  { id: "vegetarian", label: "Vegetariana", values: ["vegetarian"] },
  { id: "vegan", label: "Vegana", values: ["vegan"] },
];

export function matchesCuisine(p: Place, ids: string[]): boolean {
  if (!ids.length) return true;
  const cuisines = cuisinesOf(p);
  const known = cuisineOptions.flatMap((o) => o.values);
  return ids.some((id) => {
    if (id === "other") return cuisines.some((c) => !known.includes(c));
    const option = cuisineOptions.find((o) => o.id === id);
    if (!option) return false;
    if (id === "vegetarian" && p.tags["diet:vegetarian"] === "only") return true;
    if (id === "vegan" && p.tags["diet:vegan"] === "only") return true;
    return cuisines.some((c) => option.values.includes(c));
  });
}

/** Time zones of countries with a single zone (or a clear main one). */
const zones: Record<string, string> = {
  ES: "Europe/Madrid", PT: "Europe/Lisbon", FR: "Europe/Paris", IT: "Europe/Rome", DE: "Europe/Berlin",
  GB: "Europe/London", IE: "Europe/Dublin", NL: "Europe/Amsterdam", BE: "Europe/Brussels", CH: "Europe/Zurich",
  AT: "Europe/Vienna", GR: "Europe/Athens", JP: "Asia/Tokyo", AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago", UY: "America/Montevideo", CO: "America/Bogota", PE: "America/Lima",
};

/** Minute of the week in the place's own time zone, when it is known. */
export function localMinuteOfWeek(countryCode: string | undefined, lng: number, now = new Date()) {
  let zone = zones[(countryCode || "").toUpperCase()];
  // Brazil: almost all visited cities follow Brasília time (east of -50°).
  if (!zone && countryCode?.toUpperCase() === "BR" && lng > -50) zone = "America/Sao_Paulo";
  // Canary Islands are one hour behind mainland Spain.
  if (zone === "Europe/Madrid" && lng < -12) zone = "Atlantic/Canary";
  if (!zone) return;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  if (day < 0) return;
  return day * 1440 + Number(get("hour")) * 60 + Number(get("minute"));
}

/** Open now in local time: true/false, or undefined without reliable hours. */
export function openNow(p: Place, now = new Date()): boolean | undefined {
  const week = hoursOf(p);
  if (!week) return;
  const minute = localMinuteOfWeek(p.tags.country_code, p.coordinates.lng, now);
  if (minute === undefined) return;
  return isOpenAt(week, minute);
}
