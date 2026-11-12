import type { Place, Point } from "../places";
import { validPoint } from "../places";
import { classifyWikidata, excludedRoots, wikidataRoots } from "./categories";
import { commonsFileName, commonsThumb } from "./photos";

/*
 * Attractions from Wikidata, searched by real radius.
 *
 * Why not Wikipedia GeoSearch any more: it returns at most the 100 articles
 * nearest to the center. In central Madrid those 100 articles fit in about
 * 300 m (streets, metro stations, cafés), so the Palacio Real, the Prado and
 * the Retiro never appeared, whatever radius was chosen (tested on
 * 11/11/2026).
 *
 * Here: 1) every Wikidata item with coordinates inside the radius and at least
 * one Wikipedia article, most linked first; 2) their classes; 3) the
 * superclasses of unknown classes, so a "royal palace" or a "Catholic
 * cathedral" is recognised as palace/church. Only the region and the radius
 * are sent. Nothing is invented: data that the source does not have is shown
 * as "Não informado".
 */

type Fetcher = typeof fetch;
type Binding = Record<string, { value: string; "xml:lang"?: string } | undefined>;

export const sparqlEndpoint = "https://query.wikidata.org/sparql";
const id = (uri?: string) => (uri ?? "").split("/").pop() ?? "";

export async function sparql(
  query: string,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<Binding[]> {
  const response = await fetcher(sparqlEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error("Wikidata HTTP " + response.status);
  const json = await response.json();
  return json?.results?.bindings ?? [];
}

const values = (qids: string[]) =>
  qids.filter((q) => /^Q\d+$/.test(q)).map((q) => "wd:" + q).join(" ");

export function aroundQuery(point: Point, radiusKm: number, limit = 3000) {
  if (!validPoint(point) || !(radiusKm > 0 && radiusKm <= 20))
    throw new Error("Escolha uma região válida e raio entre 1 e 20 km.");
  return `SELECT DISTINCT ?item ?sl ?c WHERE { SERVICE wikibase:around { ?item wdt:P625 ?c. bd:serviceParam wikibase:center "Point(${point.lng.toFixed(5)} ${point.lat.toFixed(5)})"^^geo:wktLiteral; wikibase:radius "${radiusKm}". } ?item wikibase:sitelinks ?sl. FILTER(?sl >= 1) } ORDER BY DESC(?sl) LIMIT ${limit}`;
}

/** "Point(-3.71 40.41)" → {lat, lng}. */
export function parseWktPoint(value = ""): Point | undefined {
  const m = value.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!m) return;
  const p = { lat: Number(m[2]), lng: Number(m[1]) };
  return validPoint(p) ? p : undefined;
}

export type Candidate = {
  qid: string;
  sitelinks: number;
  coordinates: Point;
  category: string;
  heritage: boolean;
};

const PARENTS_KEY = "gomes-wikidata-classes-v2";
function readParents(storage?: Storage): Record<string, string[]> {
  try {
    return JSON.parse(storage?.getItem(PARENTS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function writeParents(storage: Storage | undefined, map: Record<string, string[]>) {
  try {
    // Classes change rarely; keep at most ~4000 entries.
    const entries = Object.entries(map).slice(-4000);
    storage?.setItem(PARENTS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage is optional */
  }
}

/** Roots (see categories.ts) that each class descends from, up to 3 levels. */
export async function resolveParents(
  classes: string[],
  fetcher: Fetcher,
  signal?: AbortSignal,
  storage?: Storage,
): Promise<Record<string, string[]>> {
  const known = readParents(storage);
  const missing = classes.filter((c) => !wikidataRoots[c] && !excludedRoots[c] && !(c in known));
  const roots = [...Object.keys(wikidataRoots), ...Object.keys(excludedRoots)];
  for (let i = 0; i < missing.length; i += 700) {
    const group = missing.slice(i, i + 700);
    const rows = await sparql(
      `SELECT DISTINCT ?cls ?root WHERE { VALUES ?cls { ${values(group)} } VALUES ?root { ${values(roots)} } ?cls wdt:P279/wdt:P279?/wdt:P279? ?root. }`,
      fetcher,
      signal,
    );
    for (const c of group) known[c] = [];
    for (const row of rows) known[id(row.cls?.value)].push(id(row.root?.value));
  }
  if (missing.length) writeParents(storage, known);
  return known;
}

/** Attractions inside the radius, most relevant (most Wikipedia articles) first. */
export async function findAttractions(
  point: Point,
  radiusMeters: number,
  options: { fetcher?: Fetcher; signal?: AbortSignal; storage?: Storage } = {},
): Promise<Candidate[]> {
  const { fetcher = fetch, signal, storage } = options;
  const rows = await sparql(aroundQuery(point, radiusMeters / 1000), fetcher, signal);
  const items = new Map<string, { sitelinks: number; coordinates: Point }>();
  for (const row of rows) {
    const qid = id(row.item?.value);
    const coordinates = parseWktPoint(row.c?.value);
    if (!qid || !coordinates || items.has(qid)) continue;
    items.set(qid, { sitelinks: Number(row.sl?.value) || 0, coordinates });
  }
  const qids = [...items.keys()];
  const classes: Record<string, string[]> = {};
  const heritage = new Set<string>(),
    demolished = new Set<string>(),
    inCollection = new Set<string>();
  const groups: string[][] = [];
  for (let i = 0; i < qids.length; i += 750) groups.push(qids.slice(i, i + 750));
  // Up to 3 queries at a time: faster, and within Wikidata's limit of 5.
  for (let i = 0; i < groups.length; i += 3) {
    const batches = await Promise.all(
      groups.slice(i, i + 3).map((group) =>
        sparql(
          `SELECT ?item ?cls ?her ?gone ?col WHERE { VALUES ?item { ${values(group)} } OPTIONAL { ?item wdt:P31 ?cls. } OPTIONAL { ?item wdt:P1435 ?her. } OPTIONAL { ?item wdt:P576 ?gone. } OPTIONAL { ?item wdt:P195 ?col. } }`,
          fetcher,
          signal,
        ),
      ),
    );
    for (const row of batches.flat()) {
      const qid = id(row.item?.value);
      const list = (classes[qid] ||= []);
      const cls = id(row.cls?.value);
      if (cls && !list.includes(cls)) list.push(cls);
      if (row.her) heritage.add(qid);
      if (row.gone) demolished.add(qid);
      if (row.col) inCollection.add(qid);
    }
  }
  const allClasses = [...new Set(Object.values(classes).flat())];
  const parents = await resolveParents(allClasses, fetcher, signal, storage).catch(
    () => ({}) as Record<string, string[]>,
  );
  const result: Candidate[] = [];
  for (const [qid, item] of items) {
    const category = classifyWikidata(classes[qid] ?? [], parents, heritage.has(qid), {
      demolished: demolished.has(qid),
      inCollection: inCollection.has(qid),
    });
    if (!category) continue;
    result.push({ qid, ...item, category, heritage: heritage.has(qid) });
  }
  return result.sort((a, b) => b.sitelinks - a.sitelinks);
}

/** Language spoken locally, to show the local name next to the translated one. */
const countryLanguage: Record<string, string> = {
  ES: "es", MX: "es", AR: "es", CL: "es", CO: "es", PE: "es", UY: "es",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  FR: "fr", BE: "fr", IT: "it", DE: "de", AT: "de", NL: "nl",
  GB: "en", US: "en", IE: "en", CA: "en", AU: "en", JP: "ja", CN: "zh", GR: "el",
};
const currencies: Record<string, string> = {
  Q4916: "EUR", Q4917: "USD", Q173117: "BRL", Q25224: "GBP", Q8146: "JPY", Q25344: "CHF",
};
const wheelchair: Record<string, string> = {
  Q24192067: "yes", Q24192069: "no", Q24192068: "limited",
};

export type EntityDetails = {
  labels: Record<string, string>;
  description?: string;
  officialName?: string;
  image?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  commonsCategory?: string;
  article?: string;
  fee?: number;
  currency?: string;
  wheelchair?: string;
};

const languagesFor = (lang: string) => [...new Set([lang, "en", "es", "pt", "fr", "it", "de", "mul"])];

export async function fetchDetails(
  qids: string[],
  lang: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<Record<string, EntityDetails>> {
  const { fetcher = fetch, signal } = options;
  const result: Record<string, EntityDetails> = {};
  const langs = languagesFor(lang);
  const site = `https://${lang}.wikipedia.org/`;
  for (let i = 0; i < qids.length; i += 150) {
    const group = qids.slice(i, i + 150);
    const [labels, props] = await Promise.all([
      sparql(
        `SELECT ?item ?l ?d ?off WHERE { VALUES ?item { ${values(group)} } { ?item rdfs:label ?l FILTER(LANG(?l) IN (${langs.map((l) => `"${l}"`).join(",")}, "ca", "nl", "ja", "zh", "el")) } UNION { ?item schema:description ?d FILTER(LANG(?d) = "${lang}") } UNION { ?item wdt:P1448 ?off } }`,
        fetcher,
        signal,
      ),
      sparql(
        `SELECT ?item ?img ?site ?addr ?inL ?coL ?cc ?commons ?article ?fee ?unit ?wheel WHERE { VALUES ?item { ${values(group)} } OPTIONAL { ?item wdt:P18 ?img. } OPTIONAL { ?item wdt:P856 ?site. } OPTIONAL { ?item wdt:P6375 ?addr. } OPTIONAL { ?item wdt:P131 ?in. ?in rdfs:label ?inL FILTER(LANG(?inL) = "${lang}") } OPTIONAL { ?item wdt:P17 ?co. ?co wdt:P297 ?cc. ?co rdfs:label ?coL FILTER(LANG(?coL) = "${lang}") } OPTIONAL { ?item wdt:P373 ?commons. } OPTIONAL { ?article schema:about ?item; schema:isPartOf <${site}>. } OPTIONAL { ?item p:P2555/psv:P2555 [ wikibase:quantityAmount ?fee; wikibase:quantityUnit ?unit ]. } OPTIONAL { ?item wdt:P2846 ?wheel. } }`,
        fetcher,
        signal,
      ),
    ]);
    for (const row of labels) {
      const qid = id(row.item?.value);
      const d = (result[qid] ||= { labels: {} });
      const l = row.l;
      if (l?.value && l["xml:lang"] && !d.labels[l["xml:lang"]]) d.labels[l["xml:lang"]] = l.value;
      if (row.d?.value && !d.description) d.description = row.d.value;
      if (row.off?.value && !d.officialName) d.officialName = row.off.value;
    }
    for (const row of props) {
      const qid = id(row.item?.value);
      const d = (result[qid] ||= { labels: {} });
      d.image ??= commonsFileName(row.img?.value);
      if (!d.website && /^https?:\/\//.test(row.site?.value ?? "")) d.website = row.site!.value;
      d.address ??= row.addr?.value;
      d.city ??= row.inL?.value;
      d.country ??= row.coL?.value;
      d.countryCode ??= row.cc?.value?.toUpperCase();
      d.commonsCategory ??= row.commons?.value;
      d.article ??= row.article?.value;
      if (d.fee === undefined && row.fee?.value !== undefined) {
        const amount = Number(row.fee.value);
        if (Number.isFinite(amount) && amount >= 0) {
          d.fee = amount;
          d.currency = currencies[id(row.unit?.value)];
        }
      }
      d.wheelchair ??= wheelchair[id(row.wheel?.value)];
    }
  }
  return result;
}

/** Name in the interface language, falling back to other languages. */
export function displayName(d: EntityDetails | undefined, lang: string, qid: string) {
  if (!d) return qid;
  // Interface language first, then the local language, then others.
  const local = countryLanguage[d.countryCode ?? ""];
  for (const l of [lang, local, ...languagesFor(lang)]) if (l && d.labels[l]) return d.labels[l];
  return Object.values(d.labels)[0] ?? qid;
}

export function toPlace(
  c: Candidate,
  d: EntityDetails | undefined,
  lang: string,
  retrievedAt: string,
): Place {
  const name = displayName(d, lang, c.qid);
  const tags: Record<string, string> = {
    provider: "wikidata",
    wikidata: c.qid,
    sitelinks: String(c.sitelinks),
  };
  if (c.heritage) tags.heritage = "yes";
  if (d?.description) tags.description = d.description.slice(0, 300);
  const local = d?.countryCode ? d.labels[countryLanguage[d.countryCode] ?? ""] : undefined;
  const official = d?.officialName || local;
  if (official && official !== name) tags.official_name = official;
  if (d?.image) {
    tags.image = commonsThumb(d.image, 640);
    tags.image_file = d.image;
    tags.image_source = "wikidata-p18";
  }
  if (d?.commonsCategory) tags.commons_category = d.commonsCategory;
  if (d?.article) tags.article = d.article;
  if (d?.fee !== undefined) {
    tags.fee = d.fee === 0 ? "no" : "yes";
    if (d.fee > 0 && d.currency) {
      tags.charge = String(d.fee);
      tags.currency = d.currency;
    }
  }
  if (d?.wheelchair) tags.wheelchair = d.wheelchair;
  if (d?.countryCode) tags.country_code = d.countryCode;
  return {
    id: "wd:" + c.qid,
    name,
    coordinates: c.coordinates,
    category: c.category,
    address: d?.address ?? "",
    city: d?.city ?? "",
    country: d?.country ?? "",
    website: d?.website,
    source: d?.article ?? `https://www.wikidata.org/wiki/${c.qid}`,
    retrievedAt,
    tags,
  };
}
