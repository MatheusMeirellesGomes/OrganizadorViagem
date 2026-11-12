import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { t as tr, tf, formatNumber } from "../i18n";
import { categories, distanceKm, type Place, type Point } from "../places";
import { attractionGroups } from "./categories";

/*
 * Map of the Explorar results: the search circle, one colored marker per
 * category, nearby markers grouped into a numbered bubble, and the selected
 * place highlighted. Clicking a marker selects its card and the other way round.
 */

export const groupColors: Record<string, string> = {
  palaces: "#8b5a2b",
  castles: "#6f4e37",
  squares: "#b48e57",
  museums: "#5a4fcf",
  monuments: "#7d6b5d",
  worship: "#8c3b3b",
  parks: "#2f7d4f",
  viewpoints: "#2d6f8f",
  zoos: "#b5651d",
  markets: "#9c6b1a",
  ruins: "#6b5b45",
  nature: "#1f7a6d",
  mountains: "#4f6d3a",
  culture: "#a23b72",
  family: "#c2410c",
  other: "#4b5563",
  food: "#b4532a",
};

export function colorFor(place: Place) {
  const group = attractionGroups.find((g) => g.categories.includes(place.category));
  return groupColors[group?.id ?? (["restaurant", "cafe", "fast_food", "food_court", "ice_cream", "bakery", "pastry"].includes(place.category) ? "food" : "other")];
}

/** Groups markers closer than `cell` pixels at the current zoom. */
export function clusterPoints<T extends { x: number; y: number }>(items: T[], cell = 46): T[][] {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const key = Math.floor(item.x / cell) + ":" + Math.floor(item.y / cell);
    const list = cells.get(key) ?? [];
    list.push(item);
    cells.set(key, list);
  }
  return [...cells.values()];
}

export function ExploreMap({
  center,
  radius,
  places,
  selectedId,
  onSelect,
  onPick,
  onSearchHere,
  onDetails,
}: {
  center?: Point;
  radius: number;
  places: Place[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onPick: (p: Point) => void;
  onSearchHere: (p: Point) => void;
  onDetails: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null),
    mapRef = useRef<L.Map | null>(null),
    layerRef = useRef<L.LayerGroup | null>(null),
    handlers = useRef({ onSelect, onPick, onDetails }),
    [moved, setMoved] = useState<Point>(),
    [zoom, setZoom] = useState(0),
    [failed, setFailed] = useState(false);
  handlers.current = { onSelect, onPick, onDetails };

  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { scrollWheelZoom: false, worldCopyJump: true }).setView([20, -10], 2);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    tiles.on("tileerror", () => setFailed(true));
    tiles.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("click", (e: L.LeafletMouseEvent) => handlers.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("dragend", () => {
      const c = map.getCenter();
      setMoved({ lat: c.lat, lng: ((c.lng + 540) % 360) - 180 });
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(box.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit the circle when the center or radius changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.fitBounds(L.latLng(center.lat, center.lng).toBounds(radius * 2), { padding: [16, 16], maxZoom: 16 });
    setMoved(undefined);
    setZoom(map.getZoom());
  }, [center?.lat, center?.lng, radius]);

  // Draw circle, clusters and markers.
  useEffect(() => {
    const map = mapRef.current,
      layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (center) {
      L.circle([center.lat, center.lng], { radius, color: "#244f43", weight: 2, fillColor: "#244f43", fillOpacity: 0.06, interactive: false }).addTo(layer);
      L.circleMarker([center.lat, center.lng], { radius: 6, color: "#fff", weight: 2, fillColor: "#244f43", fillOpacity: 1, interactive: false }).addTo(layer);
    }
    const projected = places.map((p) => {
      const pt = map.latLngToLayerPoint([p.coordinates.lat, p.coordinates.lng]);
      return { place: p, x: pt.x, y: pt.y };
    });
    const selected = places.find((p) => p.id === selectedId);
    for (const group of clusterPoints(projected.filter((x) => x.place.id !== selectedId))) {
      if (group.length > 1 && map.getZoom() < 17) {
        const lat = group.reduce((s, g) => s + g.place.coordinates.lat, 0) / group.length,
          lng = group.reduce((s, g) => s + g.place.coordinates.lng, 0) / group.length;
        L.marker([lat, lng], {
          icon: L.divIcon({ className: "explore-cluster", html: `<span>${group.length}</span>`, iconSize: [38, 38] }),
          keyboard: true,
          title: tf("{count} lugares próximos", { count: group.length }),
        })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            map.fitBounds(L.latLngBounds(group.map((g) => [g.place.coordinates.lat, g.place.coordinates.lng] as [number, number])), { padding: [40, 40], maxZoom: 18 });
          })
          .addTo(layer);
        continue;
      }
      for (const g of group) marker(g.place, false).addTo(layer);
    }
    if (selected) marker(selected, true).addTo(layer);

    function marker(p: Place, isSelected: boolean) {
      const m = L.circleMarker([p.coordinates.lat, p.coordinates.lng], {
        radius: isSelected ? 12 : 8,
        color: isSelected ? "#1d1d1b" : "#fff",
        weight: isSelected ? 4 : 2,
        fillColor: colorFor(p),
        fillOpacity: 1,
      });
      const el = document.createElement("div");
      el.className = "explore-popup";
      const name = document.createElement("strong");
      name.textContent = p.name;
      const info = document.createElement("p");
      info.textContent = [tr(categories[p.category] ?? "Outros lugares"), center ? tf("{km} km", { km: formatNumber(distanceKm(center, p.coordinates), 1) }) : ""]
        .filter(Boolean)
        .join(" · ");
      const actions = document.createElement("div");
      const details = document.createElement("button");
      details.type = "button";
      details.textContent = tr("Ver detalhes");
      details.onclick = () => handlers.current.onDetails(p.id);
      const route = document.createElement("a");
      route.href = `https://www.google.com/maps/dir/?api=1&destination=${p.coordinates.lat},${p.coordinates.lng}`;
      route.target = "_blank";
      route.rel = "noreferrer";
      route.textContent = tr("Abrir rota");
      actions.append(details, route);
      el.append(name, info, actions);
      m.bindPopup(el).on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        handlers.current.onSelect(p.id);
      });
      if (isSelected) setTimeout(() => m.openPopup(), 0);
      return m;
    }
  }, [places, selectedId, center?.lat, center?.lng, radius, zoom]);

  // Bring the selected place into view.
  useEffect(() => {
    const map = mapRef.current;
    const p = places.find((x) => x.id === selectedId);
    if (map && p && !map.getBounds().contains([p.coordinates.lat, p.coordinates.lng]))
      map.panTo([p.coordinates.lat, p.coordinates.lng]);
  }, [selectedId]);

  return (
    <div className="explore-map-wrap">
      <div ref={box} className="explore-map" role="region" aria-label={tr("Mapa dos resultados")} />
      {moved && center && distanceKm(moved, center) * 1000 > radius / 3 && (
        <button className="primary explore-map-here" onClick={() => onSearchHere(moved)}>
          {tr("Buscar nesta área")}
        </button>
      )}
      {failed && <p className="map-error">{tr("O mapa não carregou por completo. Verifique a conexão.")}</p>}
      <p className="muted explore-map-hint">{tr("Toque no mapa para buscar a partir de outro ponto.")}</p>
    </div>
  );
}
