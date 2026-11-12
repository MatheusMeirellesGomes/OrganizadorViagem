import { describe, it, expect } from "vitest";
import { searchAttractions, searchFood } from "./service";
import { suggest } from "./search";
import { verifiedPhoto } from "./photos";
import { applyFilters, emptyFilters } from "./filters";
import type { Place } from "../places";

/*
 * Tests against the REAL sources (Wikidata, Wikimedia Commons, OpenStreetMap).
 * They do not run with "npm test" because they need internet and depend on
 * data that people keep editing. Run with:  npm run testar:explorar
 * Nothing here is mocked: if a place disappears from the sources, the test fails.
 */
const live = Boolean((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.EXPLORAR_AO_VIVO);
const agent = "GomesPeloMundo/0.2 (testes do organizador de viagens; https://github.com/MatheusMeirellesGomes/OrganizadorViagem)";
const fetcher = ((input: RequestInfo | URL, init: RequestInit = {}) =>
  fetch(input, { ...init, headers: { ...(init.headers as Record<string, string>), "User-Agent": agent } })) as typeof fetch;
const opts = { fetcher, lang: "pt" };

async function all(point: { lat: number; lng: number }, radius: number) {
  const r = await searchAttractions(point, radius, opts);
  return { r, ids: new Set((r.candidates ?? []).map((c) => c.qid)), places: r.places };
}

/** P18 of each item, read directly from Wikidata, to check the card photo belongs to it. */
async function p18(qids: string[]) {
  const url = "https://www.wikidata.org/w/api.php?" + new URLSearchParams({ action: "wbgetentities", ids: qids.join("|"), props: "claims", format: "json" });
  const json = await (await fetcher(url)).json();
  return Object.fromEntries(
    qids.map((q) => [q, json.entities?.[q]?.claims?.P18?.map((c: { mainsnak: { datavalue?: { value: string } } }) => c.mainsnak.datavalue?.value) ?? []]),
  ) as Record<string, string[]>;
}

describe.skipIf(!live)("Explorar com fontes reais", { timeout: 180000 }, () => {
  it("Madrid, raio de 20 km: lugares obrigatórios", async () => {
    const { ids, places } = await all({ lat: 40.4168, lng: -3.7038 }, 20000);
    const required = {
      Q171517: "Palacio Real de Madrid",
      Q1123493: "Plaza Mayor",
      Q427163: "Puerta del Sol",
      Q1140634: "Puerta de Alcalá",
      Q849711: "Catedral de la Almudena",
      Q1131807: "Parque del Retiro",
      Q160112: "Museo del Prado",
      Q164027: "Estadio Santiago Bernabéu",
      Q1994806: "Zoo Aquarium de Madrid",
    };
    for (const [qid, name] of Object.entries(required)) expect(ids.has(qid), name).toBe(true);
    expect(places.find((p) => p.tags.wikidata === "Q171517")?.category).toBe("palace");
  });

  it("Segóvia: aqueduto, Alcázar e catedral", async () => {
    const { ids, places } = await all({ lat: 40.9481, lng: -4.1184 }, 5000);
    // Aqueduto (Q244947), Alcázar (Q557337) e Catedral (Q1499912).
    for (const q of ["Q244947", "Q557337", "Q1499912"]) expect(ids.has(q), q).toBe(true);
    expect(places.find((p) => p.tags.wikidata === "Q557337")?.category).toBe("castle");
  });

  it("Lisboa, Paris e Belo Horizonte trazem pontos conhecidos", async () => {
    const cases: [number, number, number, string[]][] = [
      [38.7223, -9.1393, 10000, ["Q215003", "Q272781"]], // Torre de Belém, Mosteiro dos Jerónimos
      [48.8566, 2.3522, 10000, ["Q243", "Q19675"]], // Torre Eiffel, Louvre
      [-19.9167, -43.9345, 15000, ["Q636642"]], // Igreja São Francisco de Assis (Pampulha)
    ];
    for (const [lat, lng, radius, qids] of cases) {
      const { ids } = await all({ lat, lng }, radius);
      for (const q of qids) expect(ids.has(q), q).toBe(true);
    }
  });

  it("cada foto mostrada é a imagem do próprio item no Wikidata", async () => {
    const { places } = await all({ lat: 40.4168, lng: -3.7038 }, 20000);
    const sample = places.filter((p) => verifiedPhoto(p)?.via === "wikidata").slice(0, 40);
    const real = await p18(sample.map((p) => p.tags.wikidata));
    for (const p of sample) {
      const own = real[p.tags.wikidata].map((f) => f.replace(/_/g, " "));
      expect(own, p.name).toContain(p.tags.image_file);
    }
    const files = sample.map((p) => p.tags.image_file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("busca por nomes em outros idiomas e com desambiguação", async () => {
    const cases: [string, string][] = [
      ["Madri", "Q2807"],
      ["Palácio Real de Madrid", "Q171517"],
      ["Alcazar de Segovia", "Q557337"],
      ["Torre Eiffel, Paris", "Q243"],
      ["Belo Horizonte", "Q42800"],
      ["Lisboa", "Q597"],
    ];
    for (const [text, qid] of cases) {
      const s = await suggest(text, "pt", { fetcher });
      expect(s.slice(0, 3).map((x) => x.qid), text).toContain(qid);
    }
    const alcazar = await suggest("Plaza del Alcázar", "pt", { fetcher });
    expect(alcazar.length).toBeGreaterThan(0);
    expect(alcazar.every((s) => s.context.length > 0)).toBe(true);
  });

  it("restaurantes para jantar em Madrid, com horário cadastrado", async () => {
    const r = await searchFood({ lat: 40.4168, lng: -3.7038 }, 2000, ["dinner"], opts);
    expect(r.places.length).toBeGreaterThan(10);
    const dinner = applyFilters(r.places, { ...emptyFilters("food"), meals: ["dinner"], includeUnknown: false }, "food");
    expect(dinner.length).toBeGreaterThan(0);
    for (const p of dinner as Place[]) expect(p.tags.opening_hours || p.tags.dinner).toBeTruthy();
  });
});
