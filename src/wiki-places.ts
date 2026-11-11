import type { Place, Point } from "./places";
import { validPoint } from "./places";

/*
 * Attractions from Wikimedia (Wikipedia GeoSearch + Wikidata + Commons).
 *
 * Why: the public Overpass servers are overloaded and block or time out
 * (verified on 11/11/2026: 3 of 4 instances timed out). Wikimedia APIs answer
 * in about 1-2 s, allow browser requests (CORS) and bring free photos with
 * author and license. Each search makes ~6 small requests and is cached.
 *
 * Nothing is invented: no prices, opening hours or ratings. Extra data is kept
 * inside `tags` so saved places and backups keep the existing format.
 */

export type WikiLanguage = "pt" | "en" | "es";
type Fetcher = typeof fetch;

const headers = { "Api-User-Agent": "GomesPeloMundo/0.1 (organizador de viagens)" };

/** Wikidata classes (P31) that are worth visiting, mapped to app categories. */
export const attractionClasses: Record<string, string> = {
  Q570116: "attraction", // tourist attraction
  Q2319498: "attraction", // landmark
  Q33506: "museum",
  Q207694: "museum", // art museum
  Q588140: "museum", // science museum
  Q1595639: "museum", // local museum
  Q17431399: "museum", // national museum
  Q2772772: "museum", // military museum
  Q1007870: "gallery", // art gallery
  Q16970: "place_of_worship", // church building
  Q2977: "place_of_worship", // cathedral
  Q163687: "place_of_worship", // basilica
  Q108325: "place_of_worship", // chapel
  Q44613: "place_of_worship", // monastery
  Q1701174: "place_of_worship", // ruined monastery
  Q120560: "place_of_worship", // minor basilica
  Q32815: "place_of_worship", // mosque
  Q34627: "place_of_worship", // synagogue
  Q44539: "place_of_worship", // temple
  Q697295: "place_of_worship", // shrine
  Q1088552: "place_of_worship", // Catholic church building
  Q23413: "castle",
  Q57821: "castle", // fortification
  Q1785071: "castle", // fort
  Q16560: "palace",
  Q53536964: "palace", // royal palace
  Q4989906: "monument",
  Q5003624: "memorial",
  Q179700: "monument", // statue
  Q170980: "monument", // obelisk
  Q575759: "memorial", // war memorial
  Q82117: "monument", // city gate
  Q12518: "monument", // tower
  Q39715: "monument", // lighthouse
  Q12280: "monument", // bridge
  Q174782: "square",
  Q22698: "park",
  Q473972: "park", // protected area
  Q46169: "park", // national park
  Q1107656: "garden",
  Q55177716: "garden", // public garden
  Q167346: "garden", // botanical garden
  Q6017969: "viewpoint", // scenic viewpoint
  Q43501: "zoo",
  Q2281788: "aquarium", // public aquarium
  Q2416723: "theme_park",
  Q194195: "theme_park", // amusement park
  Q40080: "beach",
  Q34038: "waterfall",
  Q8502: "peak", // mountain
  Q207326: "peak", // summit
  Q35509: "cave_entrance", // cave
  Q839954: "archaeological_site",
  Q109607: "archaeological_site", // ruins
  Q24354: "attraction", // theatre
  Q153562: "attraction", // opera house
  Q1060829: "attraction", // concert hall
  Q132911: "attraction", // elevator (e.g. Santa Justa)
  Q142031: "attraction", // funicular
  Q37654: "marketplace", // market
  Q330284: "marketplace", // marketplace
  Q23397: "attraction", // lake
  Q23442: "attraction", // island
  Q54050: "attraction", // hill
};

export type WikiClassification = {
  qid?: string;
  classes: string[];
  website?: string;
  heritage: boolean;
};

/** Category for a place, or undefined when it is not a recognised attraction. */
export function classify(info: WikiClassification | undefined): string | undefined {
  if (!info) return;
  for (const c of info.classes) if (attractionClasses[c]) return attractionClasses[c];
  // Listed heritage (P1435) is worth visiting even with an unusual class.
  return info.heritage ? "attraction" : undefined;
}

