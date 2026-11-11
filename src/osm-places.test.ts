import { describe, expect, it, vi } from "vitest";
import { mergePlaces, searchNominatim, toOsmElements, viewbox, withoutParkExhibits } from "./osm-places";
import type { Place } from "./places";
import { complementAttractions } from "./catalog-service";
import { memoryStorage } from "./test/memory";

const item = (id: number, name: string, lat: number, lon: number, extra = {}) => ({
  osm_type: "node",
  osm_id: id,
  lat: String(lat),
  lon: String(lon),
  name,
  category: "tourism",
  type: "museum",
  address: { road: "Rua Coberta", house_number: "10", town: "Gramado", country: "Brasil" },
  extratags: { opening_hours: "Mo-Su 09:00-18:00", ...extra },
  ...extra,
});
const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

describe("OpenStreetMap pelo Nominatim", () => {
  it("converte endereço, categoria e horário cadastrado", () => {
    const [e] = toOsmElements([item(1, "Museu do Piano", -29.37, -50.87)]);
    expect(e.tags).toMatchObject({
      name: "Museu do Piano",
      tourism: "museum",
      "addr:street": "Rua Coberta",
      "addr:housenumber": "10",
      "addr:city": "Gramado",
      opening_hours: "Mo-Su 09:00-18:00",
    });
  });
  it("respeita 1 pedido por vez, filtra pelo raio e ignora lugares sem nome", async () => {
    let active = 0,
      maxActive = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return ok(
        String(url).includes("q=museum")
          ? [item(1, "Perto", -29.3747, -50.8764), item(2, "Longe", -29.5, -50.9), item(3, "", -29.3747, -50.8764)]
          : [],
      );
    });
    const places = await searchNominatim({ lat: -29.3747, lng: -50.8764 }, 2000, ["museum", "park"], {
      fetcher: fetcher as unknown as typeof fetch,
      gapMs: 1,
    });
    expect(places.map((p) => p.name)).toEqual(["Perto"]);
    expect(places[0].tags.provider).toBe("openstreetmap");
    expect(maxActive).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain("bounded=1");
    expect(url).not.toContain("autocomplete");
  });
  it("aceita falha parcial mas avisa quando nada respondeu", async () => {
    const fails = vi.fn(async () => ({ ok: false, status: 503 }) as Response);
    await expect(
      searchNominatim({ lat: 0, lng: 0 }, 1000, ["museum"], { fetcher: fails, gapMs: 0 }),
    ).rejects.toThrow();
    await expect(
      searchNominatim({ lat: 0, lng: 0 }, 1000, ["museum"], { fetcher: vi.fn(), endpoint: "", gapMs: 0 }),
    ).rejects.toThrow("off");
  });
  it("monta a área de busca ao redor do ponto", () => {
    const [west, north, east, south] = viewbox({ lat: 0, lng: 0 }, 1113.2).split(",").map(Number);
    expect(north).toBeCloseTo(0.01, 3);
    expect(south).toBeCloseTo(-0.01, 3);
    expect(east).toBeGreaterThan(west);
  });
});

describe("juntar Wikipédia e OpenStreetMap", () => {
  const place = (id: string, name: string, lat: number, tags: Record<string, string> = {}): Place => ({
    id,
    name,
    coordinates: { lat, lng: 0 },
    category: "museum",
    address: "",
    city: "",
    country: "",
    source: "",
    retrievedAt: "",
    tags,
  });
  it("não repete o mesmo lugar vindo das duas fontes", () => {
    const wiki = [place("wiki:pt:1", "Museu do Piano (Gramado)", 0, { wikidata: "Q1" })];
    const osm = [
      place("osm:node:1", "Museu do piano", 0.001),
      place("osm:node:2", "Outro nome", 0, { wikidata: "Q1" }),
      place("osm:node:3", "Mini Mundo", 0.002),
    ];
    expect(mergePlaces(wiki, osm).map((p) => p.id)).toEqual(["wiki:pt:1", "osm:node:3"]);
  });
  it("complementa um resultado da Wikipédia e guarda em cache", async () => {
    const fetcher = vi.fn(async () => ok([item(5, "Mini Mundo", -29.3747, -50.8764)]));
    const base = { places: [], retrievedAt: new Date().toISOString(), cached: false, provider: "wikipedia" as const };
    const storage = memoryStorage();
    const opts = { storage, fetcher: fetcher as unknown as typeof fetch, gapMs: 0 };
    const first = await complementAttractions({ lat: -29.3747, lng: -50.8764 }, 3000, base, opts);
    const calls = fetcher.mock.calls.length;
    const again = await complementAttractions({ lat: -29.3747, lng: -50.8764 }, 3000, base, opts);
    expect(first.complemented).toBe(true);
    expect(first.places.map((p) => p.name)).toEqual(["Mini Mundo"]);
    expect(again.places).toHaveLength(1);
    expect(fetcher.mock.calls.length).toBe(calls);
  });
});

describe("miniaturas de parques temáticos", () => {
  const p = (id: string, category: string, lat: number): Place => ({
    id, name: id, category, coordinates: { lat, lng: 0 }, address: "", city: "", country: "", source: "", retrievedAt: "", tags: {},
  });
  it("esconde atrações genéricas coladas a um parque temático", () => {
    const list = [p("Mini Mundo", "theme_park", 0), p("Castelo em miniatura", "attraction", 0.0005), p("Museu ao lado", "museum", 0.0005), p("Cascata longe", "attraction", 0.01)];
    expect(withoutParkExhibits(list).map((x) => x.id)).toEqual(["Mini Mundo", "Museu ao lado", "Cascata longe"]);
  });
});
