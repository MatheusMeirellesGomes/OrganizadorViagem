import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { t as tr } from "../i18n";
import type { MapPoint, MapSegment } from "./tripmap";

/** Leaflet layer for the whole-trip map: different line styles per mode. */
export const modeStyle: Record<MapSegment["mode"], { color: string; dash?: string; weight: number }> = {
  air: { color: "#2f6f9f", dash: "2 9", weight: 2.5 },
  road: { color: "#b5701c", weight: 4 },
  rail: { color: "#6a4fa3", dash: "10 6", weight: 3 },
  water: { color: "#1f8a8a", dash: "6 6", weight: 3 },
  other: { color: "#55705f", dash: "4 6", weight: 2.5 },
};
const pointColor: Record<MapPoint["kind"], string> = {
  stay: "#a2513f",
  attraction: "#2d5a46",
  restaurant: "#c26a37",
  airport: "#2f6f9f",
  station: "#6a4fa3",
  stop: "#b5701c",
};

export function TripMapView({ segments, points, selected, onSelect }: { segments: MapSegment[]; points: MapPoint[]; selected?: string; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, { scrollWheelZoom: false }).setView([30, -20], 2);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on("tileerror", () => setTileError(true))
      .addTo(m);
    const o = new ResizeObserver(() => m.invalidateSize());
    o.observe(ref.current);
    return () => {
      o.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.layerGroup().addTo(m);
    const bounds: [number, number][] = [];
    for (const s of segments) {
      const st = modeStyle[s.mode];
      const on = !selected || selected === s.id;
      // Roads without a calculated route are dotted: a straight line is not a road.
      const dash = s.mode === "road" && s.straight ? "1 8" : st.dash;
      L.polyline(s.line, { color: st.color, weight: on ? st.weight + (selected === s.id ? 2 : 0) : 2, opacity: on ? 0.9 : 0.3, dashArray: dash, className: "tm-seg tm-" + s.mode })
        .on("click", () => onSelect(s.id))
        .bindTooltip(`${s.from.name} → ${s.to.name}`)
        .addTo(layer);
      bounds.push(...s.line);
    }
    for (const p of points) {
      L.circleMarker([p.point.lat, p.point.lng], { radius: p.kind === "stay" ? 8 : 6, color: "#fff", weight: 2, fillColor: pointColor[p.kind], fillOpacity: 1, className: "tm-pt tm-pt-" + p.kind })
        .bindTooltip(p.name)
        .addTo(layer);
      bounds.push([p.point.lat, p.point.lng]);
    }
    if (bounds.length) m.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 13 });
    return () => {
      layer.remove();
    };
  }, [segments, points, selected]);
  return (
    <div className="trip-map-wrap">
      <div ref={ref} className="trip-map" role="region" aria-label={tr("Mapa da viagem inteira")} />
      {tileError && <p className="muted">{tr("O fundo do mapa não carregou. As linhas e os pontos continuam aqui.")}</p>}
    </div>
  );
}
