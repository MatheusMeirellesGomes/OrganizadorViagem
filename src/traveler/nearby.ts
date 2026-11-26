import { distanceKm, validPoint, type Place, type Point } from "../places";
import { nominatimEndpoint, toOsmElements, viewbox } from "../osm-places";
import { hoursOf } from "../explore/restaurants";
import { isOpenAt, minuteOfWeek } from "../explore/hours";
import { safeExternalUrl } from "../travel-mode";

/*
 * Lugares perto de onde a pessoa está, para o Modo Viajante.
 * - Turismo, natureza e comida reutilizam as buscas do Explorar (Wikidata e
 *   OpenStreetMap), que já trazem fotos verificadas e categorias.
 * - Transporte e serviços vêm do OpenStreetMap pelo Nominatim, um tipo por
 *   consulta, no máximo uma consulta por segundo (regra do serviço).
 * Nada é inventado: horário, acesso para cadeira de rodas e gratuidade só
 * aparecem quando o OpenStreetMap tem a informação.
 */

export type ServiceKind = {
  id: string;
  label: string;
  /** Frase de busca do Nominatim. */
  phrase: string;
  /** Etiquetas do OpenStreetMap que confirmam o tipo. */
  match: [string, string[]][];
};

export const transportKinds: ServiceKind[] = [
  { id: "subway", label: "Metrô", phrase: "subway station", match: [["station", ["subway"]], ["railway", ["subway_entrance"]], ["subway", ["yes"]]] },
  { id: "train", label: "Trem", phrase: "railway station", match: [["railway", ["station", "halt"]], ["train", ["yes"]]] },
  { id: "tram", label: "Bonde e VLT", phrase: "tram stop", match: [["railway", ["tram_stop"]], ["tram", ["yes"]]] },
  { id: "bus_stop", label: "Pontos de ônibus", phrase: "bus stop", match: [["highway", ["bus_stop"]], ["public_transport", ["platform", "stop_position"]]] },
  { id: "bus_station", label: "Rodoviárias", phrase: "bus station", match: [["amenity", ["bus_station"]]] },
  { id: "airport", label: "Aeroportos", phrase: "airport", match: [["aeroway", ["aerodrome", "terminal"]]] },
  { id: "parking", label: "Estacionamentos", phrase: "parking", match: [["amenity", ["parking"]]] },
  { id: "taxi", label: "Pontos de táxi", phrase: "taxi", match: [["amenity", ["taxi"]]] },
  { id: "bike", label: "Bicicletas compartilhadas", phrase: "bicycle rental", match: [["amenity", ["bicycle_rental"]]] },
];

export const serviceKinds: ServiceKind[] = [
  { id: "pharmacy", label: "Farmácias", phrase: "pharmacy", match: [["amenity", ["pharmacy"]], ["shop", ["chemist"]]] },
  { id: "hospital", label: "Hospitais", phrase: "hospital", match: [["amenity", ["hospital", "clinic"]]] },
  { id: "supermarket", label: "Supermercados", phrase: "supermarket", match: [["shop", ["supermarket", "convenience"]]] },
  { id: "toilets", label: "Banheiros públicos", phrase: "toilets", match: [["amenity", ["toilets"]]] },
  { id: "atm", label: "Caixas eletrônicos", phrase: "atm", match: [["amenity", ["atm", "bank"]]] },
  { id: "fuel", label: "Postos de combustível", phrase: "fuel", match: [["amenity", ["fuel"]]] },
  { id: "info", label: "Informação turística", phrase: "tourist information", match: [["tourism", ["information"]]] },
  { id: "embassy", label: "Consulados e embaixadas", phrase: "embassy", match: [["office", ["diplomatic"]], ["amenity", ["embassy"]], ["diplomatic", ["embassy", "consulate"]]] },
];

export const allServiceKinds = [...transportKinds, ...serviceKinds];

export function serviceKindOf(tags: Record<string, string>): ServiceKind | undefined {
  return allServiceKinds.find((k) => k.match.some(([key, values]) => values.includes(tags[key] ?? "")));
}

