import type { Trip } from "../model";
import { isCurrency } from "../budget";

/*
 * Traveler profile (Etapa 16). Everything is optional. In local mode it stays
 * in this browser ("atlas-profile"); with an account it is kept in the user's
 * metadata, and the photo goes to the private Storage folder of that user.
 */

export const paces = {
  own: "No meu ritmo",
  intense: "Quero explorar bastante",
  calm: "Prefiro dias tranquilos",
  mixed: "Um pouco de cada",
} as const;
export type Pace = keyof typeof paces;

export const travelStyles: Record<string, string> = {
  culture: "Cultura e história",
  nature: "Natureza",
  food: "Gastronomia",
  adventure: "Aventura",
  beach: "Praia e descanso",
  cities: "Cidades",
  family: "Em família",
  budget: "Econômica",
};
export const transportPrefs: Record<string, string> = {
  walking: "A pé",
  transit: "Transporte público",
  car: "Carro",
  train: "Trem",
  bike: "Bicicleta",
  taxi: "Táxi ou aplicativo",
};
export const foodPrefs: Record<string, string> = {
  local: "Comida local",
  vegetarian: "Vegetariana",
  vegan: "Vegana",
  gluten_free: "Sem glúten",
  halal: "Halal",
  kosher: "Kosher",
  cafes: "Cafés e padarias",
  fine: "Restaurantes especiais",
};
export const accessibilityPrefs: Record<string, string> = {
  wheelchair: "Acesso para cadeira de rodas",
  few_stairs: "Poucas escadas",
  short_walks: "Caminhadas curtas",
  rest_stops: "Pausas para descanso",
};

export type Avatar = { kind: "local"; data: string } | { kind: "cloud"; path: string };
export type Profile = {
  name: string;
  bio?: string;
  homeCity?: string;
  pace: Pace;
  styles?: string[];
  currency?: string;
  transport?: string[];
  food?: string[];
  accessibility?: string[];
  avatar?: Avatar;
};

export const emptyProfile: Profile = { name: "", pace: "own" };
export const profileKey = "atlas-profile";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = (v: unknown, allowed: Record<string, string>) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x in allowed))] : [];

/** A data URL with an image we produced (JPEG or WebP, small), checked by its first bytes. */
export function validAvatarData(url: string): boolean {
  const m = /^data:image\/(jpeg|webp|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!m || m[2].length > 400_000) return false;
  try {
    const head = atob(m[2].slice(0, 24));
    return m[1] === "jpeg" ? head.startsWith("\xff\xd8\xff") : m[1] === "png" ? head.startsWith("\x89PNG") : head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}

/** Reads a stored profile, accepting the old format ({name, style: "No meu ritmo"}). */
export function parseProfile(raw: unknown): Profile {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const oldPace = (Object.entries(paces).find(([, label]) => label === v.style) ?? [])[0] as Pace | undefined;
  const pace = typeof v.pace === "string" && v.pace in paces ? (v.pace as Pace) : oldPace ?? "own";
  const avatar = v.avatar && typeof v.avatar === "object" ? (v.avatar as Record<string, unknown>) : {};
  const currency = text(v.currency, 3).toUpperCase();
  return {
    name: text(v.name, 80),
    bio: text(v.bio, 280) || undefined,
    homeCity: text(v.homeCity, 80) || undefined,
    pace,
    styles: pick(v.styles, travelStyles),
    currency: isCurrency(currency) ? currency : undefined,
    transport: pick(v.transport, transportPrefs),
    food: pick(v.food, foodPrefs),
    accessibility: pick(v.accessibility, accessibilityPrefs),
    avatar:
      avatar.kind === "local" && typeof avatar.data === "string" && validAvatarData(avatar.data)
        ? { kind: "local", data: avatar.data }
        : avatar.kind === "cloud" && typeof avatar.path === "string" && /^[0-9a-f-]{36}\/perfil\/[\w.-]+$/.test(avatar.path)
          ? { kind: "cloud", path: avatar.path }
          : undefined,
  };
}

export function loadProfile(storage: Pick<Storage, "getItem">, key = profileKey): Profile {
  try {
    return parseProfile(JSON.parse(storage.getItem(key) || "{}"));
  } catch {
    return { ...emptyProfile };
  }
}

/** Saves in this browser. Returns false when the browser storage is full or blocked. */
export function saveProfile(storage: Pick<Storage, "setItem">, profile: Profile, key = profileKey): boolean {
  try {
    storage.setItem(key, JSON.stringify(parseProfile(profile)));
    return true;
  } catch {
    return false;
  }
}

/** What goes to the account metadata: never the local photo bytes. */
export function accountProfile(p: Profile) {
  const { avatar, ...rest } = parseProfile(p);
  return { ...rest, avatar: avatar?.kind === "cloud" ? avatar : undefined };
}

export const firstName = (p: Profile) => p.name.split(/\s+/)[0] || "";
export const initials = (p: Profile) =>
  p.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export type Stats = {
  done: number;
  countries: number;
  cities: number;
  places: number;
  next?: { trip: Trip; days?: number };
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * Personal numbers, only from what the person registered: countries come from
 * the saved places of finished trips (and "Nacional" trips count Brazil);
 * cities from stays and destinations of finished trips; known places are
 * activities marked as visited.
 */
export function personalStats(trips: Trip[], today = new Date().toISOString().slice(0, 10)): Stats {
  const past = trips.filter((t) => t.status === "past");
  const countries = new Set<string>();
  const cities = new Set<string>();
  for (const t of past) {
    if (t.scope === "national") countries.add("br");
    const inPlan = new Set(t.activities.map((a) => a.placeId));
    for (const c of t.placeChoices || []) if (inPlan.has(c.place.id) && c.place.country) countries.add(norm(c.place.country));
    for (const s of t.stays || []) if (s.city.trim()) cities.add(norm(s.city));
    if (t.destination.trim()) cities.add(norm(t.destination));
  }
  const upcoming = trips
    .filter((t) => t.status !== "past" && t.start && t.start >= today)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const days = upcoming ? Math.round((Date.parse(upcoming.start + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000) : undefined;
  return {
    done: past.length,
    countries: countries.size,
    cities: cities.size,
    places: trips.reduce((n, t) => n + t.activities.filter((a) => a.done).length, 0),
    next: upcoming ? { trip: upcoming, days } : undefined,
  };
}
