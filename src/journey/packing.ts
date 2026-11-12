import { uid, type Trip } from "../model";
import { roadKinds } from "./types";

/*
 * Packing lists (Etapa 16, Fase 9): per trip, per traveler, per category and
 * per transport. Suggestions use only the trip length, its scope and the
 * registered transport — never an unverified weather forecast.
 */

export const packingCategories = {
  clothes: "Roupas",
  shoes: "Calçados",
  hygiene: "Higiene",
  electronics: "Eletrônicos",
  documents: "Documentos",
  medicines: "Medicamentos pessoais",
  accessories: "Acessórios",
  other: "Outros",
} as const;
export type PackingCategory = keyof typeof packingCategories;

export type PackingItem = {
  id: string;
  title: string;
  category: PackingCategory;
  qty: number;
  packed: boolean;
  /** Participant id; undefined = shared / whole group. */
  travelerId?: string;
  /** Custom list name (e.g. "Mala de mão"). */
  list?: string;
  /** Why it was suggested, when it came from a suggestion. */
  reason?: string;
};

export function cleanPacking(v: unknown): PackingItem[] {
  return (Array.isArray(v) ? v : [])
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && typeof (x as Record<string, unknown>).title === "string")
    .slice(0, 800)
    .map((x) => ({
      id: typeof x.id === "string" && x.id ? x.id : uid(),
      title: String(x.title).trim().slice(0, 80),
      category: typeof x.category === "string" && x.category in packingCategories ? (x.category as PackingCategory) : "other",
      qty: Math.min(99, Math.max(1, Math.round(Number(x.qty) || 1))),
      packed: x.packed === true,
      travelerId: typeof x.travelerId === "string" && x.travelerId ? x.travelerId : undefined,
      list: typeof x.list === "string" && x.list.trim() ? x.list.trim().slice(0, 40) : undefined,
      reason: typeof x.reason === "string" ? x.reason.slice(0, 80) : undefined,
    }))
    .filter((x) => x.title);
}

export function addItem(trip: Trip, item: Omit<PackingItem, "id" | "packed"> & { packed?: boolean }): Trip {
  const [clean] = cleanPacking([{ ...item, id: uid() }]);
  if (!clean) throw new Error("Escreva o item.");
  return { ...trip, packing: [...(trip.packing || []), clean] };
}
export const updateItem = (trip: Trip, id: string, patch: Partial<PackingItem>): Trip => ({
  ...trip,
  packing: cleanPacking((trip.packing || []).map((x) => (x.id === id ? { ...x, ...patch, id } : x))),
});
export const removeItem = (trip: Trip, id: string): Trip => ({ ...trip, packing: (trip.packing || []).filter((x) => x.id !== id) });

export const tripNights = (trip: Trip) =>
  trip.start && trip.end ? Math.max(0, Math.round((Date.parse(trip.end + "T12:00:00Z") - Date.parse(trip.start + "T12:00:00Z")) / 86400000)) : undefined;

const key = (title: string) => title.trim().toLowerCase();

/** Suggestions not yet in the list. Quantities follow the number of days (capped for laundry). */
export function suggestions(trip: Trip, travelerId?: string): Omit<PackingItem, "id" | "packed">[] {
  const nights = tripNights(trip);
  const days = nights === undefined ? undefined : nights + 1;
  const clothes = days ? Math.min(days, 7) : 3;
  const kinds = new Set((trip.transports || []).map((t) => t.kind));
  const out: Omit<PackingItem, "id" | "packed">[] = [
    { title: "Camisetas", category: "clothes", qty: clothes, reason: days ? "pela duração (até 7, contando lavagem)" : "datas em aberto" },
    { title: "Roupas íntimas", category: "clothes", qty: days ? Math.min(days + 1, 8) : 4 },
    { title: "Meias", category: "clothes", qty: days ? Math.min(days, 7) : 3 },
    { title: "Calças ou bermudas", category: "clothes", qty: days ? Math.min(Math.ceil(days / 3), 4) : 2 },
    { title: "Agasalho", category: "clothes", qty: 1, reason: "confira a previsão do tempo antes de sair" },
    { title: "Pijama", category: "clothes", qty: 1 },
    { title: "Calçado confortável para caminhar", category: "shoes", qty: 1 },
    { title: "Escova e pasta de dente", category: "hygiene", qty: 1 },
    { title: "Desodorante", category: "hygiene", qty: 1 },
    { title: "Carregador do celular", category: "electronics", qty: 1 },
    { title: "Documento de identidade", category: "documents", qty: 1 },
    { title: "Medicamentos de uso pessoal", category: "medicines", qty: 1, reason: "leve receitas, se houver" },
  ];
  if (trip.scope === "international") {
    out.push({ title: "Passaporte", category: "documents", qty: 1, reason: "viagem internacional" });
    out.push({ title: "Adaptador de tomada", category: "electronics", qty: 1, reason: "confira o padrão do país" });
    out.push({ title: "Comprovante do seguro viagem", category: "documents", qty: 1, reason: "viagem internacional" });
  }
  if (kinds.has("flight")) {
    out.push({ title: "Saco transparente para líquidos", category: "accessories", qty: 1, reason: "voo: confira as regras da companhia" });
    out.push({ title: "Travesseiro de pescoço", category: "accessories", qty: 1, reason: "voo" });
  }
  if ([...kinds].some((k) => roadKinds.includes(k)) || (trip.vehicles || []).length) {
    out.push({ title: "Carteira de motorista", category: "documents", qty: 1, reason: "viagem de carro" });
    out.push({ title: "Carregador veicular", category: "electronics", qty: 1, reason: "viagem de carro" });
  }
  const have = new Set((trip.packing || []).filter((x) => x.travelerId === travelerId).map((x) => key(x.title)));
  return out.filter((s) => !have.has(key(s.title))).map((s) => ({ ...s, travelerId }));
}

/** Copies the items of another trip (all unpacked), skipping ones already here. */
export function reuseFrom(trip: Trip, other: Trip): Trip {
  const have = new Set((trip.packing || []).map((x) => `${x.travelerId ?? ""}|${key(x.title)}`));
  const people = new Set((trip.participants || []).map((p) => p.id));
  const copies = (other.packing || [])
    .filter((x) => !have.has(`${people.has(x.travelerId ?? "") ? x.travelerId : ""}|${key(x.title)}`))
    .map((x) => ({ ...x, id: uid(), packed: false, travelerId: x.travelerId && people.has(x.travelerId) ? x.travelerId : undefined }));
  return { ...trip, packing: [...(trip.packing || []), ...copies] };
}

export function progress(items: PackingItem[]) {
  const done = items.filter((x) => x.packed).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}
