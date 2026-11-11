import { describe, expect, it, vi } from "vitest";
import {
  buildPlaces,
  classify,
  fetchImageCredits,
  findDestination,
  plainText,
  safeWikimediaImage,
  searchWikipediaAttractions,
} from "./wiki-places";
import { queryOverpass, searchCatalog } from "./catalog-service";
import { memoryStorage } from "./test/memory";

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

/** Answers like Wikipedia, Wikidata and Commons for a tiny Lisbon sample. */
function wikimedia(overrides: { sparqlFails?: boolean; commonsFails?: boolean } = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("list=geosearch"))
      return json({
        query: {
          geosearch: [
            { pageid: 1, title: "Castelo de São Jorge", lat: 38.7139, lon: -9.1335, dist: 10 },
            { pageid: 2, title: "Rua Áurea", lat: 38.71, lon: -9.138, dist: 20 },
            { pageid: 3, title: "Estação do Rossio", lat: 38.714, lon: -9.141, dist: 30 },
          ],
        },
      });
    if (url.includes("pageids="))
      return json({
        query: {
          pages: {
            1: {
              pageid: 1,
              title: "Castelo de São Jorge",
              fullurl: "https://pt.wikipedia.org/wiki/Castelo_de_S%C3%A3o_Jorge",
              description: "castelo em Lisboa",
              pageimage: "Castelo_Lisboa.jpg",
              thumbnail: { source: "https://upload.wikimedia.org/castelo.jpg" },
              pageprops: { wikibase_item: "Q1" },
            },
            2: { pageid: 2, title: "Rua Áurea", pageprops: { wikibase_item: "Q2" } },
            3: {
              pageid: 3,
              title: "Estação do Rossio",
              pageprops: { wikibase_item: "Q3" },
              pageimage: "Evil.jpg",
              thumbnail: { source: "https://evil.example.com/x.jpg" },
            },
          },
        },
      });
    if (url.startsWith("https://query.wikidata.org"))
      return overrides.sparqlFails
        ? json({}, 503)
        : json({
            results: {
              bindings: [
                { item: { value: "http://www.wikidata.org/entity/Q1" }, class: { value: "http://www.wikidata.org/entity/Q23413" }, site: { value: "https://castelodesaojorge.pt" }, heritage: { value: "x" } },
                { item: { value: "http://www.wikidata.org/entity/Q2" }, class: { value: "http://www.wikidata.org/entity/Q79007" } },
                { item: { value: "http://www.wikidata.org/entity/Q3" }, class: { value: "http://www.wikidata.org/entity/Q55488" }, heritage: { value: "x" } },
              ],
            },
          });
    if (url.startsWith("https://commons.wikimedia.org"))
      return overrides.commonsFails
        ? json({}, 500)
        : json({
            query: {
              normalized: [{ from: "File:Castelo_Lisboa.jpg", to: "File:Castelo Lisboa.jpg" }],
              pages: {
                9: {
                  title: "File:Castelo Lisboa.jpg",
                  imageinfo: [
                    {
                      extmetadata: {
                        Artist: { value: '<a href="//x">Ana &amp; Bia</a>' },
                        LicenseShortName: { value: "CC BY-SA 4.0" },
                        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                      },
                    },
                  ],
                },
              },
            },
          });
    return json({}, 404);
  });
}

