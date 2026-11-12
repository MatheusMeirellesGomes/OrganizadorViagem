import { describe, it, expect } from "vitest";
import { aroundQuery, findAttractions, fetchDetails, parseWktPoint, toPlace } from "./wikidata";
import { parseCoordinates, suggest, debounced } from "./search";
import { applyFilters, emptyFilters, activeCount, rememberSearch, recentSearches, saveFilters, savedFilters, forgetHistory } from "./filters";
import { searchAttractions, loadMoreAttractions, searchFood, PAGE } from "./service";
import type { Place } from "../places";

/* A fake Wikidata/Wikimedia/Nominatim that answers by request content. */
type Row = Record<string, { value: string; "xml:lang"?: string }>;
const uri = (q: string) => ({ value: "http://www.wikidata.org/entity/" + q });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const sparqlRows = (rows: Row[]) => json({ results: { bindings: rows } });

function fakeWikidata(items: { qid: string; sl: number; lat: number; lng: number; cls: string[]; her?: boolean; gone?: boolean; label: string; img?: string; fee?: number }[]) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("query.wikidata.org")) {
      const q = new URLSearchParams(String(init?.body)).get("query") ?? "";
      calls.push(q.slice(0, 40));
      if (q.includes("wikibase:around"))
        return sparqlRows(items.map((i) => ({ item: uri(i.qid), sl: { value: String(i.sl) }, c: { value: `Point(${i.lng} ${i.lat})` } })));
      if (q.includes("?gone"))
        return sparqlRows(
          items.flatMap((i) =>
            i.cls.map((c) => ({ item: uri(i.qid), cls: uri(c), ...(i.her ? { her: uri("Q1") } : {}), ...(i.gone ? { gone: { value: "1900" } } : {}) })),
          ),
        );
      if (q.includes("wdt:P279")) return sparqlRows([]);
      if (q.includes("rdfs:label ?l"))
        return sparqlRows(items.map((i) => ({ item: uri(i.qid), l: { value: i.label, "xml:lang": "es" } })));
      if (q.includes("?img"))
        return sparqlRows(
          items.map((i) => ({
            item: uri(i.qid),
            ...(i.img ? { img: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(i.img) } } : {}),
            cc: { value: "ES" },
            ...(i.fee !== undefined ? { fee: { value: String(i.fee) }, unit: uri("Q4916") } : {}),
          })),
        );
      return sparqlRows([]);
    }
    if (url.includes("commons.wikimedia.org")) return json({ query: { pages: {} } });
    if (url.includes("/search?")) {
      calls.push(url);
      return json([]);
    }
    return json({});
  }) as typeof fetch;
  return { fetcher, calls };
}

const madrid = [
  { qid: "Q164027", sl: 90, lat: 40.453, lng: -3.688, cls: ["Q483110"], label: "Estadio Santiago Bernabéu", img: "Bernabeu.jpg" },
  { qid: "Q160112", sl: 80, lat: 40.4138, lng: -3.6921, cls: ["Q207694", "Q43229"], label: "Museo del Prado", img: "Prado.jpg", fee: 15 },
  { qid: "Q171517", sl: 46, lat: 40.418, lng: -3.7142, cls: ["Q53536964", "Q33506"], her: true, label: "Palacio Real de Madrid", img: "Palacio Real.jpg" },
  { qid: "Q1123493", sl: 40, lat: 40.4155, lng: -3.7074, cls: ["Q174782"], her: true, label: "Plaza Mayor de Madrid", img: "Plaza Mayor.jpg" },
  { qid: "Q3820626", sl: 30, lat: 40.40, lng: -3.70, cls: ["Q928830"], label: "La Almudena (metro)" },
  { qid: "Q2", sl: 20, lat: 40.41, lng: -3.70, cls: ["Q23413"], gone: true, her: true, label: "Castillo demolido" },
  { qid: "Q3", sl: 10, lat: 40.41, lng: -3.70, cls: ["Q1248784"], her: true, label: "Aeropuerto" },
];

