import type { Point } from "../places";
import { validPoint } from "../places";
import { sparql, parseWktPoint } from "./wikidata";
import { nominatimEndpoint } from "../osm-places";

/*
 * Worldwide search of destinations and places.
 * - Suggestions while typing come from Wikidata, which knows names in every
 *   language, aliases and historic names, and ignores accents ("Madri",
 *   "Segóvia", "Alcazar de Segovia", "Olisipo"). Two searches are combined: by
 *   name start (good ranking for cities) and full text in all languages (finds
 *   "Plaza del Alcázar" typed in any language). Only items with coordinates.
 * - Addresses and streets go to OpenStreetMap (Nominatim) only when the person
 *   presses search: its usage policy forbids autocomplete.
 * - Coordinates ("40.4168, -3.7038") are read directly, without any request.
 */

type Fetcher = typeof fetch;
const api = "https://www.wikidata.org/w/api.php";
const headers = { "Api-User-Agent": "GomesPeloMundo/0.2 (organizador de viagens)" };

export type Suggestion = {
  qid?: string;
  name: string;
  /** Short context: description, the place it is in, and country. */
  context: string;
  point: Point;
  /** City, region or country (true) or a specific place (false). */
  destination: boolean;
  source: "wikidata" | "openstreetmap" | "coordinates";
};

/** Reads "40.4168, -3.7038", "40.4168 -3.7038" or "40,4168; -3,7038". */
export function parseCoordinates(text: string): Point | undefined {
  const t = text.trim();
  const m =
    t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/) ||
    t.match(/^(-?\d{1,2}(?:,\d+)?)\s*;\s*(-?\d{1,3}(?:,\d+)?)$/);
  if (!m) return;
  const p = { lat: Number(m[1].replace(",", ".")), lng: Number(m[2].replace(",", ".")) };
  return validPoint(p) ? p : undefined;
}

async function getJson(fetcher: Fetcher, url: string, signal?: AbortSignal) {
  const response = await fetcher(url, {
    headers,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

/** Destinations and places matching the text, best first. */
export async function suggest(
  text: string,
  lang: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<Suggestion[]> {
  const { fetcher = fetch, signal } = options;
  const query = text.trim();
  const point = parseCoordinates(query);
  if (point)
    return [{ name: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, context: "Coordenadas", point, destination: true, source: "coordinates" }];
  if (query.length < 2) return [];
  const [byName, fullText] = await Promise.all([
    getJson(
      fetcher,
      api + "?" + new URLSearchParams({ action: "wbsearchentities", search: query, language: lang, uselang: lang, type: "item", limit: "10", format: "json", origin: "*" }),
      signal,
    ).catch(() => ({})),
    getJson(
      fetcher,
      api + "?" + new URLSearchParams({ action: "query", list: "search", srsearch: query + " haswbstatement:P625", srlimit: "10", format: "json", origin: "*" }),
      signal,
    ).catch(() => ({})),
  ]);
  const order: string[] = [];
  for (const r of byName?.search ?? []) if (/^Q\d+$/.test(r.id)) order.push(r.id);
  for (const r of fullText?.query?.search ?? [])
    if (/^Q\d+$/.test(r.title) && !order.includes(r.title)) order.push(r.title);
  if (!order.length) return [];
  const rows = await sparql(
    `SELECT ?item ?c ?l ?le ?d ?pop ?sl ?inL ?coL WHERE { VALUES ?item { ${order.map((q) => "wd:" + q).join(" ")} } ?item wdt:P625 ?c. ?item wikibase:sitelinks ?sl. OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) = "${lang}") } OPTIONAL { ?item rdfs:label ?le FILTER(LANG(?le) IN ("en","es","pt","mul")) } OPTIONAL { ?item schema:description ?d FILTER(LANG(?d) = "${lang}") } OPTIONAL { ?item wdt:P1082 ?pop. } OPTIONAL { ?item wdt:P131 ?in. ?in rdfs:label ?inL FILTER(LANG(?inL) = "${lang}") } OPTIONAL { ?item wdt:P17 ?co. ?co rdfs:label ?coL FILTER(LANG(?coL) = "${lang}") } }`,
    fetcher,
    signal,
  );
  const found = new Map<string, Suggestion & { rank: number }>();
  for (const row of rows) {
    const qid = (row.item?.value ?? "").split("/").pop()!;
    if (found.has(qid)) continue;
    const point = parseWktPoint(row.c?.value);
    const name = row.l?.value || row.le?.value;
    if (!point || !name) continue;
    const within = [row.inL?.value, row.coL?.value].filter((v, i, a) => v && a.indexOf(v) === i);
    const context = [row.d?.value, within.join(", ")].filter(Boolean).join(" · ");
    const index = order.indexOf(qid);
    // Name-start results keep their order; full-text extras are ranked by relevance.
    const fromName = index < (byName?.search?.length ?? 0);
    found.set(qid, {
      qid,
      name,
      context,
      point,
      destination: Boolean(row.pop?.value),
      source: "wikidata",
      rank: fromName ? index : 100 - Math.min(99, Math.log2(1 + Number(row.sl?.value || 0)) * 8),
    });
  }
  return [...found.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8)
    .map(({ rank: _rank, ...s }) => s);
}

let lastGeocode = 0;
/** Addresses, streets and neighbourhoods (only on explicit search; 1 request per second). */
export async function geocodeAddress(
  text: string,
  lang: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal; endpoint?: string } = {},
): Promise<Suggestion[]> {
  const { fetcher = fetch, signal, endpoint = nominatimEndpoint } = options;
  if (!endpoint || text.trim().length < 3) return [];
  const wait = lastGeocode + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  const json = await getJson(
    fetcher,
    `${endpoint}/search?` + new URLSearchParams({ q: text.trim(), format: "jsonv2", limit: "6", addressdetails: "1", "accept-language": lang }),
    signal,
  );
  return (Array.isArray(json) ? json : [])
    .map((r: { lat: string; lon: string; display_name: string; name?: string; addresstype?: string; type?: string }) => {
      const point = { lat: Number(r.lat), lng: Number(r.lon) };
      const parts = r.display_name.split(", ");
      return {
        name: r.name || parts[0],
        context: parts.slice(1, 4).join(", "),
        point,
        destination: ["city", "town", "village", "suburb", "neighbourhood", "state", "country", "county", "municipality", "quarter"].includes(r.addresstype ?? ""),
        source: "openstreetmap" as const,
      };
    })
    .filter((s: Suggestion) => validPoint(s.point));
}

/** Calls `run` only after the person stops typing, cancelling the previous call. */
export function debounced<T>(run: (text: string, signal: AbortSignal) => Promise<T>, delay = 350) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  return (text: string): Promise<T | undefined> => {
    clearTimeout(timer);
    controller?.abort();
    const current = new AbortController();
    controller = current;
    return new Promise((resolve) => {
      current.signal.addEventListener("abort", () => resolve(undefined));
      timer = setTimeout(() => {
        run(text, current.signal).then(
          (value) => resolve(current.signal.aborted ? undefined : value),
          () => resolve(undefined),
        );
      }, delay);
    });
  };
}
