import { describe, expect, it } from "vitest";
import type { Place } from "../places";
import { accessibilityOf, filterNearby, openNow, servicePlaces, walkMinutes, withDistance } from "./nearby";
import { planWalk, presets, removeStop, reorder, suggestNow } from "./suggest";
import { externalRoutes, routeUrl, stepText, travelRoute } from "./routes";
import { addWish, collections, markVisited, samePlace, visitedIds } from "./wishlist";

const here = { lat: 40.4168, lng: -3.7038 }; // Puerta del Sol, Madri
const place = (id: string, category: string, lat: number, lng: number, tags: Record<string, string> = {}): Place => ({
  id, name: id, category, coordinates: { lat, lng }, address: "", city: "", country: "", source: "", retrievedAt: "", tags,
});
// Segunda-feira, 10h (hora local do teste).
const monday10 = new Date(2026, 10, 23, 10, 0);

describe("lugares próximos", () => {
  it("serviços sem nome ganham um nome pelo tipo, e o raio é respeitado", () => {
    const list = servicePlaces(
      [
        { type: "node", id: 1, lat: 40.417, lng: -3.7035, tags: { amenity: "toilets" } } as never,
        { type: "node", id: 2, lat: 40.417, lon: -3.7035, tags: { amenity: "pharmacy", name: "Farmacia Sol" } },
        { type: "node", id: 3, lat: 40.417, lon: -3.7035, tags: { amenity: "atm", operator: "Santander" } },
        { type: "node", id: 4, lat: 40.5, lon: -3.7035, tags: { amenity: "pharmacy" } },
        { type: "node", id: 5, lat: 40.417, lon: -3.7035, tags: { amenity: "bench" } },
      ],
      here,
      1000,
    );
    expect(list.map((p) => p.name)).toEqual(["Farmacia Sol", "Santander · Caixa eletrônico"]);
    expect(list[0].category).toBe("svc:pharmacy");
  });
  it("aberto agora só quando o horário registrado diz", () => {
    expect(openNow(place("a", "museum", 0, 0, { opening_hours: "Mo-Fr 09:00-18:00" }), monday10)).toBe(true);
    expect(openNow(place("a", "museum", 0, 0, { opening_hours: "Sa-Su 09:00-18:00" }), monday10)).toBe(false);
    expect(openNow(place("a", "museum", 0, 0, {}), monday10)).toBeUndefined();
    expect(openNow(place("a", "museum", 0, 0, { opening_hours: "24/7" }), monday10)).toBe(true);
  });
  it("filtros não supõem nada", () => {
    const a = place("a", "park", 0, 0, { fee: "no", wheelchair: "yes" });
    const b = place("b", "museum", 0, 0, {});
    expect(filterNearby([a, b], { free: true }, new Set()).map((p) => p.id)).toEqual(["a"]);
    expect(filterNearby([a, b], { accessible: true }, new Set()).map((p) => p.id)).toEqual(["a"]);
    expect(filterNearby([a, b], { notVisited: true }, new Set(["a"])).map((p) => p.id)).toEqual(["b"]);
    expect(filterNearby([a, b], { openNow: true }, new Set())).toEqual([]);
  });
  it("acessibilidade só com o que está registrado", () => {
    expect(accessibilityOf({ wheelchair: "limited", "toilets:wheelchair": "yes" })).toEqual(["Acesso limitado para cadeira de rodas", "Banheiro adaptado"]);
    expect(accessibilityOf({})).toEqual([]);
  });
  it("distância e caminhada", () => {
    const list = withDistance([place("longe", "park", 40.43, -3.70), place("perto", "park", 40.418, -3.704)], here);
    expect(list[0].place.id).toBe("perto");
    expect(walkMinutes(1)).toBe(16);
  });
});

describe("o que fazer agora e roteiro espontâneo", () => {
  const places = [
    place("prado", "museum", 40.4138, -3.6921, { opening_hours: "Mo-Su 10:00-20:00" }),
    place("plaza", "square", 40.4155, -3.7074, { fee: "no" }),
    place("palacio", "palace", 40.418, -3.7143),
    place("retiro", "park", 40.4153, -3.6845, { fee: "no" }),
    place("fechado", "museum", 40.417, -3.704, { opening_hours: "Sa 10:00-12:00" }),
    place("cafe", "cafe", 40.4152, -3.7076),
  ];
  it("30 minutos só cabe o que é perto e rápido, e fechados ficam fora", () => {
    const s = suggestNow(places, here, presets.find((p) => p.id === "t30")!, new Set(), monday10);
    expect(s.map((x) => x.place.id)).toContain("plaza");
    expect(s.map((x) => x.place.id)).not.toContain("prado");
    expect(s.map((x) => x.place.id)).not.toContain("fechado");
  });
  it("roteiro de 3 horas cabe no tempo e termina num café", () => {
    const plan = planWalk(places, here, 180, { endWithFood: true, now: monday10 });
    expect(plan.totalMinutes).toBeLessThanOrEqual(180);
    expect(plan.stops.at(-1)!.place.category).toBe("cafe");
    expect(plan.stops.map((s) => s.place.id)).not.toContain("fechado");
    const moved = reorder(plan, here, 0, 1);
    expect(moved.stops[0].place.id).toBe(plan.stops[1].place.id);
    expect(removeStop(plan, here, 0).stops.length).toBe(plan.stops.length - 1);
  });
});

