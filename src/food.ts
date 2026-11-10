import type { Place, Point } from "./places";
import { distanceKm, categories } from "./places";
import { uid, type Trip } from "./model";
export const foodCategories = [
  "restaurant",
  "cafe",
  "fast_food",
  "food_court",
  "ice_cream",
];
export function isFood(p: Place) {
  return foodCategories.includes(p.category);
}
export function foodMatches(
  p: Place,
  filters: { cuisine: string; diet: string; meal: string },
) {
  return (
    (!filters.cuisine ||
      (p.tags.cuisine || "")
        .toLowerCase()
        .includes(filters.cuisine.toLowerCase())) &&
    (!filters.diet ||
      ["yes", "only"].includes(p.tags["diet:" + filters.diet])) &&
    (!filters.meal || p.tags[filters.meal] === "yes")
  );
}
export function nearestPlaces(places: Place[], point?: Point) {
  return point
    ? [...places].sort(
        (a, b) =>
          distanceKm(point, a.coordinates) - distanceKm(point, b.coordinates),
      )
    : places;
}
export function addPlaceToTrip(trip: Trip, place: Place, day: number): Trip {
  if (!Number.isInteger(day) || day < 1 || day > 3660)
    throw new Error("Escolha um dia válido.");
  if (trip.activities.some((a) => a.placeId === place.id && a.day === day))
    throw new Error("Este lugar já está neste dia do roteiro.");
  return {
    ...trip,
    activities: [
      ...trip.activities,
      {
        id: uid(),
        placeId: place.id,
        coordinates: place.coordinates,
        source: place.source,
        title: place.name,
        day,
        time: "",
        address: [place.address, place.city, place.country]
          .filter(Boolean)
          .join(", "),
        done: false,
        kind: categories[place.category] || "Passeio",
      },
    ],
  };
}
