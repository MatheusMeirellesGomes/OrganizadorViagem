import {
  catalogQuery,
  normalizePlaces,
  type Place,
  type Point,
  type CatalogKind,
} from "./places";
import { getLocale } from "./i18n";
import {
  findDestination,
  searchWikipediaAttractions,
  type WikiLanguage,
} from "./wiki-places";
import {
  attractionPhrases,
  foodPhrases,
  mergePlaces,
  searchNominatim,
} from "./osm-places";

const env =
  (import.meta as unknown as { env?: Record<string, string | boolean> }).env ||
  {};

/*
 * Sources (tested live on 11/11/2026):
 * - Attractions: Wikipedia + Wikidata + Commons (wiki-places.ts), with an
 *   optional complement from OpenStreetMap via Nominatim (osm-places.ts).
 * - Restaurants: OpenStreetMap via Nominatim.
 * - The public Overpass servers answered "at capacity" or timed out, so they
 *   are no longer used. An own Overpass server can be set in
 *   VITE_OVERPASS_URL; then restaurants come from it (more complete).
 */
export const overpassEndpoints: string[] = [
  typeof env.VITE_OVERPASS_URL === "string" ? env.VITE_OVERPASS_URL.trim() : "",
].filter((url) => /^https:\/\//.test(url));

const CACHE_KEY = "gomes-catalog-cache-v2";
const DAY = 86400000;

export type CatalogResult = {
  places: Place[];
  retrievedAt: string;
  cached: boolean;
  provider: "wikipedia" | "openstreetmap";
  /** True when OpenStreetMap places were added to a Wikipedia result. */
  complemented?: boolean;
};

export class CatalogError extends Error {}

export function wikiLanguage(locale = getLocale()): WikiLanguage {
  return locale === "en" ? "en" : locale === "es" ? "es" : "pt";
}

type Options = {
  storage?: Storage;
  fetcher?: typeof fetch;
  /** Own Overpass servers; when empty, Nominatim is used for restaurants. */
  endpoints?: string[];
  nominatim?: string;
  language?: WikiLanguage;
  timeoutMs?: number;
  gapMs?: number;
  onProgress?: (done: number, total: number) => void;
};

let requesting = false;

function readCache(storage: Storage): Record<string, CatalogResult> {
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeCache(
  storage: Storage,
  cache: Record<string, CatalogResult>,
) {
  const recent = Object.entries(cache)
    .sort((a, b) => b[1].retrievedAt.localeCompare(a[1].retrievedAt))
    .slice(0, 6);
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    /* no quota: results are still shown */
  }
}

async function overpassFrom(
  endpoint: string,
  query: string,
  fetcher: typeof fetch,
  stop: AbortSignal,
  timeoutMs: number,
): Promise<Place[]> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.any([stop, AbortSignal.timeout(timeoutMs)]),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  // Partial answers (remark) are rejected by normalizePlaces.
  return normalizePlaces(await response.json());
}