describe("Wikidata por raio real", () => {
  it("monta a consulta com raio de 1 a 20 km e lê coordenadas", () => {
    expect(aroundQuery({ lat: 40.4, lng: -3.7 }, 20)).toContain('wikibase:radius "20"');
    expect(() => aroundQuery({ lat: 40.4, lng: -3.7 }, 25)).toThrow();
    expect(parseWktPoint("Point(-3.7142 40.418)")).toEqual({ lat: 40.418, lng: -3.7142 });
  });
  it("encontra palácio, praça e museu por relevância; descarta metrô, demolidos e aeroporto", async () => {
    const { fetcher } = fakeWikidata(madrid);
    const found = await findAttractions({ lat: 40.4168, lng: -3.7038 }, 20000, { fetcher });
    expect(found.map((c) => c.qid)).toEqual(["Q164027", "Q160112", "Q171517", "Q1123493"]);
    expect(found.find((c) => c.qid === "Q171517")?.category).toBe("palace");
  });
  it("detalhes: nome no idioma local quando falta o da interface, foto P18 e preço real", async () => {
    const { fetcher } = fakeWikidata(madrid);
    const details = await fetchDetails(["Q160112"], "pt", { fetcher });
    const p = toPlace({ qid: "Q160112", sitelinks: 80, coordinates: { lat: 40.41, lng: -3.69 }, category: "museum", heritage: false }, details.Q160112, "pt", "2026-11-11T00:00:00Z");
    expect(p.id).toBe("wd:Q160112");
    expect(p.name).toBe("Museo del Prado");
    expect(p.tags.image_file).toBe("Prado.jpg");
    expect(p.tags.image_source).toBe("wikidata-p18");
    expect([p.tags.fee, p.tags.charge, p.tags.currency]).toEqual(["yes", "15", "EUR"]);
  });
});

describe("Wikidata ocupado", () => {
  it("espera e tenta de novo quando o Wikidata responde 429", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 429, headers: { "Retry-After": "0" } });
      return sparqlRows([{ item: uri("Q1") }]);
    }) as typeof fetch;
    const { sparql } = await import("./wikidata");
    expect(await sparql("SELECT 1", fetcher)).toHaveLength(1);
    expect(calls).toBe(2);
  });
});

describe("serviço do Explorar", () => {
  it("guarda em cache, pagina e mantém ids estáveis", async () => {
    const many = Array.from({ length: PAGE + 5 }, (_, i) => ({ qid: "Q" + (1000 + i), sl: 500 - i, lat: 40.41, lng: -3.70, cls: ["Q33506"], label: "Museo " + i }));
    const { fetcher, calls } = fakeWikidata(many);
    const storage = new Map<string, string>();
    const fakeStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as Storage;
    const first = await searchAttractions({ lat: 40.41, lng: -3.70 }, 5000, { fetcher, storage: fakeStorage, lang: "pt" });
    expect(first.places).toHaveLength(PAGE);
    expect(first.hasMore).toBe(true);
    const before = calls.length;
    const again = await searchAttractions({ lat: 40.41, lng: -3.70 }, 5000, { fetcher, storage: fakeStorage, lang: "pt" });
    expect(again.cached).toBe(true);
    expect(calls.length).toBe(before);
    const more = await loadMoreAttractions(first, { fetcher, storage: fakeStorage, lang: "pt" });
    expect(more.places).toHaveLength(PAGE + 5);
    expect(new Set(more.places.map((p) => p.id)).size).toBe(PAGE + 5);
    expect(more.hasMore).toBe(false);
  });
  it("restaurantes: 'carregar mais' pede ao OpenStreetMap só os ainda não mostrados", async () => {
    const { fetcher, calls } = fakeWikidata([]);
    const previous = {
      kind: "food" as const, key: "k", retrievedAt: "2026-11-11T00:00:00Z", cached: false, hasMore: true,
      places: [{ id: "osm:node:1", name: "Casa Labra", coordinates: { lat: 40.4168, lng: -3.7038 }, category: "restaurant", address: "", city: "", country: "", source: "", retrievedAt: "", tags: { nominatim_place_id: "777" } }],
    };
    await searchFood({ lat: 40.4168, lng: -3.7038 }, 2000, ["dinner"], { fetcher, lang: "pt", gapMs: 0, previous }).catch(() => undefined);
    expect(calls.some((c) => c.includes("exclude_place_ids=777"))).toBe(true);
    expect(calls.some((c) => c.includes("q=restaurant"))).toBe(true);
  });
});