describe("como chegar", () => {
  it("monta as URLs de cada modo", () => {
    expect(routeUrl("foot", here, { lat: 40.42, lng: -3.7 })).toContain("routing.openstreetmap.de/routed-foot/route/v1/driving/-3.70380,40.41680;-3.70000,40.42000");
    expect(routeUrl("car", here, here)).toContain("/route/v1/driving/");
    const ext = externalRoutes(here, { lat: 40.42, lng: -3.7 });
    expect(ext.googleTransit).toContain("travelmode=transit");
    expect(ext.waze).toContain("navigate=yes");
  });
  it("lê a resposta do servidor e escreve as instruções em português", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({
        code: "Ok",
        routes: [{ distance: 1200, duration: 600, geometry: { coordinates: [[-3.7, 40.41], [-3.69, 40.42]] }, legs: [{ steps: [
          { distance: 300, name: "Calle Mayor", maneuver: { type: "depart" } },
          { distance: 800, name: "Gran Vía", maneuver: { type: "turn", modifier: "left" } },
          { distance: 0, name: "", maneuver: { type: "arrive" } },
        ] }] }],
      }))) as typeof fetch;
    const r = await travelRoute("foot", here, { lat: 40.42, lng: -3.69 }, { fetcher });
    expect(r.km).toBe(1.2);
    expect(r.minutes).toBe(15); // 1,2 km a 4,8 km/h, mais realista que os 10 min do servidor
    expect(r.steps.map((s) => s.text)).toEqual(["Saia na Calle Mayor", "Vire à esquerda para Gran Vía", "Você chegou ao destino"]);
    expect(r.line[0]).toEqual([40.41, -3.7]);
  });
  it("instruções de rotatória e bifurcação", () => {
    expect(stepText({ distance: 1, name: "Av. Paulista", maneuver: { type: "roundabout" } })).toBe("Na rotatória, pegue a saída para Av. Paulista");
    expect(stepText({ distance: 1, maneuver: { type: "fork", modifier: "slight right" } })).toBe("Mantenha-se à direita na bifurcação");
  });
});

describe("quero conhecer", () => {
  const p = { ...place("osm:node:1", "museum", 40.41, -3.69), name: "Museo del Prado" };
  it("não duplica o mesmo lugar na mesma coleção, mesmo vindo de outra fonte", () => {
    let { list } = addWish([], p);
    const other = { ...p, id: "wd:Q160112", coordinates: { lat: 40.4102, lng: -3.6902 } };
    expect(samePlace(p, other)).toBe(true);
    const again = addWish(list, other);
    expect(again.added).toBe(false);
    list = addWish(list, p, "Madri com a família").list;
    expect(collections(list)).toEqual([{ name: "Quero conhecer", count: 1 }, { name: "Madri com a família", count: 1 }]);
    expect(visitedIds(markVisited(list, p.id)).has(p.id)).toBe(true);
  });
});

describe("quero conhecer no backup", () => {
  it("junta sem duplicar e mantém visitados", async () => {
    const { mergeWishes, addWish } = await import("./wishlist");
    const p = (id: string, name: string) => ({ id, name, coordinates: { lat: 1, lng: 1 }, category: "", address: "", city: "", country: "", source: "x", retrievedAt: "", tags: {} });
    const here = addWish([], p("a", "Torre")).list;
    const file = [...addWish([], p("a", "Torre")).list, { place: p("b", "Museu"), collection: "Museus", addedAt: "2024-01-01T00:00:00Z", visitedAt: "2024-02-01T00:00:00Z" }, { nada: 1 }];
    const r = mergeWishes(here, file);
    expect(r.added).toBe(1);
    expect(r.list.find((w) => w.place.id === "b")?.visitedAt).toBe("2024-02-01T00:00:00.000Z");
    expect(mergeWishes(here, "x").added).toBe(0);
  });
});