/** Tries the servers two at a time; the first complete answer wins. */
export async function queryOverpass(
  query: string,
  endpoints: string[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 25000,
): Promise<Place[]> {
  if (!endpoints.length)
    throw new CatalogError("Nenhum servidor de restaurantes configurado.");
  for (let i = 0; i < endpoints.length; i += 2) {
    const stop = new AbortController();
    try {
      return await Promise.any(
        endpoints
          .slice(i, i + 2)
          .map((e) => overpassFrom(e, query, fetcher, stop.signal, timeoutMs)),
      );
    } catch {
      // Both failed: try the next pair.
    } finally {
      stop.abort();
    }
  }
  throw new CatalogError(
    "Os servidores públicos de restaurantes estão ocupados agora. Tente de novo em alguns minutos ou pesquise no Google Maps.",
  );
}

export async function searchCatalog(
  point: Point,
  radius: number,
  kind: CatalogKind,
  options: Options = {},
): Promise<CatalogResult> {
  const {
    storage = localStorage,
    fetcher = fetch,
    endpoints = overpassEndpoints,
    language = wikiLanguage(),
    timeoutMs = 25000,
  } = options;
  const query = catalogQuery(point, radius, kind); // also validates point/radius
  const key =
    kind === "food"
      ? "osm|" + query
      : `wiki|${language}|${point.lat.toFixed(4)},${point.lng.toFixed(4)}|${radius}`;
  const cache = readCache(storage);
  const old = cache[key];
  if (
    old &&
    Array.isArray(old.places) &&
    Date.now() - Date.parse(old.retrievedAt) < DAY
  )
    return { ...old, cached: true };
  if (requesting)
    throw new CatalogError("Aguarde a consulta anterior terminar.");
  requesting = true;
  try {
    let places: Place[];
    if (kind === "food") {
      places = endpoints.length
        ? await queryOverpass(query, endpoints, fetcher, timeoutMs)
        : await searchNominatim(point, radius, foodPhrases, {
            fetcher,
            endpoint: options.nominatim,
            language,
            gapMs: options.gapMs,
            onProgress: options.onProgress,
          }).catch(() => {
            throw new CatalogError(
              "Não foi possível consultar o OpenStreetMap agora. Tente de novo em alguns minutos ou pesquise no Google Maps.",
            );
          });
    } else {
      try {
        places = await searchWikipediaAttractions(point, radius, language, fetcher);
      } catch {
        throw new CatalogError(
          "Não foi possível consultar a Wikipédia agora. Verifique a conexão e tente novamente.",
        );
      }
    }
    const result: CatalogResult = {
      places,
      retrievedAt: new Date().toISOString(),
      cached: false,
      provider: kind === "food" ? "openstreetmap" : "wikipedia",
    };
    cache[key] = result;
    writeCache(storage, cache);
    return result;
  } finally {
    requesting = false;
  }
}

/** Adds OpenStreetMap attractions (museums, parks, viewpoints...) to a Wikipedia result. */
export async function complementAttractions(
  point: Point,
  radius: number,
  base: CatalogResult,
  options: Options = {},
): Promise<CatalogResult> {
  const { storage = localStorage, fetcher = fetch, language = wikiLanguage() } =
    options;
  const key = `osm-extra|${point.lat.toFixed(4)},${point.lng.toFixed(4)}|${radius}`;
  const cache = readCache(storage);
  let extra = cache[key];
  if (
    !extra ||
    !Array.isArray(extra.places) ||
    Date.now() - Date.parse(extra.retrievedAt) >= DAY
  ) {
    if (requesting)
      throw new CatalogError("Aguarde a consulta anterior terminar.");
    requesting = true;
    try {
      const places = await searchNominatim(point, radius, attractionPhrases, {
        fetcher,
        endpoint: options.nominatim,
        language,
        gapMs: options.gapMs,
        onProgress: options.onProgress,
      });
      extra = {
        places,
        retrievedAt: new Date().toISOString(),
        cached: false,
        provider: "openstreetmap",
      };
      cache[key] = extra;
      writeCache(storage, cache);
    } catch {
      throw new CatalogError(
        "Não foi possível consultar o OpenStreetMap agora. Os resultados da Wikipédia continuam disponíveis.",
      );
    } finally {
      requesting = false;
    }
  }
  return {
    ...base,
    places: mergePlaces(base.places, extra.places),
    complemented: true,
  };
}

export async function locateDestination(
  title: string,
  fetcher: typeof fetch = fetch,
  language = wikiLanguage(),
): Promise<{ name: string; point: { lat: number; lng: number }; source: string }> {
  if (!title.trim())
    throw new CatalogError("Digite uma cidade ou escolha um ponto no mapa.");
  let found;
  try {
    found =
      (await findDestination(title, language, fetcher)) ??
      (language !== "pt" ? await findDestination(title, "pt", fetcher) : undefined);
  } catch {
    throw new CatalogError(
      "Não foi possível localizar pela Wikipédia. Escolha um ponto no mapa.",
    );
  }
  if (!found)
    throw new CatalogError(
      "Destino não encontrado. Tente o nome completo ou marque o mapa.",
    );
  return found;
}
