import { describe, it, expect, vi, afterEach } from "vitest";
import { catalogQuery, normalizePlaces, feeLabel, distanceKm } from "./places";
import { searchCatalog } from "./catalog-service";
import { memoryStorage } from "./test/memory";
const node = {
  type: "node",
  id: 1,
  lat: 40,
  lon: -3,
  tags: { name: "Museu", tourism: "museum", website: "javascript:alert(1)" },
};
afterEach(() => vi.restoreAllMocks());
describe("catálogo de lugares", () => {
  it("usa consulta geográfica limitada, categorias amplas e recusa coordenadas inválidas", () => {
    const q = catalogQuery({ lat: 40, lng: -3 }, 3000, "attractions");
    expect(q).toContain("[historic]");
    expect(q).toContain("around:3000,40.00000,-3.00000");
    expect(q).toContain("out meta center");
    expect(() =>
      catalogQuery({ lat: NaN, lng: 0 }, 3000, "attractions"),
    ).toThrow();
    expect(() =>
      catalogQuery({ lat: 0, lng: 0 }, 10001, "attractions"),
    ).toThrow();
  });
  it("normaliza e deduplica representações do mesmo local sem inventar dados", () => {
    const [p] = normalizePlaces(
      {
        elements: [
          node,
          node,
          { ...node, type: "way", id: 2, lat: 40.00001 },
          { type: "node", id: 3, tags: { name: "Sem coordenada" } },
        ],
      },
      "2026-11-10T00:00:00Z",
    );
    expect(p.name).toBe("Museu");
    expect(p.website).toBeUndefined();
    expect(p.source).toBe("https://www.openstreetmap.org/node/1");
    expect(feeLabel(p)).toBe("Preço não informado");
    expect(
      normalizePlaces({ elements: [node, { ...node, id: 2, lat: 41 }] }),
    ).toHaveLength(2);
  });
  it("não aceita resposta parcial e calcula distância geográfica, não rota", () => {
    expect(() =>
      normalizePlaces({ elements: [node], remark: "timeout" }),
    ).toThrow();
    expect(() => normalizePlaces({})).toThrow();
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.19,
      1,
    );
  });
  it("reusa cache sem requisição extra e deixa resultados disponíveis sem cota", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [node] }),
    });
    const storage = memoryStorage();
    const options = {
      storage,
      fetcher,
      endpoints: ["https://example.com/a"],
    };
    await searchCatalog({ lat: 40, lng: -3 }, 3000, "food", options);
    const result = await searchCatalog(
      { lat: 40, lng: -3 },
      3000,
      "food",
      options,
    );
    expect(result.cached).toBe(true);
    expect(result.provider).toBe("openstreetmap");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("sem servidor próprio usa o Nominatim para restaurantes", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          osm_type: "node",
          osm_id: 9,
          lat: "40.0001",
          lon: "-3.0001",
          name: "Casa Lucio",
          category: "amenity",
          type: "restaurant",
          extratags: { cuisine: "spanish" },
          address: { road: "Calle Cava Baja", city: "Madrid" },
        },
      ],
    });
    const result = await searchCatalog({ lat: 40, lng: -3 }, 1000, "food", {
      storage: memoryStorage(),
      fetcher,
      endpoints: [],
      gapMs: 0,
    });
    expect(result.places).toHaveLength(1);
    expect(result.places[0].category).toBe("restaurant");
    expect(result.places[0].tags.cuisine).toBe("spanish");
    expect(String(fetcher.mock.calls[0][0])).toContain("nominatim");
  });
});
