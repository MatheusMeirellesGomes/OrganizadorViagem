export type Activity = {
  period?: "morning" | "afternoon" | "evening" | "any";
  id: string;
  title: string;
  day: number;
  time: string;
  address: string;
  done: boolean;
  kind: string;
};
export type Trip = {
  party?: {adults?:number;children?:number;members?:string[];preferences?:string};
  scope?: "national" | "international" | "undecided";
  coordinates?: { lat: number; lng: number };
  id: string;
  title: string;
  destination: string;
  start: string;
  end: string;
  status: "planning" | "upcoming" | "active" | "past";
  cover: string;
  notes: string;
  hotel: string;
  activities: Activity[];
  checklist: { id: string; title: string; done: boolean }[];
  expenses: { id: string; title: string; amount: number; currency: string }[];
  budgetEnabled: boolean;
  photos: { id: string; url: string; name: string }[];
  reservations: { id: string; title: string; details: string; url: string }[];
};
export const uid = () => crypto.randomUUID();
export function newTrip(input: Partial<Trip> = {}): Trip {
  return {
    id: uid(),
    title: "Nova viagem",
    destination: "",
    start: "",
    end: "",
    status: "planning",
    scope: "undecided",
    cover: "coast",
    notes: "",
    hotel: "",
    activities: [],
    checklist: [],
    expenses: [],
    budgetEnabled: false,
    photos: [],
    reservations: [],
    ...input,
  };
}
export function dateLabel(t: Trip) {
  const fmt = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
    });
  return t.start
    ? `${fmt(t.start)}${t.end ? " — " + fmt(t.end) : ""}`
    : "Datas em aberto";
}
export function moveActivity(items: Activity[], id: string, day: number) {
  return items.map((a) => (a.id === id ? { ...a, day } : a));
}
export const statusLabels = {
  planning: "Em planejamento",
  upcoming: "Próxima viagem",
  active: "Em andamento",
  past: "Concluída",
};
export const pictures = {
  coast:
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1800&q=85",
  city: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1000&q=85",
  mountain:
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=85",
  beach: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85",
  countryside: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=85",
  waterfall: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1000&q=85",
};

export const coverLabels: Record<keyof typeof pictures, string> = {
  coast: "Lagos e natureza",
  city: "Cidades e cultura",
  mountain: "Serras e montanhas",
  beach: "Praias e litoral",
  countryside: "Interior e campo",
  waterfall: "Cachoeiras e trilhas",
};

export type TripScope = NonNullable<Trip["scope"]>;
export type ScopeFilter = "all" | TripScope;
export const scopeLabels: Record<TripScope, string> = {
  national: "Nacional",
  international: "Internacional",
  undecided: "Sem tipo definido",
};
// Older trips and backups may not have a scope; they stay valid as "undecided".
export function tripScope(trip: Pick<Trip, "scope">): TripScope {
  return trip.scope === "national" || trip.scope === "international"
    ? trip.scope
    : "undecided";
}
export function matchesScope(trip: Pick<Trip, "scope">, filter: ScopeFilter) {
  return filter === "all" || tripScope(trip) === filter;
}
export function countByScope(trips: Pick<Trip, "scope">[]) {
  const counts: Record<ScopeFilter, number> = {
    all: trips.length,
    national: 0,
    international: 0,
    undecided: 0,
  };
  for (const trip of trips) counts[tripScope(trip)]++;
  return counts;
}
