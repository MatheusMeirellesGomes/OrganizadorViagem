import { distanceKm, type Place } from "../places";
import type { SavedPlace } from "../choices";

/*
 * Quero Conhecer: lugares que a pessoa quer visitar um dia, fora de qualquer
 * viagem, em coleções ("Praias que quero visitar", "Restaurantes de Madrid").
 * Fica neste aparelho e entra no backup. A cópia na conta depende da
 * migração 005 (tabela própria), que ainda precisa da sua autorização.
 */

export type WishItem = {
  place: SavedPlace;
  collection: string;
  addedAt: string;
  /** Preenchido quando a pessoa confirma que visitou. */
  visitedAt?: string;
};

export const wishKey = "gomes-quero-conhecer-v1";
export const defaultCollection = "Quero conhecer";

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

const valid = (v: unknown): v is WishItem => {
  const w = v as WishItem;
  return Boolean(
    w && typeof w === "object" && w.place && typeof w.place.id === "string" && typeof w.place.name === "string" && typeof w.collection === "string" && typeof w.addedAt === "string",
  );
};

export function loadWishes(storage: Store | undefined = store()): WishItem[] {
  try {
    const v = JSON.parse(storage?.getItem(wishKey) || "[]");
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return [];
  }
}
export function saveWishes(list: WishItem[], storage: Store | undefined = store()): boolean {
  try {
    storage?.setItem(wishKey, JSON.stringify(list.slice(0, 2000)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** Mesmo lugar: mesmo id, ou mesmo nome a menos de 80 m (fontes diferentes). */
export function samePlace(a: SavedPlace, b: SavedPlace) {
  if (a.id === b.id) return true;
  if (!a.coordinates || !b.coordinates) return false;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && distanceKm(a.coordinates, b.coordinates) < 0.08;
}

/** Guarda só o que importa do lugar (nome, local, endereço, foto verificada, fonte). */
export function toSaved(p: Place): SavedPlace {
  const keep = ["wikidata", "image", "wikimedia_commons", "image_credit", "image_license", "opening_hours", "website", "wheelchair", "fee", "cuisine", "country_code", "provider", "wikipedia"];
  return { ...p, tags: Object.fromEntries(Object.entries(p.tags).filter(([k]) => keep.includes(k))) };
}

export function addWish(list: WishItem[], place: SavedPlace, collection = defaultCollection, now = new Date()): { list: WishItem[]; added: boolean } {
  const name = collection.trim().slice(0, 60) || defaultCollection;
  if (list.some((w) => samePlace(w.place, place) && w.collection === name)) return { list, added: false };
  return { list: [{ place, collection: name, addedAt: now.toISOString() }, ...list], added: true };
}
export function removeWish(list: WishItem[], id: string, collection?: string) {
  return list.filter((w) => !(w.place.id === id && (!collection || w.collection === collection)));
}
export function markVisited(list: WishItem[], id: string, visited = true, now = new Date()) {
  return list.map((w) => (w.place.id === id ? { ...w, visitedAt: visited ? now.toISOString() : undefined } : w));
}
export function collections(list: WishItem[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const w of list) m.set(w.collection, (m.get(w.collection) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === defaultCollection ? -1 : b.name === defaultCollection ? 1 : a.name.localeCompare(b.name)));
}
export const visitedIds = (list: WishItem[]) => new Set(list.filter((w) => w.visitedAt).map((w) => w.place.id));