describe("atrações da Wikipédia", () => {
  it("traz atrações reais com foto, crédito, site e patrimônio", async () => {
    const places = await searchWikipediaAttractions(
      { lat: 38.7139, lng: -9.1394 },
      3000,
      "pt",
      wikimedia() as unknown as typeof fetch,
    );
    const castle = places.find((p) => p.name === "Castelo de São Jorge")!;
    expect(castle.category).toBe("castle");
    expect(castle.website).toBe("https://castelodesaojorge.pt");
    expect(castle.tags.heritage).toBe("yes");
    expect(castle.tags.image).toBe("https://upload.wikimedia.org/castelo.jpg");
    expect(castle.tags.image_artist).toBe("Ana & Bia");
    expect(castle.tags.image_license).toBe("CC BY-SA 4.0");
    expect(castle.source).toContain("wikipedia.org");
    expect(castle.tags.unclassified).toBeUndefined();
  });
  it("marca ruas como não turísticas e aceita patrimônio com outra classe", async () => {
    const places = await searchWikipediaAttractions(
      { lat: 38.7139, lng: -9.1394 },
      3000,
      "pt",
      wikimedia() as unknown as typeof fetch,
    );
    expect(places.find((p) => p.name === "Rua Áurea")!.tags.unclassified).toBe("yes");
    const station = places.find((p) => p.name === "Estação do Rossio")!;
    expect(station.tags.unclassified).toBeUndefined();
    expect(station.tags.image).toBeUndefined(); // image from a non-Wikimedia host is refused
  });
  it("continua funcionando se a classificação ou os créditos falharem", async () => {
    const places = await searchWikipediaAttractions(
      { lat: 38.7139, lng: -9.1394 },
      3000,
      "pt",
      wikimedia({ sparqlFails: true, commonsFails: true }) as unknown as typeof fetch,
    );
    expect(places).toHaveLength(3);
    const castle = places.find((p) => p.name === "Castelo de São Jorge")!;
    expect(castle.tags.image_license).toBeUndefined();
    expect(castle.tags.unclassified).toBe("yes");
  });
  it("não inventa preço, horário ou nota", () => {
    const [p] = buildPlaces(
      [{ pageid: 5, title: "Museu", lat: 1, lon: 1, dist: 0 }],
      {},
      {},
      {},
      "en",
      "2026-11-11T00:00:00Z",
    );
    expect(p.tags.fee).toBeUndefined();
    expect(p.tags.opening_hours).toBeUndefined();
    expect(p.source).toBe("https://en.wikipedia.org/?curid=5");
  });
  it("classifica por classe do Wikidata", () => {
    expect(classify({ classes: ["Q33506"], heritage: false })).toBe("museum");
    expect(classify({ classes: ["Q79007"], heritage: false })).toBeUndefined();
    expect(classify({ classes: ["Q79007"], heritage: true })).toBe("attraction");
    expect(classify(undefined)).toBeUndefined();
  });
  it("só aceita imagens do Wikimedia e limpa o HTML do autor", () => {
    expect(safeWikimediaImage("https://upload.wikimedia.org/a.jpg")).toBeTruthy();
    expect(safeWikimediaImage("https://thumb.wikimedia.org/a.jpg")).toBeTruthy();
    expect(safeWikimediaImage("http://upload.wikimedia.org/a.jpg")).toBeUndefined();
    expect(safeWikimediaImage("https://wikimedia.org.evil.com/a.jpg")).toBeUndefined();
    expect(plainText('<span>Foto <b>de</b> João</span>&nbsp;')).toBe("Foto de João");
  });
  it("lê créditos mesmo com nomes de arquivo normalizados", async () => {
    const credits = await fetchImageCredits(
      ["Castelo_Lisboa.jpg"],
      wikimedia() as unknown as typeof fetch,
    );
    expect(credits["Castelo_Lisboa.jpg"].license).toBe("CC BY-SA 4.0");
  });
  it("localiza o destino pela busca e escolhe o primeiro com coordenadas", async () => {
    const fetcher = vi.fn(() =>
      json({
        query: {
          pages: {
            7: { title: "Gramado (desambiguação)", index: 1, fullurl: "x" },
            8: { title: "Gramado", index: 2, fullurl: "https://pt.wikipedia.org/wiki/Gramado", coordinates: [{ lat: -29.37, lon: -50.87 }] },
          },
        },
      }),
    );
    const found = await findDestination("gramado", "pt", fetcher as unknown as typeof fetch);
    expect(found?.name).toBe("Gramado");
    expect(found?.point.lat).toBe(-29.37);
  });
  it("usa a Wikipédia para atrações pelo catálogo, com cache", async () => {
    const fetcher = wikimedia();
    const storage = memoryStorage();
    const options = { storage, fetcher: fetcher as unknown as typeof fetch, language: "pt" as const };
    const first = await searchCatalog({ lat: 38.7139, lng: -9.1394 }, 3000, "attractions", options);
    const calls = fetcher.mock.calls.length;
    const again = await searchCatalog({ lat: 38.7139, lng: -9.1394 }, 3000, "attractions", options);
    expect(first.provider).toBe("wikipedia");
    expect(again.cached).toBe(true);
    expect(fetcher.mock.calls.length).toBe(calls);
  });
});

describe("restaurantes pelo Overpass", () => {
  const ok = { elements: [{ type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Tasca", amenity: "restaurant" } }] };
  it("usa o primeiro servidor que responder e ignora o que falhou", async () => {
    const fetcher = vi.fn((url: RequestInfo | URL) =>
      String(url).includes("down") ? json({}, 406) : json(ok),
    );
    const places = await queryOverpass("q", ["https://down", "https://up"], fetcher as unknown as typeof fetch);
    expect(places[0].name).toBe("Tasca");
  });
  it("tenta o próximo par quando os dois primeiros falham", async () => {
    const fetcher = vi.fn((url: RequestInfo | URL) =>
      String(url).includes("third") ? json(ok) : json({}, 504),
    );
    const places = await queryOverpass(
      "q",
      ["https://a", "https://b", "https://third"],
      fetcher as unknown as typeof fetch,
    );
    expect(places).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("recusa respostas parciais e explica quando todos falham", async () => {
    const fetcher = vi.fn(() => json({ elements: [], remark: "runtime error: timeout" }));
    await expect(
      queryOverpass("q", ["https://a", "https://b"], fetcher as unknown as typeof fetch),
    ).rejects.toThrow("ocupados");
  });
  it("desiste de um servidor lento pelo tempo limite", async () => {
    const fetcher = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
      String(url).includes("slow")
        ? new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          )
        : json(ok),
    );
    const places = await queryOverpass(
      "q",
      ["https://slow", "https://slow2", "https://fast"],
      fetcher as unknown as typeof fetch,
      50,
    );
    expect(places).toHaveLength(1);
  });
});
