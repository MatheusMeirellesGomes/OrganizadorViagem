import { safeExternalUrl } from "./travel-mode";
export type Point = { lat: number; lng: number };
export type Place = {
  id: string;
  name: string;
  coordinates: Point;
  category: string;
  address: string;
  city: string;
  country: string;
  website?: string;
  source: string;
  retrievedAt: string;
  updatedAt?: string;
  tags: Record<string, string>;
};
export type CatalogKind = "attractions" | "food";
export const categories: Record<string, string> = {
  museum: "Museus",
  gallery: "Galerias",
  attraction: "Atrações",
  viewpoint: "Mirantes",
  zoo: "Zoológicos",
  aquarium: "Aquários",
  theme_park: "Parques temáticos",
  castle: "Castelos",
  palace: "Palácios",
  monument: "Monumentos",
  memorial: "Memoriais",
  archaeological_site: "Sítios arqueológicos",
  park: "Parques",
  garden: "Jardins",
  nature_reserve: "Reservas naturais",
  beach: "Praias",
  waterfall: "Cachoeiras",
  peak: "Montanhas",
  cave_entrance: "Cavernas",
  place_of_worship: "Igrejas e templos",
  marketplace: "Mercados",
  square: "Praças",
  restaurant: "Restaurantes",
  cafe: "Cafeterias",
  fast_food: "Lanches",
  food_court: "Praças de alimentação",
  ice_cream: "Sorveterias",
  other: "Outros lugares",
};
export function validPoint(p: Point) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad,
    h =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function catalogQuery(point: Point, radius: number, kind: CatalogKind) {
  if (
    !validPoint(point) ||
    !Number.isFinite(radius) ||
    radius < 500 ||
    radius > 10000
  )
    throw new Error("Escolha uma região válida e raio entre 0,5 e 10 km.");
  const area = `(around:${Math.round(radius)},${point.lat.toFixed(5)},${point.lng.toFixed(5)})`;
  const selectors =
    kind === "food"
      ? ['[amenity~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]']
      : [
          '[tourism~"^(museum|gallery|attraction|viewpoint|zoo|aquarium|theme_park)$"]',
          "[historic]",
          '[leisure~"^(park|garden|nature_reserve)$"]',
          '[natural~"^(beach|waterfall|peak|cave_entrance)$"]',
          "[waterway=waterfall]",
          '[amenity~"^(place_of_worship|marketplace)$"]',
          "[place=square]",
        ];
  return `[out:json][timeout:25];(${selectors.map((s) => "nwr" + s + "[name]" + area + ";").join("")});out meta center;`;
}
export function normalizePlaces(
  raw: unknown,
  retrievedAt = new Date().toISOString(),
): Place[] {
  const input = raw as { elements?: unknown[]; remark?: string };
  if (input?.remark)
    throw new Error(
      "A fonte não concluiu a consulta. Reduza a região e tente novamente.",
    );
  if (!Array.isArray(input?.elements))
    throw new Error("Resposta inválida da fonte de lugares.");
  const seen = new Set<string>(),
    result: Place[] = [];
  for (const value of input.elements) {
    const e = value as {
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, unknown>;
      timestamp?: string;
    };
    if (
      !["node", "way", "relation"].includes(e.type) ||
      !Number.isSafeInteger(e.id)
    )
      continue;
    const tags = Object.fromEntries(
      Object.entries(e.tags || {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const coordinates = {
      lat: e.lat ?? e.center?.lat ?? NaN,
      lng: e.lon ?? e.center?.lon ?? NaN,
    };
    if (!tags.name || !validPoint(coordinates)) continue;
    const id = `osm:${e.type}:${e.id}`;
    if (seen.has(id)) continue;
    // Nearby node/area representations with the same identity are a single card.
    if (
      result.some(
        (p) =>
          distanceKm(p.coordinates, coordinates) < 0.05 &&
          ((tags.wikidata && p.tags.wikidata === tags.wikidata) ||
            p.name.toLowerCase() === tags.name.toLowerCase()),
      )
    )
      continue;
    seen.add(id);
    const category =
      [
        tags.tourism,
        tags.historic,
        tags.leisure,
        tags.natural,
        tags.waterway,
        tags.amenity,
        tags.place,
      ].find((t) => categories[t]) || "other";
    result.push({
      id,
      name: tags.name,
      coordinates,
      category,
      address: [
        tags["addr:street"],
        tags["addr:housenumber"],
        tags["addr:suburb"],
      ]
        .filter(Boolean)
        .join(", "),
      city: tags["addr:city"] || "",
      country: tags["addr:country"] || "",
      website: safeExternalUrl(tags.website || tags["contact:website"] || ""),
      source: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      retrievedAt,
      updatedAt: e.timestamp,
      tags,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
export function feeLabel(place: Place) {
  return place.tags.fee === "no"
    ? "Gratuito segundo o cadastro"
    : place.tags.fee === "yes"
      ? "Pago · preço não informado"
      : "Preço não informado";
}
