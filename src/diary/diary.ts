import { uid, type Trip } from "../model";
import { paidMinor, toMajor } from "../budget";
import { tripCountries } from "../profile/passport";

/*
 * Diário de viagem: registros curtos por dia (texto, humor, fotos da própria
 * viagem) e a retrospectiva da viagem, montada só com o que foi registrado.
 */

export const moods = {
  amazing: { emoji: "🤩", label: "Incrível" },
  good: { emoji: "😊", label: "Bom" },
  ok: { emoji: "🙂", label: "Tranquilo" },
  tired: { emoji: "😮‍💨", label: "Cansativo" },
  bad: { emoji: "😣", label: "Difícil" },
} as const;
export type Mood = keyof typeof moods;

export type JournalEntry = {
  id: string;
  date: string;
  title?: string;
  text: string;
  mood?: Mood;
  highlight?: boolean;
  photoIds?: string[];
  createdAt: string;
  updatedAt?: string;
};

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valida um registro (do formulário, da conta ou de um backup). */
export function cleanEntry(raw: unknown, photoIds?: (id: string) => string | undefined): JournalEntry | undefined {
  if (!raw || typeof raw !== "object") return;
  const r = raw as Record<string, unknown>;
  const text = str(r.text, 5000);
  const title = str(r.title, 120);
  if (!isDate(r.date) || (!text && !title)) return;
  const photos = Array.isArray(r.photoIds) ? r.photoIds.filter((x): x is string => typeof x === "string").map((x) => (photoIds ? photoIds(x) : x)).filter((x): x is string => Boolean(x)) : [];
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 80) : uid(),
    date: r.date,
    title: title || undefined,
    text,
    mood: typeof r.mood === "string" && r.mood in moods ? (r.mood as Mood) : undefined,
    highlight: r.highlight === true || undefined,
    photoIds: photos.length ? [...new Set(photos)].slice(0, 12) : undefined,
    createdAt: typeof r.createdAt === "string" && !Number.isNaN(Date.parse(r.createdAt)) ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : undefined,
  };
}

export function cleanJournal(v: unknown, photoIds?: (id: string) => string | undefined): JournalEntry[] | undefined {
  if (!Array.isArray(v)) return;
  const list = v
    .slice(0, 1000)
    .map((x) => cleanEntry(x, photoIds))
    .filter((x): x is JournalEntry => Boolean(x))
    .map((x) => (photoIds ? { ...x, id: uid() } : x));
  return list.length ? list : undefined;
}

export const sortedJournal = (trip: Trip) => [...(trip.journal ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

export function saveEntry(trip: Trip, input: Partial<JournalEntry> & { date: string; text: string }): Trip {
  const list = trip.journal ?? [];
  const existing = input.id ? list.find((e) => e.id === input.id) : undefined;
  const photos = new Set((trip.photos ?? []).map((p) => p.id));
  const entry = cleanEntry({ ...existing, ...input, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: existing ? new Date().toISOString() : undefined });
  if (!entry) throw new Error("Escreva algo e escolha a data do registro.");
  entry.photoIds = entry.photoIds?.filter((id) => photos.has(id));
  if (!entry.photoIds?.length) entry.photoIds = undefined;
  return { ...trip, journal: existing ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry] };
}

export const removeEntry = (trip: Trip, id: string): Trip => {
  const journal = (trip.journal ?? []).filter((e) => e.id !== id);
  return { ...trip, journal: journal.length ? journal : undefined };
};

export const toggleHighlight = (trip: Trip, id: string): Trip => ({
  ...trip,
  journal: (trip.journal ?? []).map((e) => (e.id === id ? { ...e, highlight: e.highlight ? undefined : true } : e)),
});

export type Retrospective = {
  days?: number;
  places: number;
  entries: number;
  photos: number;
  countries: string[];
  spent: { currency: string; amount: number }[];
  moods: { mood: Mood; count: number }[];
  highlights: JournalEntry[];
  busiestDay?: { day: number; count: number };
};

export function retrospective(trip: Trip): Retrospective {
  const days = trip.start && trip.end && trip.end >= trip.start ? Math.round((Date.parse(trip.end) - Date.parse(trip.start)) / 86400000) + 1 : undefined;
  const done = (trip.activities ?? []).filter((a) => a.done);
  const perDay = new Map<number, number>();
  for (const a of done) perDay.set(a.day, (perDay.get(a.day) ?? 0) + 1);
  const busiest = [...perDay].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const spent = new Map<string, number>();
  for (const e of trip.expenses ?? []) spent.set(e.currency, (spent.get(e.currency) ?? 0) + paidMinor(e));
  const journal = sortedJournal(trip);
  const moodCount = new Map<Mood, number>();
  for (const e of journal) if (e.mood) moodCount.set(e.mood, (moodCount.get(e.mood) ?? 0) + 1);
  return {
    days,
    places: done.length,
    entries: journal.length,
    photos: (trip.photos ?? []).length,
    countries: tripCountries(trip),
    spent: [...spent].filter(([, v]) => v > 0).map(([currency, v]) => ({ currency, amount: toMajor(v, currency) })),
    moods: [...moodCount].sort((a, b) => b[1] - a[1]).map(([mood, count]) => ({ mood, count })),
    highlights: journal.filter((e) => e.highlight),
    busiestDay: busiest && busiest[1] > 1 ? { day: busiest[0], count: busiest[1] } : undefined,
  };
}
