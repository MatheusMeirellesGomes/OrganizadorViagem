import type { Place, Point } from "../places";
import { distanceKm } from "../places";
import { sparql, parseWktPoint } from "./wikidata";
import { commonsFileName, commonsThumb } from "./photos";
import { fetchImageCredits, type ImageCredit } from "../wiki-places";

/*
 * Details loaded only when a place is opened: summary text, a gallery of
 * photos from the place's own Commons category, and public transport nearby.
 */

type Fetcher = typeof fetch;
const headers = { "Api-User-Agent": "GomesPeloMundo/0.2 (organizador de viagens)" };

export type Summary = { text: string; url: string };

/** Introduction of the place's Wikipedia article, in the interface language. */
export async function fetchSummary(articleUrl: string, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<Summary | undefined> {
  let u: URL;
  try {
    u = new URL(articleUrl);
  } catch {
    return;
  }
  if (!/^[a-z-]+\.wikipedia\.org$/.test(u.hostname) || !u.pathname.startsWith("/wiki/")) return;
  const title = u.pathname.slice("/wiki/".length);
  const response = await fetcher(`https://${u.hostname}/api/rest_v1/page/summary/${title}`, { headers, signal });
  if (!response.ok) return;
  const json = await response.json();
  const text = typeof json?.extract === "string" ? json.extract.trim() : "";
  return text ? { text: text.slice(0, 1200), url: u.href } : undefined;
}

export type GalleryPhoto = { file: string; url: string; credit?: ImageCredit };

/**
 * Photos of the place itself: its main photo plus Commons files whose
 * structured data says they depict this Wikidata item (P180). Category
 * members are not used: a category also holds portraits, plans and
 * neighbouring buildings. Files without a known license are not shown.
 */
export async function fetchGallery(
  place: Place,
  limit = 8,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<GalleryPhoto[]> {
  const files: string[] = [];
  if (place.tags.image_file) files.push(place.tags.image_file.replace(/_/g, " "));
  const qid = place.tags.wikidata;
  if (qid && /^Q\d+$/.test(qid)) {
    const params = new URLSearchParams({
      action: "query", format: "json", origin: "*", list: "search",
      srsearch: "haswbstatement:P180=" + qid, srnamespace: "6", srlimit: String(limit * 2),
    });
    const response = await fetcher("https://commons.wikimedia.org/w/api.php?" + params, { headers, signal });
    if (response.ok) {
      const json = await response.json();
      for (const m of json?.query?.search ?? []) {
        const file = commonsFileName(m.title);
        if (file && !files.includes(file)) files.push(file);
      }
    }
  }
  const chosen = files.slice(0, limit);
  const credits = await fetchImageCredits(chosen, fetcher).catch(() => ({}) as Record<string, ImageCredit>);
  return chosen
    .map((file) => ({ file, url: commonsThumb(file, 960), credit: credits[file] ?? credits[file.replace(/ /g, "_")] }))
    .filter((p) => p.credit);
}

export type Stop = { name: string; km: number; kind: string };

const stationClasses: Record<string, string> = {
  Q928830: "Metrô",
  Q55488: "Trem",
  Q2175765: "Bonde",
  Q953806: "Ônibus",
  Q1793804: "Trem",
};

/** Metro, train and tram stops within ~700 m (Wikidata). */
export async function fetchTransport(point: Point, lang = "pt", fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<Stop[]> {
  const rows = await sparql(
    `SELECT DISTINCT ?item ?c ?l ?root WHERE { SERVICE wikibase:around { ?item wdt:P625 ?c. bd:serviceParam wikibase:center "Point(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})"^^geo:wktLiteral; wikibase:radius "0.7". } VALUES ?root { ${Object.keys(stationClasses).map((q) => "wd:" + q).join(" ")} } ?item wdt:P31/wdt:P279? ?root. ?item rdfs:label ?l FILTER(LANG(?l) IN ("${lang}","mul","es","en","pt","fr","it")) } LIMIT 200`,
    fetcher,
    signal,
  );
  const order = [lang, "mul", "es", "en", "pt", "fr", "it"];
  const items = new Map<string, { c: Point; labels: Record<string, string>; root: string }>();
  for (const row of rows) {
    const c = parseWktPoint(row.c?.value);
    const key = row.item?.value;
    if (!c || !key || !row.l?.value) continue;
    const item = items.get(key) ?? { c, labels: {}, root: (row.root?.value ?? "").split("/").pop()! };
    item.labels[row.l["xml:lang"] ?? ""] ??= row.l.value;
    items.set(key, item);
  }
  const stops = new Map<string, Stop>();
  for (const item of items.values()) {
    const name = order.map((l) => item.labels[l]).find(Boolean) ?? Object.values(item.labels)[0];
    const kind = stationClasses[item.root] ?? "Transporte";
    const key = kind + "|" + name;
    if (!stops.has(key)) stops.set(key, { name, km: distanceKm(point, item.c), kind });
  }
  return [...stops.values()].sort((a, b) => a.km - b.km).slice(0, 6);
}

/** Other results close to a place, nearest first. */
export function nearbyPlaces(place: Place, all: Place[], max = 6): { place: Place; km: number }[] {
  return all
    .filter((p) => p.id !== place.id)
    .map((p) => ({ place: p, km: distanceKm(place.coordinates, p.coordinates) }))
    .filter((x) => x.km <= 1.5)
    .sort((a, b) => a.km - b.km)
    .slice(0, max);
}
