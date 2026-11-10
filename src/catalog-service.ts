import {
  catalogQuery,
  normalizePlaces,
  type Place,
  type Point,
  type CatalogKind,
  validPoint,
} from "./places";
const env =
  (import.meta as unknown as { env?: Record<string, string | boolean> }).env ||
  {};
export const catalogEndpoint =
  typeof env.VITE_OVERPASS_URL === "string" && env.VITE_OVERPASS_URL
    ? env.VITE_OVERPASS_URL
    : env.DEV
      ? "https://overpass-api.de/api/interpreter"
      : "";
const CACHE_KEY = "gomes-catalog-cache-v1";
export type CatalogResult = {
  places: Place[];
  retrievedAt: string;
  cached: boolean;
};
let requesting = false,
  lastRequest = 0;
export async function searchCatalog(
  point: Point,
  radius: number,
  kind: CatalogKind,
  storage: Storage = localStorage,
  fetcher: typeof fetch = fetch,
  endpoint = catalogEndpoint,
): Promise<CatalogResult> {
  const query = catalogQuery(point, radius, kind),
    key = endpoint + "|" + query;
  let cache: Record<string, CatalogResult> = {};
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      cache = parsed;
  } catch {
    /* optional cache */
  }
  const old = cache[key];
  if (
    old &&
    Array.isArray(old.places) &&
    Date.now() - Date.parse(old.retrievedAt) < 86400000
  )
    return { ...old, cached: true };
  if (!endpoint || !/^https:\/\//.test(endpoint))
    throw new Error(
      "O catálogo precisa de um provedor configurado para esta versão publicada. Você ainda pode pesquisar pelo Google Maps.",
    );
  if (requesting || Date.now() - lastRequest < 15000)
    throw new Error("Aguarde alguns segundos antes de outra consulta.");
  requesting = true;
  lastRequest = Date.now();
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "A fonte está ocupada. Aguarde antes de tentar novamente."
          : "A fonte de lugares está indisponível agora.",
      );
    const retrievedAt = new Date().toISOString(),
      places = normalizePlaces(await response.json(), retrievedAt);
    const result = { places, retrievedAt, cached: false };
    cache[key] = result;
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].retrievedAt.localeCompare(a[1].retrievedAt))
      .slice(0, 6);
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* no quota: results still shown */
    }
    return result;
  } finally {
    requesting = false;
  }
}
export async function locateDestination(
  title: string,
): Promise<{ name: string; point: Point; source: string }> {
  if (!title.trim())
    throw new Error("Digite uma cidade ou escolha um ponto no mapa.");
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    redirects: "1",
    prop: "coordinates|info",
    inprop: "url",
    titles: title.trim(),
  });
  const response = await fetch("https://pt.wikipedia.org/w/api.php?" + params, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Não foi possível localizar pela Wikipédia. Escolha um ponto no mapa.",
    );
  const raw = await response.json();
  const pages = Object.values(raw.query?.pages || {}) as {
    title: string;
    fullurl: string;
    coordinates?: { lat: number; lon: number }[];
  }[];
  const page = pages.find((p) => p.coordinates?.length),
    c = page?.coordinates?.[0];
  if (!page || !c || !validPoint({ lat: c.lat, lng: c.lon }))
    throw new Error(
      "Destino não encontrado. Tente o nome completo ou marque o mapa.",
    );
  return {
    name: page.title,
    point: { lat: c.lat, lng: c.lon },
    source: page.fullurl,
  };
}
