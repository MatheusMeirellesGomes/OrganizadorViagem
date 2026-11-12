import { getLocale, translate } from "./i18n";
import type { Trip, Activity } from "./model";
import type { Point } from "./places";
import { validPoint } from "./places";
export type RouteLocation = {
  id: string;
  title: string;
  address: string;
  coordinates?: Point;
};
export type Transport = "walking" | "driving" | "transit" | "bicycling";
export const transportLabels: Record<Transport, string> = {
  walking: "A pé",
  driving: "Carro",
  transit: "Transporte público",
  bicycling: "Bicicleta",
};
export function locationValue(
  location: Pick<RouteLocation, "address" | "coordinates">,
) {
  return location.coordinates && validPoint(location.coordinates)
    ? `${location.coordinates.lat},${location.coordinates.lng}`
    : location.address.trim() || undefined;
}
export function directionsLink(
  destination: Pick<RouteLocation, "address" | "coordinates">,
  mode: Transport,
  origin?: Pick<RouteLocation, "address" | "coordinates">,
) {
  const end = locationValue(destination);
  if (!end) return;
  const params = new URLSearchParams({
    api: "1",
    destination: end,
    travelmode: mode,
  });
  const start = origin && locationValue(origin);
  if(origin&&!start)return;
  if (start) params.set("origin", start);
  const url = "https://www.google.com/maps/dir/?" + params;
  return url.length <= 2048 ? url : undefined;
}
export function routeLocations(trip: Trip): RouteLocation[] {
  return [
    ...(trip.stays || []).map((s) => ({
      id: "stay:" + s.id,
      title: s.name,
      address: [s.address, s.city].filter(Boolean).join(", "),
      coordinates: s.coordinates,
    })),
    ...trip.activities.map((a) => ({
      id: "activity:" + a.id,
      title: `${translate("Dia {number}", getLocale(), { number: a.day })} · ${a.title}`,
      address: a.address,
      coordinates: a.coordinates,
    })),
  ];
}
export type MapStop = {
  id: string;
  title: string;
  point: Point;
  label: string;
  kind: "stay" | "food" | "activity" | "visited";
};
export function mapStops(trip: Trip, day: number): MapStop[] {
  const stops: MapStop[] = [];
  trip.activities
    .filter((a) => a.day === day)
    .forEach((a, i) => {
      if (a.coordinates && validPoint(a.coordinates))
        stops.push({
          id: a.id,
          title: a.title,
          point: a.coordinates,
          label: String(i + 1),
          kind: a.done
            ? "visited"
            : /restaurante|café|cafeteria|lanche|alimenta|sorveteria/i.test(
                  a.kind,
                )
              ? "food"
              : "activity",
        });
    });
  for (const stay of trip.stays || [])
    if (stay.coordinates && validPoint(stay.coordinates))
      stops.push({
        id: stay.id,
        title: stay.name,
        point: stay.coordinates,
        label: "H",
        kind: "stay",
      });
  return stops;
}
export function daySegments(
  activities: Activity[],
  day: number,
): [Point, Point][] {
  const items = activities.filter((a) => a.day === day),
    segments: [Point, Point][] = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].coordinates,
      b = items[i].coordinates;
    if (a && b && validPoint(a) && validPoint(b)) segments.push([a, b]);
  }
  return segments;
}
