export type Activity = {
  id: string;
  title: string;
  day: number;
  time: string;
  address: string;
  done: boolean;
  kind: string;
};
export type Trip = {
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
};