let lastRequest = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca um tipo de serviço no raio. Aceita lugares sem nome (um banheiro, um caixa). */
export async function searchServices(
  point: Point,
  radius: number,
  kinds: ServiceKind[],
  options: { fetcher?: typeof fetch; signal?: AbortSignal; language?: string; gapMs?: number; endpoint?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<Place[]> {
  const { fetcher = fetch, signal, language = "pt", gapMs = 1100, endpoint = nominatimEndpoint, onProgress } = options;
  if (!validPoint(point)) throw new Error("Localização inválida.");
  const out: Place[] = [];
  let failures = 0;
  for (const [i, kind] of kinds.entries()) {
    const pause = lastRequest + gapMs - Date.now();
    if (pause > 0) await wait(pause);
    lastRequest = Date.now();
    const params = new URLSearchParams({
      q: kind.phrase,
      format: "jsonv2",
      viewbox: viewbox(point, radius),
      bounded: "1",
      limit: "40",
      extratags: "1",
      addressdetails: "1",
      "accept-language": language,
    });
    try {
      const res = await fetcher(`${endpoint}/search?${params}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const items = await res.json();
      if (Array.isArray(items)) out.push(...servicePlaces(toOsmElements(items), point, radius));
    } catch {
      if (signal?.aborted) throw new Error("cancelled");
      failures++;
    }
    onProgress?.(i + 1, kinds.length);
  }
  if (kinds.length && failures === kinds.length) throw new Error("Não foi possível consultar o OpenStreetMap agora.");
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/** Elementos do OpenStreetMap → lugares de serviço (com nome ou não). */
export function servicePlaces(
  elements: { type?: string; id?: number; lat: number; lon: number; tags: Record<string, string> }[],
  point: Point,
  radius: number,
  retrievedAt = new Date().toISOString(),
): Place[] {
  const out: Place[] = [];
  for (const e of elements) {
    const c = { lat: e.lat, lng: e.lon };
    if (!e.type || !Number.isSafeInteger(e.id) || !validPoint(c)) continue;
    if (distanceKm(point, c) * 1000 > radius) continue;
    const kind = serviceKindOf(e.tags);
    if (!kind) continue;
    const t = e.tags;
    const name = t.name || [t.brand || t.operator, singular[kind.id]].filter(Boolean).join(" · ") || singular[kind.id];
    out.push({
      id: `osm:${e.type}:${e.id}`,
      name,
      coordinates: c,
      category: "svc:" + kind.id,
      address: [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]].filter(Boolean).join(", "),
      city: t["addr:city"] || "",
      country: t["addr:country"] || "",
      website: safeExternalUrl(t.website || t["contact:website"] || "") || undefined,
      source: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      retrievedAt,
      tags: { ...t, provider: "openstreetmap", unnamed: t.name ? "" : "yes" },
    });
  }
  return out;
}

const singular: Record<string, string> = {
  subway: "Estação de metrô", train: "Estação de trem", tram: "Parada de bonde", bus_stop: "Ponto de ônibus", bus_station: "Rodoviária",
  airport: "Aeroporto", parking: "Estacionamento", taxi: "Ponto de táxi", bike: "Bicicletas compartilhadas", pharmacy: "Farmácia",
  hospital: "Hospital", supermarket: "Mercado", toilets: "Banheiro público", atm: "Caixa eletrônico", fuel: "Posto de combustível",
  info: "Informação turística", embassy: "Representação diplomática",
};
export const serviceLabel = (category: string) => {
  const kind = allServiceKinds.find((k) => "svc:" + k.id === category);
  return kind ? singular[kind.id] : undefined;
};

/* ---------------- Filtros ---------------- */

export type NearbyFilters = { openNow?: boolean; free?: boolean; accessible?: boolean; notVisited?: boolean };

/** "Aberto agora" só aceita lugares com horário registrado e aberto neste minuto. */
export function openNow(p: Place, now = new Date()): boolean | undefined {
  if (p.tags.opening_hours === "24/7") return true;
  const week = hoursOf(p);
  return week ? isOpenAt(week, minuteOfWeek(now)) : undefined;
}

export function filterNearby(places: Place[], f: NearbyFilters, visited: Set<string>, now = new Date()): Place[] {
  return places.filter((p) => {
    if (f.openNow && openNow(p, now) !== true) return false;
    if (f.free && p.tags.fee !== "no") return false;
    if (f.accessible && !["yes", "designated"].includes(p.tags.wheelchair ?? "")) return false;
    if (f.notVisited && visited.has(p.id)) return false;
    return true;
  });
}

export const withDistance = (places: Place[], from: Point) =>
  places.map((place) => ({ place, km: distanceKm(from, place.coordinates) })).sort((a, b) => a.km - b.km);

/** Tempo a pé em linha reta × 1,3 (ruas não são retas), a 4,8 km/h. Só uma estimativa. */
export const walkMinutes = (km: number) => Math.max(1, Math.round(((km * 1.3) / 4.8) * 60));

/** Endereço legível com o que o OpenStreetMap tem. */
export function addressOf(p: Place): string {
  return [p.address, p.city].filter(Boolean).join(" · ");
}

/** Informações de acessibilidade registradas, sem suposições. */
export function accessibilityOf(tags: Record<string, string>): string[] {
  const out: string[] = [];
  const w = tags.wheelchair;
  if (w === "yes" || w === "designated") out.push("Acesso para cadeira de rodas");
  else if (w === "limited") out.push("Acesso limitado para cadeira de rodas");
  else if (w === "no") out.push("Sem acesso para cadeira de rodas");
  if (tags["toilets:wheelchair"] === "yes") out.push("Banheiro adaptado");
  if (tags.elevator === "yes" || tags.highway === "elevator") out.push("Elevador");
  if (tags.ramp === "yes" || tags["ramp:wheelchair"] === "yes") out.push("Rampa");
  if (tags["capacity:disabled"] && tags["capacity:disabled"] !== "0" && tags["capacity:disabled"] !== "no") out.push("Vagas para pessoas com deficiência");
  if (tags["tactile_paving"] === "yes") out.push("Piso tátil");
  return out;
}
