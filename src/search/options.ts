import { uid, type Trip } from "../model";
import type { WalletCategory } from "../journey/wallet";
import { setBooking } from "../bookings/central";

/*
 * Opções para comparar: cada opção salva vira uma reserva da viagem na
 * categoria certa, marcada "Em pesquisa", com o preço que a pessoa viu no
 * site. Assim ela aparece na Carteira e na Central de Reservas sem duplicar
 * nada, e não entra nas despesas enquanto não for escolhida.
 */

export type OptionInput = { title: string; url?: string; price?: number; currency?: string; notes?: string };
export type SavedOption = { id: string; title: string; url: string; notes: string; price?: number; currency?: string; status?: string };

export function addOption(trip: Trip, category: WalletCategory, input: OptionInput): Trip {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("Dê um nome para a opção.");
  const url = (input.url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error("O link precisa começar com http:// ou https://.");
  const same = trip.reservations.find((r) => r.category === category && ((url && r.url === url) || r.title.toLowerCase() === title.toLowerCase()));
  if (same) throw new Error("Essa opção já está salva nesta viagem.");
  const id = uid();
  const next: Trip = { ...trip, reservations: [...trip.reservations, { id, title, details: (input.notes || "").trim().slice(0, 500), url, category }] };
  const price = input.price !== undefined && Number.isFinite(input.price) && input.price >= 0 ? input.price : undefined;
  return setBooking(next, "r:" + id, { status: "researching", ...(price !== undefined && input.currency ? { price, currency: input.currency.toUpperCase() } : {}) });
}

/** Opções salvas de uma categoria, da mais barata para a mais cara (sem preço no fim). */
export function optionsOf(trip: Trip, category: WalletCategory): SavedOption[] {
  return trip.reservations
    .filter((r) => r.category === category && (trip.bookings?.["r:" + r.id]?.status === "researching" || trip.bookings?.["r:" + r.id]?.price !== undefined))
    .map((r) => {
      const b = trip.bookings?.["r:" + r.id];
      return { id: r.id, title: r.title, url: r.url, notes: r.details, price: b?.price, currency: b?.currency, status: b?.status };
    })
    .sort((a, b) => {
      if (a.price === undefined || b.price === undefined) return (a.price === undefined ? 1 : 0) - (b.price === undefined ? 1 : 0);
      return a.currency === b.currency ? a.price - b.price : (a.currency ?? "").localeCompare(b.currency ?? "");
    });
}

/** "Reservei esta": a opção passa a "Reservada". As outras continuam salvas, em pesquisa. */
export function chooseOption(trip: Trip, id: string): Trip {
  const b = trip.bookings?.["r:" + id] ?? {};
  return setBooking(trip, "r:" + id, { ...b, status: "reserved" });
}
