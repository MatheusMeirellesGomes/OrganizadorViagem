import { describe, expect, it } from "vitest";
import { convertUnit, parseAmount, zoneDiff } from "./tools";
import { forecast, geocode, latestRate, weatherLabel, wikiSummary } from "./services";
import { countryFacts, phraseKeys, phrases } from "./data";

const json = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("ferramentas", () => {
  it("converte unidades e lê valores com vírgula", () => {
    expect(convertUnit("c", 30)).toBe(86);
    expect(convertUnit("km", 10)).toBe(6.21);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("1,234.5")).toBe(1234.5);
    expect(parseAmount("abc")).toBeUndefined();
  });
  it("calcula a diferença de fuso", () => {
    const d = new Date("2027-01-15T12:00:00Z");
    expect(zoneDiff("Europe/Lisbon", d, "America/Sao_Paulo")).toBe(3);
    expect(zoneDiff("Asia/Tokyo", d, "America/Sao_Paulo")).toBe(12);
    expect(zoneDiff("Asia/Kolkata", d, "UTC")).toBe(5.5);
    expect(zoneDiff("Nada/Aqui", d)).toBeUndefined();
  });
  it("tem as mesmas frases em todos os idiomas", () => {
    for (const p of Object.values(phrases)) expect(p.list).toHaveLength(phraseKeys.length);
    expect(phrases.ja.romaji).toHaveLength(phraseKeys.length);
    for (const f of Object.values(countryFacts)) expect(Object.values(f.emergency).length).toBeGreaterThan(0);
  });
});

describe("serviços do guia", () => {
  it("lê geocodificação, previsão, câmbio e wikipédia", async () => {
    expect(await geocode("Lisboa, Portugal", "pt", json({ results: [{ name: "Lisboa", latitude: 38.7, longitude: -9.1, timezone: "Europe/Lisbon", country_code: "pt", country: "Portugal" }] }))).toMatchObject({ countryCode: "PT", timezone: "Europe/Lisbon" });
    expect(await geocode("Xyz", "pt", json({}))).toBeUndefined();
    const f = await forecast(38.7, -9.1, json({ daily: { time: ["2027-01-01"], temperature_2m_max: [16], temperature_2m_min: [9], precipitation_probability_max: [40], weather_code: [61] } }));
    expect(f).toEqual([{ date: "2027-01-01", max: 16, min: 9, rain: 40, code: 61 }]);
    expect(weatherLabel(61).label).toBe("Chuva");
    expect(await latestRate("EUR", "BRL", json({ date: "2027-01-01", rates: { BRL: 6.1 } }))).toEqual({ from: "EUR", to: "BRL", rate: 6.1, date: "2027-01-01" });
    await expect(latestRate("EUR", "ARS", json({ rates: {} }))).rejects.toThrow();
    const w = await wikiSummary("Lisboa", "pt", json({ type: "standard", title: "Lisboa", extract: "Capital.", thumbnail: { source: "https://evil.example/x.jpg" }, content_urls: { desktop: { page: "https://pt.wikipedia.org/wiki/Lisboa" } } }));
    expect(w).toMatchObject({ title: "Lisboa", text: "Capital.", image: undefined });
    expect(await wikiSummary("Rio", "pt", json({ type: "disambiguation", extract: "x" }))).toBeUndefined();
  });
});
