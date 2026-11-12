import type { Trip, TripDocument } from "../model";
import { dateOfDay } from "../planner";
import { transportTitle } from "./transport";
import { vehicleName } from "./vehicles";

/*
 * Wallet (Etapa 16): one private place for tickets, hotels, rentals, tickets
 * for attractions, restaurant bookings, insurance and receipts. It gathers the
 * records that already exist in the trip (no copies) plus the uploaded files.
 */

export const walletCategories = {
  tickets: "Passagens",
  hotels: "Hotéis",
  rentals: "Aluguel de veículos",
  entries: "Ingressos",
  restaurants: "Reservas de restaurantes",
  insurance: "Seguros",
  receipts: "Comprovantes",
  other: "Outros documentos",
} as const;
export type WalletCategory = keyof typeof walletCategories;
export const isWalletCategory = (v: unknown): v is WalletCategory => typeof v === "string" && v in walletCategories;

export type WalletItem = {
  id: string;
  source: "transport" | "stay" | "vehicle" | "reservation" | "document";
  category: WalletCategory;
  title: string;
  detail: string;
  date?: string;
  /** Text used by the search. */
  text: string;
  hasSecret?: boolean;
  documentIds: string[];
  url?: string;
  document?: TripDocument;
};

type Reservation = Trip["reservations"][number];

export function reservationCategory(trip: Trip, r: Reservation): WalletCategory {
  if (r.category && isWalletCategory(r.category)) return r.category;
  if (r.stayId) return "hotels";
  if (r.vehicleId) return "rentals";
  if (r.transportId) return "tickets";
  const a = r.activityId ? trip.activities.find((x) => x.id === r.activityId) : undefined;
  if (a?.meal) return "restaurants";
  if (a) return "entries";
  const t = `${r.title} ${r.details}`.toLowerCase();
  if (/\b(voo|flight|vuelo|passagem|bilhete|ticket de avião|trem|train|tren|ônibus|bus)\b/.test(t)) return "tickets";
  if (/\b(hotel|hostel|pousada|airbnb|apartamento|alojamiento)\b/.test(t)) return "hotels";
  if (/\b(seguro|insurance)\b/.test(t)) return "insurance";
  if (/\b(locadora|aluguel de carro|rent a car|car rental|alquiler)\b/.test(t)) return "rentals";
  if (/\b(restaurante|restaurant|jantar|dinner|cena|almoço|lunch)\b/.test(t)) return "restaurants";
  if (/\b(ingresso|entrada|museu|museum|museo|tour)\b/.test(t)) return "entries";
  return "other";
}

export function documentCategory(trip: Trip, d: TripDocument): WalletCategory {
  if (d.category && isWalletCategory(d.category)) return d.category;
  if (d.transportId) return "tickets";
  if (d.stayId) return "hotels";
  if (d.vehicleId) return "rentals";
  const r = d.reservationId ? trip.reservations.find((x) => x.id === d.reservationId) : undefined;
  return r ? reservationCategory(trip, r) : "other";
}

const docsFor = (trip: Trip, match: (d: TripDocument) => boolean) => (trip.documents || []).filter(match).map((d) => d.id);

