import { getLocale } from "./i18n";
export type Activity = {
  placeId?: string;
  source?: string;
  coordinates?: { lat: number; lng: number };
  period?: "morning" | "afternoon" | "evening" | "any";
  id: string;
  title: string;
  day: number;
  time: string;
  address: string;
  done: boolean;
  kind: string;
  /** Optional note written when adding the place (Explorar). */
  notes?: string;
  /** Optional link to a stay of the trip. */
  stayId?: string;
  /** Meal this activity is for (Fase 3). */
  meal?: import("./meals").MealKind;
  /** Travel Mode progress (Fase 5). */
  status?: "started" | "skipped";
  /** Important changes (postponed, rescheduled...), newest last. */
  history?: { at: string; what: string; from?: string; to?: string }[];
};
export type Stay = {
  id: string;
  name: string;
  address: string;
  city: string;
  start: string;
  end: string;
  checkInTime: string;
  checkOutTime: string;
  url: string;
  confirmation: string;
  notes: string;
  coordinates?: { lat: number; lng: number };
};
export type TripDocument = {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  reservationId?: string;
  /** Wallet organization (Etapa 16). */
  category?: import("./journey/wallet").WalletCategory;
  day?: number;
  transportId?: string;
  stayId?: string;
  vehicleId?: string;
};
export type Trip = {
  timeZone?: string;
  placeChoices?: import("./choices").PlaceChoice[];
  documents?: TripDocument[];
  stays?: Stay[];
  party?: {
    adults?: number;
    children?: number;
    members?: string[];
    preferences?: string;
  };
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
  expenses: import("./budget").Expense[];
  /** People who share costs (Fase 4). */
  participants?: import("./budget").Participant[];
  /** Reimbursements between participants. */
  settlements?: import("./budget").Settlement[];
  /** Total budget, in the reference currency. */
  budget?: { amount: number; currency: string };
  customExpenseCategories?: string[];
  /** Preferred meal times (Fase 3). */
  mealTimes?: Partial<Record<import("./meals").MealKind, string>>;
  budgetEnabled: boolean;
  photos: import("./photos").TripPhoto[];
  coverPhotoId?: string;
  reservations: {
    id: string;
    title: string;
    details: string;
    url: string;
    activityId?: string;
    stayId?: string;
    /** Wallet category (Etapa 16). */
    category?: import("./journey/wallet").WalletCategory;
    transportId?: string;
    vehicleId?: string;
  }[];
  /** Etapa 16: transport, vehicles, comparison, packing, reminders and preparation. */
  transports?: import("./journey/types").Transport[];
  vehicles?: import("./journey/types").Vehicle[];
  carComparison?: import("./journey/vehicles").Comparison;
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
    new Date(s + "T12:00:00").toLocaleDateString(getLocale(), {
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
  beach:
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85",
  countryside:
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=85",
  waterfall:
    "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1000&q=85",
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
