/*
 * Shared by the browser and the server function "assistente" (Etapa 15).
 * The context sent to the AI has only what it needs to suggest an itinerary:
 * destination, dates, stays (name and city), the day plan and the saved
 * places. Booking codes, booking details, documents, photos, expenses and
 * participants' names are never sent.
 */

type Activity = { id: string; title: string; day: number; time: string; kind: string; placeId?: string };
type Place = { id: string; name: string; category: string; tags?: Record<string, string> };
type TripLike = {
  title: string;
  destination: string;
  start: string;
  end: string;
  activities: Activity[];
  stays?: { name: string; city: string; start: string; end: string }[];
  placeChoices?: { place: Place; decision: string }[];
  party?: { adults?: number; children?: number; preferences?: string };
};

export type Suggestion = { title: string; reason: string; day?: number; placeId?: string };
export type AssistantAnswer = { answer: string; suggestions: Suggestion[] };

export function tripContext(trip: TripLike) {
  return {
    destino: trip.destination.slice(0, 120),
    datas: { inicio: trip.start, fim: trip.end },
    hospedagens: (trip.stays ?? []).slice(0, 20).map((s) => ({ nome: s.name.slice(0, 80), cidade: s.city.slice(0, 80), entrada: s.start, saida: s.end })),
    roteiro: trip.activities.slice(0, 120).map((a) => ({ dia: a.day, horario: a.time, titulo: a.title.slice(0, 80), tipo: a.kind.slice(0, 40) })),
    lugares_salvos: (trip.placeChoices ?? [])
      .filter((c) => c.decision === "want" || c.decision === "maybe")
      .slice(0, 80)
      .map((c) => ({
        id: c.place.id,
        nome: c.place.name.slice(0, 80),
        categoria: c.place.category,
        ...(c.place.tags?.opening_hours ? { horario: c.place.tags.opening_hours.slice(0, 120) } : {}),
        ...(c.place.tags?.fee ? { entrada_gratuita: c.place.tags.fee === "no" } : {}),
      })),
    grupo: trip.party ? { adultos: trip.party.adults, criancas: trip.party.children, preferencias: (trip.party.preferences ?? "").slice(0, 300) } : undefined,
  };
}

const languageNames: Record<string, string> = { pt: "português do Brasil", en: "English", es: "español" };

export function buildPrompt(trip: TripLike, question: string, lang: string) {
  const system = [
    "Você é o assistente de planejamento do app Gomes pelo Mundo.",
    `Responda em ${languageNames[lang] ?? languageNames.pt}, de forma curta e prática.`,
    "Use os lugares salvos (com seus ids) sempre que possível. Ideias fora da lista devem vir sem placeId e com o motivo, para a pessoa confirmar.",
    "Nunca invente preços, horários, avaliações, reservas ou disponibilidade. Se não souber, diga que é preciso confirmar.",
    'Responda somente com JSON no formato {"answer": string, "suggestions": [{"title": string, "reason": string, "day"?: number, "placeId"?: string}]}, com no máximo 8 sugestões.',
  ].join("\n");
  const user = `Viagem:\n${JSON.stringify(tripContext(trip))}\n\nPergunta:\n${question.trim().slice(0, 600)}`;
  return { system, user };
}

/** Reads the AI answer safely: only known place ids, valid days, short texts. */
export function parseAnswer(text: string, allowedPlaceIds: string[], maxDay = 3660): AssistantAnswer {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { answer: text.trim().slice(0, 1500), suggestions: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { answer: text.trim().slice(0, 1500), suggestions: [] };
  }
  const o = (raw ?? {}) as { answer?: unknown; suggestions?: unknown };
  const allowed = new Set(allowedPlaceIds);
  const suggestions = (Array.isArray(o.suggestions) ? o.suggestions : [])
    .slice(0, 8)
    .map((s) => (s ?? {}) as Record<string, unknown>)
    .filter((s) => typeof s.title === "string" && s.title.trim())
    .map((s) => ({
      title: String(s.title).slice(0, 120),
      reason: typeof s.reason === "string" ? s.reason.slice(0, 300) : "",
      day: Number.isInteger(s.day) && Number(s.day) >= 1 && Number(s.day) <= maxDay ? Number(s.day) : undefined,
      placeId: typeof s.placeId === "string" && allowed.has(s.placeId) ? s.placeId : undefined,
    }));
  return { answer: typeof o.answer === "string" ? o.answer.slice(0, 1500) : "", suggestions };
}