/** Everything in the wallet, newest date last; undated items at the end. */
export function walletItems(trip: Trip): WalletItem[] {
  const items: WalletItem[] = [];
  for (const t of trip.transports || []) {
    const first = t.legs[0];
    const d = new Set([...(t.documentIds ?? []), ...docsFor(trip, (x) => x.transportId === t.id)]);
    items.push({
      id: "t:" + t.id,
      source: "transport",
      category: "tickets",
      title: transportTitle(t),
      detail: t.legs.map((l) => [l.carrier, l.number].filter(Boolean).join(" ")).filter(Boolean).join(" · "),
      date: first?.departDate || undefined,
      text: "",
      hasSecret: t.hasSecret,
      documentIds: [...d],
    });
  }
  for (const s of trip.stays || [])
    items.push({
      id: "s:" + s.id,
      source: "stay",
      category: "hotels",
      title: s.name,
      detail: [s.city, s.start && s.end ? `${s.start} → ${s.end}` : ""].filter(Boolean).join(" · "),
      date: s.start || undefined,
      text: s.address,
      // Old trips may keep a confirmation inside the stay; it is shown only as "exists".
      hasSecret: Boolean(s.confirmation),
      url: s.url || undefined,
      documentIds: docsFor(trip, (x) => x.stayId === s.id),
    });
  for (const v of trip.vehicles || [])
    if (v.ownership === "rental")
      items.push({
        id: "v:" + v.id,
        source: "vehicle",
        category: "rentals",
        title: vehicleName(v),
        detail: [v.rental?.company, v.rental?.pickupPlace].filter(Boolean).join(" · "),
        date: v.rental?.pickupDate,
        text: "",
        hasSecret: v.hasSecret,
        documentIds: docsFor(trip, (x) => x.vehicleId === v.id),
      });
  for (const r of trip.reservations) {
    const a = r.activityId ? trip.activities.find((x) => x.id === r.activityId) : undefined;
    items.push({
      id: "r:" + r.id,
      source: "reservation",
      category: reservationCategory(trip, r),
      title: r.title || "Reserva",
      detail: a ? a.title : "",
      date: a ? dateOfDay(trip, a.day) : undefined,
      text: r.details,
      url: r.url || undefined,
      documentIds: docsFor(trip, (x) => x.reservationId === r.id),
    });
  }
  for (const d of trip.documents || [])
    items.push({
      id: "d:" + d.id,
      source: "document",
      category: documentCategory(trip, d),
      title: d.name,
      detail: "",
      date: d.day ? dateOfDay(trip, d.day) : undefined,
      text: "",
      documentIds: [d.id],
      document: d,
    });
  for (const i of items) i.text = [i.title, i.detail, i.text].join(" ").toLowerCase();
  return items.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export type WalletFilter = { q?: string; category?: WalletCategory | ""; date?: string; onlyFiles?: boolean };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterWallet(items: WalletItem[], f: WalletFilter): WalletItem[] {
  const q = fold(f.q?.trim() ?? "");
  return items.filter(
    (i) =>
      (!f.category || i.category === f.category) &&
      (!f.date || i.date === f.date) &&
      (!f.onlyFiles || i.source === "document") &&
      (!q || fold(i.text).includes(q)),
  );
}

export function countByCategory(items: WalletItem[]) {
  const c = Object.fromEntries(Object.keys(walletCategories).map((k) => [k, 0])) as Record<WalletCategory, number>;
  for (const i of items) c[i.category]++;
  return c;
}

/** Updates where a document belongs (category, day, transport, stay, vehicle or booking). */
export function organizeDocument(trip: Trip, id: string, patch: Partial<Pick<TripDocument, "category" | "day" | "transportId" | "stayId" | "vehicleId" | "reservationId">>): Trip {
  if (!(trip.documents || []).some((d) => d.id === id)) throw new Error("Documento não encontrado.");
  const valid = (v: string | undefined, list: { id: string }[] | undefined) => (v && list?.some((x) => x.id === v) ? v : undefined);
  return {
    ...trip,
    documents: (trip.documents || []).map((d) => {
      if (d.id !== id) return d;
      const n = { ...d, ...patch };
      return {
        ...n,
        category: isWalletCategory(n.category) ? n.category : undefined,
        day: Number.isInteger(n.day) && n.day! >= 1 && n.day! <= 3660 ? n.day : undefined,
        transportId: valid(n.transportId, trip.transports),
        stayId: valid(n.stayId, trip.stays),
        vehicleId: valid(n.vehicleId, trip.vehicles),
        reservationId: valid(n.reservationId, trip.reservations),
      };
    }),
  };
}
