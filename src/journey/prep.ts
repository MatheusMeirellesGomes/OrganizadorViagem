import type { Trip } from "../model";
import { safeExternalUrl } from "../travel-mode";
import { roadKinds } from "./types";

/*
 * International preparation (Etapa 16, Fase 10). Informative only: the app
 * does not say a document is mandatory, because that depends on country,
 * nationality, situation and date. Each item records what the person checked
 * (status, the official source they used and when) — no document numbers.
 */

export const prepItems = {
  passport: { title: "Passaporte", hint: "Confira a validade exigida pelo país de destino." },
  visa: { title: "Visto ou autorização de viagem", hint: "Depende da nacionalidade, do motivo e da duração. Consulte o consulado ou o site oficial." },
  insurance: { title: "Seguro viagem", hint: "Alguns países exigem cobertura mínima. Confira na fonte oficial." },
  entry: { title: "Documentos de entrada", hint: "Formulários, comprovantes de hospedagem, passagem de volta ou recursos." },
  license: { title: "Habilitação", hint: "Leve a sua carteira de motorista se for dirigir." },
  idp: { title: "Permissão Internacional para Dirigir", hint: "Exigência varia por país e locadora. Confirme antes de alugar." },
  rentalRules: { title: "Regras da locadora", hint: "Idade mínima, cartão de crédito, caução e franquia." },
  border: { title: "Autorização para cruzar fronteiras", hint: "Confirme com a locadora se o carro pode entrar em outro país." },
  baggage: { title: "Bagagem", hint: "Franquia de cada trecho e itens proibidos." },
  currency: { title: "Moedas", hint: "Como vai pagar: cartão, dinheiro e taxas." },
  plugs: { title: "Adaptadores de tomada", hint: "Confira o padrão de tomada e a voltagem do destino." },
  connectivity: { title: "Conectividade", hint: "Chip local, eSIM ou roaming." },
} as const;
export type PrepKey = keyof typeof prepItems;

export const prepStatuses = { todo: "A verificar", ok: "Resolvido", na: "Não se aplica" } as const;
export type PrepState = {
  status: keyof typeof prepStatuses;
  /** Official page the person used. */
  source?: string;
  /** Date the person checked it (YYYY-MM-DD). */
  checkedAt?: string;
  note?: string;
};

/** Which items matter for this trip; the person can still see all. */
export function relevantPrep(trip: Trip): PrepKey[] {
  const keys: PrepKey[] = ["passport", "visa", "insurance", "entry", "baggage", "currency", "plugs", "connectivity"];
  const car = (trip.transports || []).some((t) => roadKinds.includes(t.kind)) || (trip.vehicles || []).length > 0;
  if (car) keys.push("license", "idp");
  if ((trip.vehicles || []).some((v) => v.ownership === "rental")) keys.push("rentalRules");
  const countries = new Set((trip.vehicles || []).flatMap((v) => v.rental?.countries ?? []).map((c) => c.toLowerCase()));
  if (car && countries.size > 1) keys.push("border");
  return [...new Set(keys)];
}

export function cleanPrepState(v: unknown): PrepState | undefined {
  const s = (v && typeof v === "object" ? v : undefined) as Record<string, unknown> | undefined;
  if (!s || typeof s.status !== "string" || !(s.status in prepStatuses)) return;
  return {
    status: s.status as PrepState["status"],
    source: typeof s.source === "string" ? safeExternalUrl(s.source.trim()) : undefined,
    checkedAt: typeof s.checkedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.checkedAt) ? s.checkedAt : undefined,
    // Short free note; the UI warns not to type document numbers.
    note: typeof s.note === "string" && s.note.trim() ? s.note.trim().slice(0, 200) : undefined,
  };
}

export function cleanPrep(v: unknown): Trip["prep"] {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, PrepState> = {};
  for (const [k, s] of Object.entries(v)) if (k in prepItems) {
    const c = cleanPrepState(s);
    if (c) out[k] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

export function setPrep(trip: Trip, key: PrepKey, state: PrepState): Trip {
  const c = cleanPrepState(state);
  if (!c) throw new Error("Situação inválida.");
  if (state.source && !c.source) throw new Error("Use um link começando com https:// ou http://.");
  if (c.note && looksLikeDocumentNumber(c.note)) throw new Error("Não guarde números de documentos aqui.");
  return { ...trip, prep: { ...(trip.prep || {}), [key]: c } };
}

/** Looks like a passport / ID number: kept out of the notes. */
export const looksLikeDocumentNumber = (s: string) => /\b[A-Z]{1,3}\d{6,9}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/i.test(s);
