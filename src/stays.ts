import type { Stay, Trip } from "./model";
import { calendarDate, safeExternalUrl } from "./travel-mode";
export function staysOnDate(trip: Trip, date: string): Stay[] {
  if (!calendarDate(date)) return [];
  return (trip.stays || []).filter(
    (s) =>
      calendarDate(s.start) &&
      calendarDate(s.end) &&
      s.start <= date &&
      date < s.end,
  );
}
export function removeStay(trip: Trip, id: string): Trip {
  return {
    ...trip,
    stays: (trip.stays || []).filter((s) => s.id !== id),
    reservations: trip.reservations.map((r) =>
      r.stayId === id ? { ...r, stayId: undefined } : r,
    ),
  };
}
export function stayFromForm(f: FormData, id: string): Stay {
  const get = (key: string) => String(f.get(key) || "").trim();
  const start = get("start"),
    end = get("end"),
    url = get("url");
  if (
    (start && !calendarDate(start)) ||
    (end && !calendarDate(end)) ||
    (start && end && end < start)
  )
    throw new Error("Confira as datas de entrada e saída.");
  if (url && !safeExternalUrl(url))
    throw new Error("Use um link http ou https para a reserva.");
  const lat = get("lat"),
    lng = get("lng");
  if (
    (lat || lng) &&
    (!lat ||
      !lng ||
      !Number.isFinite(Number(lat)) ||
      !Number.isFinite(Number(lng)) ||
      Math.abs(Number(lat)) > 90 ||
      Math.abs(Number(lng)) > 180)
  )
    throw new Error(
      "Informe latitude e longitude válidas juntas, ou deixe ambas vazias.",
    );
  return {
    id,
    name: get("name") || "Hospedagem",
    address: get("address"),
    city: get("city"),
    start,
    end,
    checkInTime: get("checkInTime"),
    checkOutTime: get("checkOutTime"),
    url,
    confirmation: get("confirmation"),
    notes: get("notes"),
    coordinates:
      lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined,
  };
}
export function stayDirections(stay: Stay) {
  const destination = stay.coordinates
    ? `${stay.coordinates.lat},${stay.coordinates.lng}`
    : [stay.address, stay.city].filter(Boolean).join(", ");
  return destination
    ? "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(destination)
    : undefined;
}
