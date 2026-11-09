import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Trip } from "./model";
export type Coordinates = { lat: number; lng: number };
export function TravelMap({
  trips,
  selectable = false,
  onPick,
  focus,
}: {
  trips: Trip[];
  selectable?: boolean;
  onPick?: (point: Coordinates) => void;
  focus?: Coordinates;
}) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<L.Map | null>(null),
    markersRef = useRef<L.LayerGroup | null>(null),
    pickRef = useRef(onPick),
    [failed, setFailed] = useState(false);
  pickRef.current = onPick;
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView([20, -10], 2);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    );
    tiles.on("tileerror", () => setFailed(true));
    tiles.addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) =>
      pickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }),
    );
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current,
      markers = markersRef.current;
    if (!map || !markers) return;
    markers.clearLayers();
    const points: L.LatLngExpression[] = [];
    trips.forEach((trip) => {
      if (!trip.coordinates) return;
      const { lat, lng } = trip.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      points.push([lat, lng]);
      const el = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = trip.title;
      const detail = document.createElement("p");
      detail.textContent = trip.destination || "Destino marcado";
      el.append(title, detail);
      L.circleMarker([lat, lng], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: trip.status === "past" ? "#b48e57" : "#244f43",
        fillOpacity: 1,
      })
        .bindPopup(el)
        .addTo(markers);
    });
    if (focus) {
      L.circleMarker([focus.lat, focus.lng], {
        radius: 10,
        color: "#b48e57",
        fillColor: "#e5c58d",
        fillOpacity: 0.8,
        weight: 3,
      }).addTo(markers);
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 5));
    } else if (points.length === 1) map.setView(points[0], 5);
    else if (points.length > 1)
      map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 8 });
  }, [trips, focus]);
  return (
    <div className="travel-map-wrap">
      <div
        ref={container}
        className={"travel-map " + (selectable ? "selectable" : "")}
        aria-label="Mapa interativo de destinos"
      />
      {failed && (
        <p className="map-error">
          O mapa não carregou por completo. Verifique a conexão.
        </p>
      )}
      <div className="map-caption">
        <span>
          <i />
          Planejamento <i className="past" />
          Viagens anteriores
        </span>
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Reportar erro no mapa
        </a>
      </div>
    </div>
  );
}