describe("busca mundial", () => {
  it("lê coordenadas sem consultar nada", () => {
    expect(parseCoordinates("40.4168, -3.7038")).toEqual({ lat: 40.4168, lng: -3.7038 });
    expect(parseCoordinates("-19,9167; -43,9345")).toEqual({ lat: -19.9167, lng: -43.9345 });
    expect(parseCoordinates("Madrid")).toBeUndefined();
    expect(parseCoordinates("95, 10")).toBeUndefined();
  });
  it("une busca por nome e texto completo, exige coordenadas e marca destinos", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wbsearchentities")) return json({ search: [{ id: "Q2807" }, { id: "Q6728617" }] });
      if (url.includes("list=search")) return json({ query: { search: [{ title: "Q1123493" }] } });
      return sparqlRows([
        { item: uri("Q2807"), c: { value: "Point(-3.7 40.4)" }, l: { value: "Madrid" }, d: { value: "capital de Espanha" }, pop: { value: "3300000" }, sl: { value: "300" }, coL: { value: "Espanha" } },
        { item: uri("Q1123493"), c: { value: "Point(-3.707 40.415)" }, l: { value: "Praça Maior" }, sl: { value: "40" }, inL: { value: "Madrid" }, coL: { value: "Espanha" } },
      ]);
    }) as typeof fetch;
    const s = await suggest("Madri", "pt", { fetcher });
    expect(s.map((x) => x.name)).toEqual(["Madrid", "Praça Maior"]);
    expect(s[0].destination).toBe(true);
    expect(s[1].destination).toBe(false);
    expect(s[1].context).toBe("Madrid, Espanha");
  });
  it("cancela a busca anterior enquanto a pessoa digita", async () => {
    const seen: string[] = [];
    const run = debounced(async (t: string) => (seen.push(t), t), 5);
    const first = run("Ma");
    const second = run("Madrid");
    expect(await first).toBeUndefined();
    expect(await second).toBe("Madrid");
    expect(seen).toEqual(["Madrid"]);
  });
});

describe("filtros combinados", () => {
  const base = (id: string, over: Partial<Place>): Place => ({
    id, name: id, coordinates: { lat: 40.4168, lng: -3.7038 }, category: "museum", address: "", city: "", country: "", source: "", retrievedAt: "", tags: {}, ...over,
  });
  const center = { lat: 40.4168, lng: -3.7038 };
  const list = [
    base("Prado", { tags: { fee: "yes", charge: "15", sitelinks: "80" } }),
    base("Retiro", { category: "park", coordinates: { lat: 40.4153, lng: -3.6844 }, tags: { fee: "no", sitelinks: "60" } }),
    base("Longe", { category: "park", coordinates: { lat: 40.5, lng: -3.7 }, tags: { sitelinks: "90" } }),
    base("Palácio", { category: "palace", tags: { sitelinks: "46", wheelchair: "yes" } }),
  ];
  it("categoria + gratuito + distância funcionam juntos", () => {
    const f = { ...emptyFilters("attractions"), groups: ["parks"], fee: "free" as const, maxKm: 5, includeUnknown: false };
    expect(applyFilters(list, f, "attractions", center).map((p) => p.name)).toEqual(["Retiro"]);
    expect(activeCount(f, "attractions")).toBe(3);
  });
  it("sem informação entra só quando pedido; ordenações", () => {
    const f = { ...emptyFilters("attractions"), fee: "free" as const };
    expect(applyFilters(list, f, "attractions", center).map((p) => p.name)).toEqual(["Longe", "Retiro", "Palácio"]);
    expect(applyFilters(list, { ...emptyFilters("attractions"), sort: "price" }, "attractions").map((p) => p.name)[0]).toBe("Retiro");
    expect(applyFilters(list, { ...emptyFilters("attractions"), sort: "distance" }, "attractions", center)[0].name).not.toBe("Longe");
    expect(applyFilters(list, { ...emptyFilters("attractions"), accessible: true }, "attractions").map((p) => p.name)).toEqual(["Palácio"]);
    expect(applyFilters(list, { ...emptyFilters("attractions"), text: "palacio" }, "attractions").map((p) => p.name)).toEqual(["Palácio"]);
  });
  it("buscas recentes e filtros salvos ficam só neste aparelho e podem ser apagados", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
    rememberSearch("Madrid", { lat: 40.4, lng: -3.7 }, s);
    rememberSearch("Lisboa", { lat: 38.7, lng: -9.1 }, s);
    rememberSearch("Madrid", { lat: 40.4, lng: -3.7 }, s);
    expect(recentSearches(s).map((r) => r.name)).toEqual(["Madrid", "Lisboa"]);
    saveFilters("Jantar barato", "food", { ...emptyFilters("food"), meals: ["dinner"], prices: [1] }, s);
    expect(savedFilters(s)[0].filters.meals).toEqual(["dinner"]);
    forgetHistory(s);
    expect(recentSearches(s)).toEqual([]);
  });
});
