import { describe, it, expect } from "vitest";
import { buildPrompt, parseAnswer, tripContext } from "../supabase/functions/_shared/assistant";
import { askAssistant } from "./assistant";
import { newTrip } from "./model";

const trip = newTrip({
  title: "Madrid",
  destination: "Madrid",
  start: "2027-01-25",
  end: "2027-01-28",
  activities: [{ id: "a", title: "Palacio Real", day: 1, time: "10:00", address: "Calle de Bailén", done: false, kind: "Palácios", notes: "segredo" }],
  reservations: [{ id: "r", title: "Hotel", details: "Código ABC123", url: "" }],
  stays: [{ id: "h", name: "Hotel Madrid", address: "Gran Vía 1", city: "Madrid", start: "2027-01-25", end: "2027-01-28", checkInTime: "", checkOutTime: "", url: "", confirmation: "XYZ789", notes: "" }],
  expenses: [{ id: "e", title: "Hotel", amount: 900, currency: "EUR" }],
  participants: [{ id: "p", name: "Ana Souza" }],
  placeChoices: [{ decision: "want", decidedAt: "", place: { id: "wd:Q160112", name: "Prado", address: "", city: "", country: "", category: "museum", source: "", retrievedAt: "", tags: { opening_hours: "Mo-Sa 10:00-20:00" } } }],
});

describe("assistente", () => {
  it("o contexto não leva códigos de reserva, notas, gastos nem nomes das pessoas", () => {
    const text = JSON.stringify(tripContext(trip));
    for (const secret of ["ABC123", "XYZ789", "segredo", "900", "Ana Souza", "Gran Vía"]) expect(text).not.toContain(secret);
    expect(text).toContain("wd:Q160112");
    const { system } = buildPrompt(trip, "O que faço no dia 2?", "en");
    expect(system).toContain("English");
    expect(system).toContain("Nunca invente preços");
  });
  it("lê a resposta com segurança: só ids salvos, dias válidos, no máximo 8", () => {
    const r = parseAnswer('Claro! {"answer":"Veja","suggestions":[{"title":"Prado","day":2,"placeId":"wd:Q160112","reason":"perto"},{"title":"Lugar inventado","placeId":"wd:Q1","day":99999},{"foo":1}]}', ["wd:Q160112"]);
    expect(r.answer).toBe("Veja");
    expect(r.suggestions).toEqual([
      { title: "Prado", day: 2, placeId: "wd:Q160112", reason: "perto" },
      { title: "Lugar inventado", day: undefined, placeId: undefined, reason: "" },
    ]);
    expect(parseAnswer("texto livre", []).suggestions).toEqual([]);
  });
  it("cliente chama a função do servidor e traduz o limite diário", async () => {
    const ok = { functions: { invoke: async () => ({ data: { answer: "Oi", suggestions: [{ title: "Prado", placeId: "wd:Q160112" }] }, error: null }) } };
    expect((await askAssistant(ok as never, "t", "Sugestões?", "pt", ["wd:Q160112"])).suggestions[0].placeId).toBe("wd:Q160112");
    const limited = { functions: { invoke: async () => ({ data: null, error: { context: { status: 429 } } }) } };
    await expect(askAssistant(limited as never, "t", "Sugestões?", "pt", [])).rejects.toThrow("Limite diário");
    await expect(askAssistant(ok as never, "t", "a", "pt", [])).rejects.toThrow("maior");
  });
});
