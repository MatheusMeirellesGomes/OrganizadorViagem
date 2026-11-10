import type { Place, Point } from "./places";
import type { Trip } from "./model";
export type SavedPlace = Omit<Place, "coordinates"> & { coordinates?: Point };
export type Decision = "want" | "maybe" | "skip" | "visited";
export type PlaceChoice = {
  place: SavedPlace;
  decision: Decision;
  decidedAt: string;
};
export const decisionLabels: Record<Decision, string> = {
  want: "Quero ir",
  maybe: "Talvez",
  skip: "Passar",
  visited: "Já visitei",
};
export function choosePlace(
  trip: Trip,
  place: SavedPlace,
  decision: Decision,
): Trip {
  return {
    ...trip,
    placeChoices: [
      ...(trip.placeChoices || []).filter((c) => c.place.id !== place.id),
      { place, decision, decidedAt: new Date().toISOString() },
    ],
  };
}
export function undoChoice(trip: Trip, id: string): Trip {
  return {
    ...trip,
    placeChoices: (trip.placeChoices || []).filter((c) => c.place.id !== id),
  };
}
export function swipeDecision(dx: number, dy: number): Decision | undefined {
  if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  return dx > 0 ? "want" : "skip";
}
