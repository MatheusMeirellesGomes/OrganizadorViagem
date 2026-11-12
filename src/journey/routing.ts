import { validPoint, type Point } from "../places";
import type { RoadRoute } from "./types";

/*
 * Road routes from an OSRM server (OpenStreetMap data). Only called when the
 * person clicks "Calcular rota". VITE_ROTAS_URL chooses the server; "off"
 * disables it. Without a provider the person types the distance; a straight
 * line is never presented as a road distance.
 */

type Fetcher = typeof fetch;
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const routingBase = (env.VITE_ROTAS_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
export const routingEnabled = routingBase !== "off" && /^https:\/\//.test(routingBase);
export const routingCredit = "OSRM · © OpenStreetMap contributors";

/** Keeps at most `max` points of a line (enough for the map, small to store). */
export function simplify(line: [number, number][], max = 200): [number, number][] {
  if (line.length <= max) return line;
  const step = (line.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => line[Math.round(i * step)]);
}

export async function roadRoutes(points: Point[], options: { fetcher?: Fetcher; signal?: AbortSignal; base?: string } = {}): Promise<RoadRoute[]> {
  const { fetcher = fetch, signal, base = routingBase } = options;
  if (base === "off" || !/^https:\/\//.test(base)) throw new Error("Cálculo de rotas desligado. Informe a distância manualmente.");
  if (points.length < 2 || points.length > 12 || !points.every(validPoint)) throw new Error("Escolha origem e destino no mapa ou na busca para calcular a rota.");
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  let res: Response;
  try {
    res = await fetcher(`${base}/route/v1/driving/${coords}?overview=simplified&geometries=geojson&alternatives=${points.length === 2 ? "true" : "false"}`, { signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new Error("Serviço de rotas indisponível. Informe a distância manualmente.");
  }
  if (!res.ok) throw new Error("Serviço de rotas indisponível. Informe a distância manualmente.");
  const data = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[] };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("Nenhuma rota de carro encontrada entre esses pontos.");
  const fetchedAt = new Date().toISOString();
  return data.routes.slice(0, 3).map((r) => ({
    provider: routingCredit,
    distanceKm: Math.round(r.distance / 100) / 10,
    durationMin: Math.round(r.duration / 60),
    line: simplify((r.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number])),
    fetchedAt,
  }));
}

/** Google Maps / Apple Maps directions by car, with stops. */
export function drivingLinks(points: Point[]) {
  if (points.length < 2 || !points.every(validPoint)) return;
  const s = (p: Point) => `${p.lat},${p.lng}`;
  const google =
    "https://www.google.com/maps/dir/?" +
    new URLSearchParams({
      api: "1",
      origin: s(points[0]),
      destination: s(points[points.length - 1]),
      travelmode: "driving",
      ...(points.length > 2 ? { waypoints: points.slice(1, -1).map(s).join("|") } : {}),
    });
  const apple = "https://maps.apple.com/?" + new URLSearchParams({ saddr: s(points[0]), daddr: s(points[points.length - 1]), dirflg: "d" });
  return { google, apple };
}
