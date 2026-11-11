import { distanceKm, normalizePlaces, type Place, type Point } from "./places";

/*
 * OpenStreetMap places through Nominatim (restaurants, and extra attractions
 * for towns with few Wikipedia articles).
 *
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 * - at most 1 request per second (we wait 1.1 s between requests);
 * - only searches the person starts by clicking; never autocomplete;
 * - results are cached for 24 h by catalog-service.ts;
 * - the browser sends the site's Referer, which identifies the app;
 * - the service can be switched off (VITE_NOMINATIM_URL="off") or replaced
 *   by an own/commercial Nominatim-compatible server, as the policy asks for
 *   applications with more traffic.
 */

const env =
  (import.meta as unknown as { env?: Record<string, string | boolean> }).env ||
  {};
const configured =
  typeof env.VITE_NOMINATIM_URL === "string" ? env.VITE_NOMINATIM_URL.trim() : "";
export const nominatimEndpoint =
  configured === "off"
    ? ""
    : /^https:\/\//.test(configured)
      ? configured.replace(/\/+$/, "")
      : "https://nominatim.openstreetmap.org";

/** Search phrases (Nominatim "special phrases") per kind of place. */
export const foodPhrases = ["restaurant", "cafe", "fast food"];
export const attractionPhrases = [
  "attraction",
  "museum",
  "viewpoint",
  "theme park",
  "waterfall",
  "park",
];

type NominatimItem = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
};

/** Turns a Nominatim answer into the element format normalizePlaces reads. */
export function toOsmElements(items: NominatimItem[]) {
  return items.map((item) => {
    const a = item.address ?? {};
    const tags: Record<string, string> = { ...(item.extratags ?? {}) };
    if (item.name) tags.name = item.name;
    if (item.category && item.type) tags[item.category] = item.type;
    const street = a.road ?? a.pedestrian ?? a.footway;
    if (street) tags["addr:street"] = street;
    if (a.house_number) tags["addr:housenumber"] = a.house_number;
    if (a.suburb ?? a.neighbourhood) tags["addr:suburb"] = (a.suburb ?? a.neighbourhood)!;
    const city = a.city ?? a.town ?? a.village ?? a.municipality;
    if (city) tags["addr:city"] = city;
    if (a.country) tags["addr:country"] = a.country;
    return {
      type: item.osm_type,
      id: item.osm_id,
      lat: Number(item.lat),
      lon: Number(item.lon),
      tags,
    };
  });
}

export function viewbox(point: Point, radius: number) {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.max(0.01, Math.cos((point.lat * Math.PI) / 180)));
  return [point.lng - dLng, point.lat + dLat, point.lng + dLng, point.lat - dLat]
    .map((n) => n.toFixed(5))
    .join(",");
}

let lastRequest = 0;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchNominatim(
  point: Point,
  radius: number,
  phrases: string[],
  options: {
    fetcher?: typeof fetch;
    endpoint?: string;
    language?: string;
    gapMs?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<Place[]> {
  const {
    fetcher = fetch,
    endpoint = nominatimEndpoint,
    language = "pt",
    gapMs = 1100,
    onProgress,
  } = options;
  if (!endpoint) throw new Error("OpenStreetMap search is switched off.");
  const items: NominatimItem[] = [];
  let failures = 0;
  for (const [i, phrase] of phrases.entries()) {
    const pause = lastRequest + gapMs - Date.now();
    if (pause > 0) await wait(pause);
    lastRequest = Date.now();
    const params = new URLSearchParams({
      q: phrase,
      format: "jsonv2",
      viewbox: viewbox(point, radius),
      bounded: "1",
      limit: "40",
      extratags: "1",
      addressdetails: "1",
      "accept-language": language,
    });
    try {
      const response = await fetcher(`${endpoint}/search?${params}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      if (Array.isArray(json)) items.push(...json);
    } catch {
      failures++;
    }
    onProgress?.(i + 1, phrases.length);
  }
  if (failures === phrases.length) throw new Error("OpenStreetMap unavailable");
  const retrievedAt = new Date().toISOString();
  const places = normalizePlaces({ elements: toOsmElements(items) }, retrievedAt)
    .filter((p) => distanceKm(point, p.coordinates) * 1000 <= radius)
    .map((p) => ({ ...p, tags: { ...p.tags, provider: "openstreetmap" } }));
  return withoutParkExhibits(places);
}

/**
 * Theme parks such as Mini Mundo map each miniature as tourism=attraction
 * ("Castelo de Neuschwanstein" in Gramado). Generic attractions very close to
 * a theme park are treated as part of it and hidden.
 */
export function withoutParkExhibits(places: Place[]): Place[] {
  const parks = places.filter((p) => p.category === "theme_park");
  return places.filter(
    (p) =>
      p.category !== "attraction" ||
      !parks.some((park) => distanceKm(park.coordinates, p.coordinates) < 0.15),
  );
}

const simple = (name: string) =>
  name
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Adds OSM places that are not already in the list (same Wikidata item or same name nearby). */
export function mergePlaces(base: Place[], extra: Place[]): Place[] {
  const result = [...base];
  for (const p of extra) {
    const duplicate = result.some(
      (q) =>
        q.id === p.id ||
        (p.tags.wikidata && q.tags.wikidata === p.tags.wikidata) ||
        (simple(q.name) === simple(p.name) &&
          distanceKm(q.coordinates, p.coordinates) < 0.3),
    );
    if (!duplicate) result.push(p);
  }
  return result;
}
