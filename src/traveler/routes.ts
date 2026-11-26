import { validPoint, type Point } from "../places";
import { routingBase, simplify } from "../journey/routing";

/*
 * Como chegar. A pé e de bicicleta usam os servidores de rotas da FOSSGIS
 * (routing.openstreetmap.de, dados do OpenStreetMap; no máximo 1 pedido por
 * segundo, só quando a pessoa pede). De carro usa o mesmo OSRM das rotas da
 * viagem. Transporte público não é calculado aqui: não há fonte aberta com
 * cobertura confiável, então abrimos o Google Maps ou o Apple Maps.
 */

export type Mode = "foot" | "bike" | "car";
export type Step = { text: string; meters: number };
export type TravelRoute = { mode: Mode; km: number; minutes: number; line: [number, number][]; steps: Step[]; provider: string };

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const fossgis = (env.VITE_ROTAS_PE_URL || "https://routing.openstreetmap.de").replace(/\/+$/, "");
export const routeCredit: Record<Mode, string> = {
  foot: "FOSSGIS · © OpenStreetMap contributors",
  bike: "FOSSGIS · © OpenStreetMap contributors",
  car: "OSRM · © OpenStreetMap contributors",
};
export function routeUrl(mode: Mode, from: Point, to: Point) {
  const coords = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const base = mode === "car" ? `${routingBase}/route/v1/driving` : `${fossgis}/routed-${mode}/route/v1/driving`;
  return `${base}/${coords}?overview=full&geometries=geojson&steps=true`;
}

let last = 0;
export async function travelRoute(mode: Mode, from: Point, to: Point, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<TravelRoute> {
  const { fetcher = fetch, signal } = options;
  if (!validPoint(from) || !validPoint(to)) throw new Error("Escolha a origem e o destino.");
  const pause = last + 1100 - Date.now();
  if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  last = Date.now();
  let res: Response;
  try {
    res = await fetcher(routeUrl(mode, from, to), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  } catch (e) {
    if ((e as Error)?.name === "AbortError" && signal?.aborted) throw e;
    throw new Error("Serviço de rotas indisponível agora. Abra no Google Maps ou no Apple Maps.");
  }
  if (!res.ok) throw new Error("Serviço de rotas indisponível agora. Abra no Google Maps ou no Apple Maps.");
  const data = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
  const r = data.routes?.[0];
  if (data.code !== "Ok" || !r) throw new Error("Nenhum caminho encontrado entre esses pontos.");
  return {
    mode,
    km: Math.round(r.distance / 100) / 10,
    // Os perfis a pé e de bicicleta do OSRM às vezes subestimam; usamos o maior
    // entre o tempo do servidor e um ritmo realista (4,8 km/h; 15 km/h).
    minutes: Math.round(Math.max(r.duration / 60, mode === "foot" ? (r.distance / 4800) * 60 : mode === "bike" ? (r.distance / 15000) * 60 : 0)),
    line: simplify((r.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]), 400),
    steps: (r.legs ?? []).flatMap((l) => l.steps ?? []).map((s) => ({ text: stepText(s), meters: Math.round(s.distance) })).filter((s) => s.text),
    provider: routeCredit[mode],
  };
}

type OsrmStep = { distance: number; name?: string; maneuver?: { type?: string; modifier?: string } };
type OsrmRoute = { distance: number; duration: number; geometry?: { coordinates?: [number, number][] }; legs?: { steps?: OsrmStep[] }[] };

const turns: Record<string, string> = {
  left: "Vire à esquerda",
  right: "Vire à direita",
  "slight left": "Mantenha-se à esquerda",
  "slight right": "Mantenha-se à direita",
  "sharp left": "Vire bem à esquerda",
  "sharp right": "Vire bem à direita",
  straight: "Siga em frente",
  uturn: "Faça o retorno",
};

/** Instrução em português a partir de uma etapa do OSRM. */
export function stepText(s: OsrmStep): string {
  const type = s.maneuver?.type ?? "";
  const mod = s.maneuver?.modifier ?? "";
  const on = s.name ? ` na ${s.name}` : "";
  const to = s.name ? ` para ${s.name}` : "";
  if (type === "depart") return `Saia${on}`;
  if (type === "arrive") return "Você chegou ao destino";
  if (type === "roundabout" || type === "rotary") return `Na rotatória, pegue a saída${to}`;
  if (type === "continue" || type === "new name") return `Continue${on}`;
  if (type === "merge") return `Entre${on}`;
  if (type === "fork") return `${mod.includes("left") ? "Mantenha-se à esquerda" : "Mantenha-se à direita"} na bifurcação${to}`;
  if (type === "end of road") return `No fim da rua, ${(turns[mod] ?? "siga").toLowerCase()}${to}`;
  if (turns[mod]) return `${turns[mod]}${to}`;
  return s.name ? `Siga pela ${s.name}` : "";
}

/** Links para abrir o trajeto nos apps de mapa (inclui transporte público). */
export function externalRoutes(from: Point | undefined, to: Point, name?: string) {
  const p = (x: Point) => `${x.lat},${x.lng}`;
  const google = (travelmode: string) =>
    "https://www.google.com/maps/dir/?" +
    new URLSearchParams({ api: "1", ...(from ? { origin: p(from) } : {}), destination: p(to), travelmode });
  const apple = (dirflg: string) => "https://maps.apple.com/?" + new URLSearchParams({ ...(from ? { saddr: p(from) } : {}), daddr: p(to), dirflg, ...(name ? { q: name } : {}) });
  return {
    googleWalk: google("walking"),
    googleBike: google("bicycling"),
    googleCar: google("driving"),
    googleTransit: google("transit"),
    appleWalk: apple("w"),
    appleCar: apple("d"),
    appleTransit: apple("r"),
    waze: "https://waze.com/ul?" + new URLSearchParams({ ll: p(to), navigate: "yes" }),
  };
}
