import { uid, type Trip } from "../model";
import type { Place } from "../places";
import { categories } from "../places";
import { choosePlace, type Decision } from "../choices";

export type AddOptions = {
  day: number;
  time?: string;
  notes?: string;
  stayId?: string;
  /** Also mark the place in the trip's list (Quero ir, Talvez, Já visitei). */
  decision?: Decision;
};

/** Day where the place already is in the itinerary, if any. */
export function dayOf(trip: Trip, place: Pick<Place, "id">): number | undefined {
  return trip.activities.find((a) => a.placeId === place.id)?.day;
}

/**
 * Adds a place to the itinerary without touching the activities already there.
 * The same place is never added twice to one trip. The saved place keeps its
 * stable id, name, coordinates, category, address, validated photo and source.
 */
export function addToItinerary(trip: Trip, place: Place, options: AddOptions): Trip {
  const { day, time = "", notes = "", stayId, decision = "want" } = options;
  if (!Number.isInteger(day) || day < 1 || day > 3660) throw new Error("Escolha um dia válido.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horário inválido.");
  if (stayId && !(trip.stays ?? []).some((s) => s.id === stayId)) throw new Error("Hospedagem não encontrada nesta viagem.");
  const existing = dayOf(trip, place);
  if (existing !== undefined) throw new Error(`Este lugar já está no roteiro (dia ${existing}).`);
  const withChoice = choosePlace(trip, place, decision);
  return {
    ...withChoice,
    activities: [
      ...trip.activities,
      {
        id: uid(),
        placeId: place.id,
        coordinates: place.coordinates,
        source: place.source,
        title: place.name,
        day,
        time,
        address: [place.address, place.city, place.country].filter(Boolean).join(", "),
        done: decision === "visited",
        kind: categories[place.category] || "Passeio",
        ...(notes.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
        ...(stayId ? { stayId } : {}),
      },
    ],
  };
}