type GeoItem = { pageid: number; title: string; lat: number; lon: number; dist: number };
type PageInfo = {
  pageid: number;
  title: string;
  fullurl?: string;
  description?: string;
  pageimage?: string;
  thumbnail?: { source: string };
  pageprops?: { wikibase_item?: string };
};
export type ImageCredit = { artist: string; license: string; licenseUrl?: string };

export function wikiApi(lang: WikiLanguage) {
  return `https://${lang}.wikipedia.org/w/api.php`;
}

async function getJson(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  const response = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

/** Plain text from a Commons "Artist" field, which is HTML. */
export function plainText(html: string) {
  const withoutTags = html.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
  return decoded.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function fetchClassifications(
  qids: string[],
  fetcher: Fetcher = fetch,
): Promise<Record<string, WikiClassification>> {
  const result: Record<string, WikiClassification> = {};
  const valid = qids.filter((q) => /^Q\d+$/.test(q));
  for (const group of chunks(valid, 100)) {
    const query = `SELECT ?item ?class ?site ?heritage WHERE { VALUES ?item { ${group
      .map((q) => "wd:" + q)
      .join(" ")} } OPTIONAL { ?item wdt:P31 ?class. } OPTIONAL { ?item wdt:P856 ?site. } OPTIONAL { ?item wdt:P1435 ?heritage. } }`;
    const json = await getJson(
      fetcher,
      "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query),
      { headers: { Accept: "application/sparql-results+json" } },
    );
    for (const row of json?.results?.bindings ?? []) {
      const id = String(row.item?.value ?? "").split("/").pop() ?? "";
      if (!id) continue;
      const entry = (result[id] ||= { qid: id, classes: [], heritage: false });
      const cls = String(row.class?.value ?? "").split("/").pop();
      if (cls && !entry.classes.includes(cls)) entry.classes.push(cls);
      const site = String(row.site?.value ?? "");
      if (!entry.website && /^https?:\/\//.test(site)) entry.website = site;
      if (row.heritage) entry.heritage = true;
    }
  }
  return result;
}

export async function fetchImageCredits(
  files: string[],
  fetcher: Fetcher = fetch,
): Promise<Record<string, ImageCredit>> {
  const result: Record<string, ImageCredit> = {};
  for (const group of chunks([...new Set(files)], 50)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "imageinfo",
      iiprop: "extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
      titles: group.map((f) => "File:" + f).join("|"),
    });
    const json = await getJson(
      fetcher,
      "https://commons.wikimedia.org/w/api.php?" + params,
      { headers },
    );
    const normalized = new Map<string, string>(
      (json?.query?.normalized ?? []).map((n: { from: string; to: string }) => [n.to, n.from]),
    );
    for (const page of Object.values(json?.query?.pages ?? {}) as {
      title: string;
      imageinfo?: { extmetadata?: Record<string, { value?: string }> }[];
    }[]) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      const requested = (normalized.get(page.title) ?? page.title).replace(/^File:/, "");
      const license = plainText(meta.LicenseShortName?.value ?? "");
      if (!license) continue;
      const credit = {
        artist: plainText(meta.Artist?.value ?? "") || "Autor não informado",
        license,
        licenseUrl: /^https?:\/\//.test(meta.LicenseUrl?.value ?? "")
          ? meta.LicenseUrl!.value
          : undefined,
      };
      result[requested] = credit;
      result[requested.replace(/ /g, "_")] = credit;
      result[page.title.replace(/^File:/, "")] = credit;
    }
  }
  return result;
}

/** Thumbnail URLs are only accepted from Wikimedia's own image servers. */
export function safeWikimediaImage(url: string | undefined) {
  if (!url) return;
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      /(^|\.)wikimedia\.org$/.test(u.hostname)
      ? u.href
      : undefined;
  } catch {
    return;
  }
}

