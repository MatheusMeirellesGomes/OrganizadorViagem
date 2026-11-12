import type { Place, Point } from "../places";
import { fetchImageCredits } from "../wiki-places";
import { attractionPhrases, mergePlaces, searchNominatim } from "../osm-places";
import { fetchDetails, findAttractions, toPlace, type Candidate } from "./wikidata";
import { withUniquePhotos } from "./photos";
import { phrasesFor, type Meal } from "./restaurants";

/*
 * Searches for the Explorar page, with a cache per place + radius + kind and
 * cancellation of the previous search (a new search aborts the old one).
 * Attractions are loaded in pages of 120: the first page answers quickly and
 * "Carregar mais" fetches details of the next ones, already ranked.
 */

type Fetcher = typeof fetch;
export const PAGE = 120;
const KEY = "gomes-explorar-cache-v2";
const DAY = 86400000;

export type ExploreResult = {
  kind: "attractions" | "food";
  key: string;
  places: Place[];
  retrievedAt: string;
  cached: boolean;
  /** All ranked attractions found in the radius (details loaded page by page). */
  candidates?: Candidate[];
  /** OpenStreetMap places were added. */
  complemented?: boolean;
  /** More results can be requested from the source. */
  hasMore: boolean;
};

export class ExploreError extends Error {}

type Options = { fetcher?: Fetcher; signal?: AbortSignal; storage?: Storage; lang: string; gapMs?: number; onProgress?: (done: number, total: number) => void; onStage?: (stage: string) => void };

const keyFor = (kind: string, p: Point, radius: number, extra = "") =>
  `${kind}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}|${radius}|${extra}`;

function readCache(storage?: Storage): Record<string, ExploreResult> {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writeCache(storage: Storage | undefined, result: ExploreResult) {
  if (!storage) return;
  const cache = readCache(storage);
  cache[result.key] = { ...result, cached: false };
  // Keep the 4 most recent searches; a full storage only skips the cache.
  for (let keep = 4; keep > 0; keep--) {
    const recent = Object.entries(cache)
      .sort((a, b) => b[1].retrievedAt.localeCompare(a[1].retrievedAt))
      .slice(0, keep);
    try {
      storage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)));
      return;
    } catch {
      /* try with fewer entries */
    }
  }
}
export function cached(key: string, storage?: Storage): ExploreResult | undefined {
  const r = readCache(storage)[key];
  return r && Array.isArray(r.places) && Date.now() - Date.parse(r.retrievedAt) < DAY ? { ...r, cached: true } : undefined;
}

async function withCredits(places: Place[], fetcher: Fetcher): Promise<Place[]> {
  const files = places.map((p) => p.tags.image_file).filter((f): f is string => Boolean(f));
  if (!files.length) return places;
  const credits = await fetchImageCredits(files, fetcher).catch(() => ({}) as Awaited<ReturnType<typeof fetchImageCredits>>);
  return places.map((p) => {
    const c = p.tags.image_file ? credits[p.tags.image_file] ?? credits[p.tags.image_file.replace(/ /g, "_")] : undefined;
    if (!c) return p;
    const tags: Record<string, string> = { ...p.tags, image_artist: c.artist, image_license: c.license };
    if (c.licenseUrl) tags.image_license_url = c.licenseUrl;
    return { ...p, tags };
  });
}

async function detailsPage(candidates: Candidate[], options: Options, retrievedAt: string) {
  const { fetcher = fetch, signal, lang } = options;
  const details = await fetchDetails(candidates.map((c) => c.qid), lang, { fetcher, signal });
  return withCredits(candidates.map((c) => toPlace(c, details[c.qid], lang, retrievedAt)), fetcher);
}

export async function searchAttractions(point: Point, radius: number, options: Options): Promise<ExploreResult> {
  const key = keyFor("attractions", point, radius, options.lang);
  const hit = cached(key, options.storage);
  if (hit) return hit;
  let candidates: Candidate[];
  try {
    candidates = await findAttractions(point, radius, options);
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new ExploreError("O Wikidata não respondeu agora. Tente de novo em instantes ou diminua o raio.");
  }
  const retrievedAt = new Date().toISOString();
  let places: Place[] = [];
  options.onStage?.("Carregando nomes, fotos e preços…");
  try {
    places = await detailsPage(candidates.slice(0, PAGE), options, retrievedAt);
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new ExploreError("Não foi possível carregar os detalhes dos lugares. Tente novamente.");
  }
  const result: ExploreResult = {
    kind: "attractions",
    key,
    places: withUniquePhotos(places),
    retrievedAt,
    cached: false,
    candidates,
    hasMore: candidates.length > PAGE,
  };
  writeCache(options.storage, result);
  return result;
}

export async function loadMoreAttractions(result: ExploreResult, options: Options): Promise<ExploreResult> {
  const all = result.candidates ?? [];
  const loaded = new Set(result.places.map((p) => p.tags.wikidata));
  const next = all.filter((c) => !loaded.has(c.qid)).slice(0, PAGE);
  if (!next.length) return { ...result, hasMore: false };
  const places = await detailsPage(next, options, new Date().toISOString());
  const merged: ExploreResult = {
    ...result,
    places: withUniquePhotos(mergePlaces(result.places, places)),
    hasMore: all.length > loaded.size + next.length,
  };
  writeCache(options.storage, merged);
  return merged;
}

/** Adds museums, parks, viewpoints... registered only on OpenStreetMap. */
export async function complementWithOsm(result: ExploreResult, point: Point, radius: number, options: Options): Promise<ExploreResult> {
  let extra: Place[];
  try {
    extra = await searchNominatim(point, radius, attractionPhrases, {
      fetcher: options.fetcher, language: options.lang, gapMs: options.gapMs, onProgress: options.onProgress, signal: options.signal,
    });
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new ExploreError("Não foi possível consultar o OpenStreetMap agora. Os resultados do Wikidata continuam disponíveis.");
  }
  const merged: ExploreResult = { ...result, places: withUniquePhotos(mergePlaces(result.places, extra)), complemented: true };
  writeCache(options.storage, merged);
  return merged;
}

export async function searchFood(
  point: Point,
  radius: number,
  meals: Meal[],
  options: Options & { previous?: ExploreResult },
): Promise<ExploreResult> {
  const phrases = phrasesFor(meals);
  const key = keyFor("food", point, radius, phrases.join(","));
  if (!options.previous) {
    const hit = cached(key, options.storage);
    if (hit) return hit;
  }
  const exclude = (options.previous?.places ?? [])
    .map((p) => p.tags.nominatim_place_id)
    .filter((id): id is string => Boolean(id));
  let found: Place[];
  try {
    found = await searchNominatim(point, radius, phrases, {
      fetcher: options.fetcher, language: options.lang, gapMs: options.gapMs, onProgress: options.onProgress, signal: options.signal, exclude,
    });
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new ExploreError("Não foi possível consultar o OpenStreetMap agora. Tente de novo em alguns minutos.");
  }
  const places = withUniquePhotos(mergePlaces(options.previous?.places ?? [], found));
  const result: ExploreResult = {
    kind: "food",
    key,
    places,
    retrievedAt: new Date().toISOString(),
    cached: false,
    // Nominatim returns at most 40 per kind; a full page suggests there are more.
    hasMore: found.length >= 30,
  };
  writeCache(options.storage, result);
  return result;
}
