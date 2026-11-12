import type { Trip } from "../model";
import type { SavedPlace as Place } from "../choices";
import { verifiedPhoto } from "../explore/photos";
import { decor } from "../decor";

/*
 * The four overview cards (Etapa 16). Numbers always come from the trips the
 * person registered. A card shows a verified photo of one of their own places
 * when there is one; otherwise a generic illustrative photo, labelled as such.
 */

export type MetricKey = "upcoming" | "visited" | "places" | "done";
export type MetricPhoto =
  | { kind: "place"; url: string; place: Place }
  | { kind: "generic"; url: string };
export type Metric = {
  key: MetricKey;
  value: number;
  label: string;
  text: string;
  page: "trips" | "history";
  photo: MetricPhoto;
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=640&h=420&q=72`;
/** Generic photos (Unsplash License). They never represent the person's trips. */
export const genericPhotos: Record<MetricKey, string> = {
  // Not the wing photo: that one is already in the sidebar.
  upcoming: decor.windowAlt.replace("w=480&h=300", "w=640&h=420"),
  visited: unsplash("1516483638261-f4dbaf036963"),
  places: unsplash("1502602898657-3e91760cbb34"),
  done: decor.road.replace("w=480&h=300", "w=640&h=420"),
};

const byStart = (a: Trip, b: Trip) => (a.start || "9999").localeCompare(b.start || "9999");

/** First place of these trips with a verified photo, preferring places in the itinerary. */
export function placeWithPhoto(trips: Trip[], onlyItinerary = false): Place | undefined {
  for (const t of trips) {
    const inPlan = new Set(t.activities.map((a) => a.placeId).filter(Boolean));
    const choices = (t.placeChoices || []).filter((c) => c.decision !== "skip");
    const ordered = [...choices.filter((c) => inPlan.has(c.place.id)), ...(onlyItinerary ? [] : choices.filter((c) => !inPlan.has(c.place.id)))];
    const hit = ordered.find((c) => verifiedPhoto(c.place, 640));
    if (hit) return hit.place;
  }
}

const photo = (key: MetricKey, place?: Place): MetricPhoto => {
  const p = place && verifiedPhoto(place, 640);
  return p && place ? { kind: "place", url: p.url, place } : { kind: "generic", url: genericPhotos[key] };
};

export function overviewMetrics(trips: Trip[]): Metric[] {
  const coming = trips.filter((t) => t.status !== "past").sort(byStart);
  const past = trips.filter((t) => t.status === "past");
  const destinations = new Set(past.filter((t) => t.destination.trim()).map((t) => t.destination.trim().toLowerCase()));
  const places = trips.reduce((n, t) => n + t.activities.length, 0);
  return [
    { key: "upcoming", value: coming.length, label: "Viagens por vir", text: "Planos em andamento e próximas partidas.", page: "trips", photo: photo("upcoming", placeWithPhoto(coming)) },
    { key: "visited", value: destinations.size, label: "Destinos visitados", text: "Lugares das viagens já concluídas.", page: "history", photo: photo("visited", placeWithPhoto(past)) },
    { key: "places", value: places, label: "Lugares no roteiro", text: "Atividades marcadas em todas as viagens.", page: "trips", photo: photo("places", placeWithPhoto([...coming, ...past], true)) },
    { key: "done", value: past.length, label: "Viagens realizadas", text: "Histórico do que você já viveu.", page: "history", photo: photo("done") },
  ];
}