export function buildPlaces(
  geo: GeoItem[],
  pages: Record<number, PageInfo>,
  classes: Record<string, WikiClassification>,
  credits: Record<string, ImageCredit>,
  lang: WikiLanguage,
  retrievedAt: string,
): Place[] {
  const places: Place[] = [];
  for (const g of geo) {
    const coordinates = { lat: g.lat, lng: g.lon };
    if (!validPoint(coordinates)) continue;
    const page = pages[g.pageid];
    const qid = page?.pageprops?.wikibase_item;
    const info = qid ? classes[qid] : undefined;
    const category = classify(info);
    const tags: Record<string, string> = { provider: "wikipedia" };
    if (!category) tags.unclassified = "yes";
    if (page?.description) tags.description = page.description.slice(0, 300);
    if (qid) tags.wikidata = qid;
    if (info?.heritage) tags.heritage = "yes";
    const image = safeWikimediaImage(page?.thumbnail?.source);
    const file = page?.pageimage;
    if (image && file) {
      tags.image = image;
      tags.image_file = file;
      const credit = credits[file] ?? credits[file.replace(/_/g, " ")];
      if (credit) {
        tags.image_artist = credit.artist;
        tags.image_license = credit.license;
        if (credit.licenseUrl) tags.image_license_url = credit.licenseUrl;
      }
    }
    places.push({
      id: `wiki:${lang}:${g.pageid}`,
      name: g.title,
      coordinates,
      category: category ?? "other",
      address: "",
      city: "",
      country: "",
      website: info?.website,
      source:
        page?.fullurl ??
        `https://${lang}.wikipedia.org/?curid=${encodeURIComponent(g.pageid)}`,
      retrievedAt,
      tags,
    });
  }
  return places;
}

/** Up to 100 Wikipedia articles near the point, nearest first. */
export async function searchWikipediaAttractions(
  point: Point,
  radius: number,
  lang: WikiLanguage,
  fetcher: Fetcher = fetch,
): Promise<Place[]> {
  const retrievedAt = new Date().toISOString();
  const geoParams = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "geosearch",
    gscoord: `${point.lat.toFixed(5)}|${point.lng.toFixed(5)}`,
    gsradius: String(Math.min(10000, Math.max(10, Math.round(radius)))),
    gslimit: "100",
  });
  const geoJson = await getJson(fetcher, wikiApi(lang) + "?" + geoParams, { headers });
  const geo: GeoItem[] = geoJson?.query?.geosearch ?? [];
  if (!geo.length) return [];

  const pages: Record<number, PageInfo> = {};
  for (const group of chunks(geo.map((g) => g.pageid), 50)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      pageids: group.join("|"),
      prop: "pageprops|pageimages|description|info",
      ppprop: "wikibase_item",
      piprop: "thumbnail|name",
      pithumbsize: "480",
      pilimit: "50",
      pilicense: "free",
      inprop: "url",
    });
    const json = await getJson(fetcher, wikiApi(lang) + "?" + params, { headers });
    for (const page of Object.values(json?.query?.pages ?? {}) as PageInfo[])
      pages[page.pageid] = page;
  }

  const qids = Object.values(pages)
    .map((p) => p.pageprops?.wikibase_item)
    .filter((q): q is string => Boolean(q));
  // Classification and photo credits improve results but are not essential.
  const [classes, credits] = await Promise.all([
    fetchClassifications(qids, fetcher).catch(() => ({})),
    fetchImageCredits(
      Object.values(pages)
        .map((p) => (p.thumbnail ? p.pageimage : undefined))
        .filter((f): f is string => Boolean(f)),
      fetcher,
    ).catch(() => ({})),
  ]);
  return buildPlaces(geo, pages, classes, credits, lang, retrievedAt);
}

/** Finds a destination by name (search, not exact title), in the UI language. */
export async function findDestination(
  name: string,
  lang: WikiLanguage,
  fetcher: Fetcher = fetch,
): Promise<{ name: string; point: Point; source: string } | undefined> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: name.trim(),
    gsrlimit: "5",
    prop: "coordinates|info",
    inprop: "url",
    coprimary: "primary",
  });
  const json = await getJson(fetcher, wikiApi(lang) + "?" + params, { headers });
  const pages = (Object.values(json?.query?.pages ?? {}) as {
    title: string;
    index: number;
    fullurl: string;
    coordinates?: { lat: number; lon: number }[];
  }[]).sort((a, b) => a.index - b.index);
  const page = pages.find((p) => p.coordinates?.length);
  const c = page?.coordinates?.[0];
  if (!page || !c || !validPoint({ lat: c.lat, lng: c.lon })) return;
  return { name: page.title, point: { lat: c.lat, lng: c.lon }, source: page.fullurl };
}
