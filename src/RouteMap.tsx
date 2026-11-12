import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapStop } from "./routes";
import type { Point } from "./places";
export function RouteMap({
  stops,
  segments,
}: {
  stops: MapStop[];
  segments: [Point, Point][];
}) {
  const ref = useRef<HTMLDivElement>(null),
    mapRef = useRef<L.Map | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(
      [20, -10],
      2,
    );
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => setError(true))
      .addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    if (stops.length)
      map.fitBounds(
        L.latLngBounds(stops.map((s) => [s.point.lat, s.point.lng])),
        { padding: [35, 35], maxZoom: 15 },
      );
    const draw = () => {
      layer.clearLayers();
      segments.forEach(([a, b]) =>
        L.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          { color: "#537d65", weight: 2, dashArray: "5 7", interactive: false },
        ).addTo(layer),
      );
      const groups = new Map<string, MapStop[]>();
      for (const stop of stops) {
        const pixel = map.latLngToLayerPoint([stop.point.lat, stop.point.lng]),
          key = Math.floor(pixel.x / 42) + ":" + Math.floor(pixel.y / 42);
        groups.set(key, [...(groups.get(key) || []), stop]);
      }
      for (const group of groups.values()) {
        const first = group[0],
          content = document.createElement("div");
        group.forEach((s) => {
          const p = document.createElement("p");
          p.textContent = s.label + " · " + s.title;
          content.append(p);
        });
        const icon = L.divIcon({
          className: "route-pin " + (group.length > 1 ? "group" : first.kind),
          html: group.length > 1 ? String(group.length) : first.label,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([first.point.lat, first.point.lng], {
          icon,
          title:
            group.length > 1 ? `${group.length} lugares próximos` : first.title,
        })
          .bindPopup(content)
          .addTo(layer);
      }
    };
    draw();
    map.on("zoomend", draw);
    return () => {
      map.off("zoomend", draw);
      layer.remove();
    };
  }, [stops, segments]);
  return (
    <>
      <div
        ref={ref}
        className="travel-map route-map"
        aria-label={tr("Mapa de atividades e hospedagens")}
      />
      {error && (
        <p role="status">{tr("O mapa não carregou completamente. Os lugares continuam na lista abaixo.")}</p>
      )}
      <p className="subtle">{tr("Números: ordem do dia · H: hospedagem · Dourado: visitado · Terracota: alimentação. Pontos próximos são agrupados. Linhas pontilhadas indicam sequência em linha reta, não trajetos por ruas.")}</p>
    </>
  );
}
