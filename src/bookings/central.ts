import type { Trip } from "../model";
import { paidMinor, plannedMinor, toMajor, type Expense } from "../budget";
import { walletItems, type WalletCategory, type WalletItem } from "../journey/wallet";
import { toInstant } from "../journey/time";

/*
 * Central de Reservas: lê voos, hospedagens, carros e reservas que já existem
 * em cada viagem (pela carteira) e acrescenta só a situação da reserva e o
 * prazo de cancelamento, guardados em trip.bookings pela chave do item.
 * Nada é copiado. O dinheiro vem das despesas já ligadas a cada item.
 */

export const bookingStatuses = {
  researching: "Em pesquisa",
  reserved: "Reservada",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  done: "Concluída",
} as const;
export type BookingStatus = keyof typeof bookingStatuses;
export type BookingInfo = { status?: BookingStatus; cancelBy?: string; note?: string };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Limpa o que veio guardado (backup ou conta). */
export function cleanBookings(v: unknown): Record<string, BookingInfo> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return;
  const out: Record<string, BookingInfo> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[tsvr]:[\w-]{1,80}$/.test(k) || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const info: BookingInfo = {};
    if (typeof r.status === "string" && r.status in bookingStatuses) info.status = r.status as BookingStatus;
    if (isDate(r.cancelBy)) info.cancelBy = r.cancelBy;
    if (typeof r.note === "string" && r.note.trim()) info.note = r.note.trim().slice(0, 280);
    if (Object.keys(info).length) out[k] = info;
  }
  return Object.keys(out).length ? out : undefined;
}

export function setBooking(trip: Trip, itemId: string, info: BookingInfo): Trip {
  const next = { ...(trip.bookings ?? {}) };
  const clean = cleanBookings({ [itemId]: info })?.[itemId];
  if (clean) next[itemId] = clean;
  else delete next[itemId];
  return { ...trip, bookings: Object.keys(next).length ? next : undefined };
}

export type CentralItem = WalletItem & {
  trip: Trip;
  time?: string;
  /** Início em ms (para ordenar e para "próxima"); undefined sem data. */
  at?: number;
  status?: BookingStatus;
  cancelBy?: string;
  expenses: Expense[];
  /** Voos: códigos dos aeroportos e horários de cada trecho. */
  legs?: { from: string; to: string; depart: string; arrive: string; carrier?: string; number?: string }[];
};

/** Despesas ligadas ao item da carteira. */
function linkedExpenses(trip: Trip, item: WalletItem): Expense[] {
  const id = item.id.slice(2);
  return (trip.expenses ?? []).filter((e) =>
    item.source === "transport" ? e.transportId === id : item.source === "stay" ? e.stayId === id : item.source === "vehicle" ? e.vehicleId === id : item.source === "reservation" ? e.reservationId === id : false,
  );
}

export function centralItems(trips: Trip[]): CentralItem[] {
  const out: CentralItem[] = [];
  for (const trip of trips) {
    for (const item of walletItems(trip)) {
      if (item.source === "document") continue;
      const info = trip.bookings?.[item.id] ?? {};
      let time: string | undefined;
      let legs: CentralItem["legs"];
      if (item.source === "transport") {
        const t = (trip.transports ?? []).find((x) => "t:" + x.id === item.id);
        time = t?.legs[0]?.departTime || undefined;
        if (t?.kind === "flight" || t?.kind === "train" || t?.kind === "bus")
          legs = t.legs.map((l) => ({
            from: l.from.code || l.from.name,
            to: l.to.code || l.to.name,
            depart: [l.departDate, l.departTime].filter(Boolean).join(" "),
            arrive: [l.arriveDate, l.arriveTime].filter(Boolean).join(" "),
            carrier: l.carrier,
            number: l.number,
          }));
      } else if (item.source === "stay") time = (trip.stays ?? []).find((s) => "s:" + s.id === item.id)?.checkInTime || undefined;
      else if (item.source === "vehicle") time = (trip.vehicles ?? []).find((v) => "v:" + v.id === item.id)?.rental?.pickupTime || undefined;
      const at = item.date ? toInstant(item.date, time || "12:00", trip.timeZone) : undefined;
      out.push({ ...item, trip, time, at, status: info.status, cancelBy: info.cancelBy, expenses: linkedExpenses(trip, item), legs });
    }
  }
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

export type CentralFilter = { tripId?: string; category?: WalletCategory | ""; status?: BookingStatus | "none" | ""; when?: "upcoming" | "past" | "all" };
export function filterCentral(items: CentralItem[], f: CentralFilter, now = Date.now()): CentralItem[] {
  return items.filter(
    (i) =>
      (!f.tripId || i.trip.id === f.tripId) &&
      (!f.category || i.category === f.category) &&
      (!f.status || (f.status === "none" ? !i.status : i.status === f.status)) &&
      (f.when !== "upcoming" || i.at === undefined || i.at >= now - 6 * 3600000) &&
      (f.when !== "past" || (i.at !== undefined && i.at < now - 6 * 3600000)),
  );
}

/** Próxima reserva que vai acontecer (não cancelada). */
export function nextBooking(items: CentralItem[], now = Date.now()) {
  return items.find((i) => i.at !== undefined && i.at >= now && i.status !== "cancelled" && i.status !== "researching");
}

/** Prazos de cancelamento gratuito que vencem nos próximos `days` dias. */
export function cancelSoon(items: CentralItem[], today: string, days = 14) {
  const limit = new Date(Date.parse(today + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  return items
    .filter((i) => i.cancelBy && i.cancelBy >= today && i.cancelBy <= limit && i.status !== "cancelled")
    .sort((a, b) => a.cancelBy!.localeCompare(b.cancelBy!));
}

/**
 * Resumo financeiro por moeda: previsto e pago das despesas ligadas às
 * reservas. Opções "em pesquisa" e canceladas não entram.
 */
export function moneySummary(items: CentralItem[]) {
  const by = new Map<string, { planned: number; paid: number }>();
  const seen = new Set<string>();
  for (const i of items) {
    if (i.status === "researching" || i.status === "cancelled") continue;
    for (const e of i.expenses) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const row = by.get(e.currency) ?? { planned: 0, paid: 0 };
      row.planned += plannedMinor(e);
      row.paid += paidMinor(e);
      by.set(e.currency, row);
    }
  }
  return [...by].map(([currency, v]) => ({ currency, planned: toMajor(v.planned, currency), paid: toMajor(v.paid, currency), pending: toMajor(Math.max(0, v.planned - v.paid), currency) }));
}
