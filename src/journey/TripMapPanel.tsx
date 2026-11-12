import { useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { t as tr, tf, formatMoney, formatNumber, getLocale } from "../i18n";
import type { Trip } from "../model";
import { TripMapView } from "../LazyMaps";
import { durationText } from "./time";
import { transportKinds } from "./types";
import { filterMap, tripMapData } from "./tripmap";

const legend = [
  ["air", "Voo (linha reta, não é a rota)"],
  ["road", "Estrada"],
  ["rail", "Trem"],
  ["water", "Barco"],
] as const;
const pointLegend = [
  ["stay", "Hospedagens"],
  ["attraction", "Atrações"],
  ["restaurant", "Restaurantes"],
  ["airport", "Aeroportos"],
  ["station", "Estações"],
  ["stop", "Paradas e cidades"],
] as const;

/** Whole-trip map with day and leg filters (Fase 11). */
export function TripMapPanel({ trip }: { trip: Trip }) {
  const data = useMemo(() => tripMapData(trip), [trip]);
  const [date, setDate] = useState("");
  const [transportId, setTransportId] = useState("");
  const [selected, setSelected] = useState<string>();
  const shown = filterMap(data, { date, transportId });
  const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(getLocale(), { day: "2-digit", month: "short" });
  if (!data.segments.length && !data.points.length)
    return (
      <section className="panel journey-card">
        <h3>
          <MapIcon size={17} aria-hidden="true" /> {tr("Mapa da viagem inteira")}
        </h3>
        <p className="muted">{tr("Escolha origem e destino pelas sugestões em Transportes e marque hospedagens e atividades no mapa para ver o percurso completo aqui.")}</p>
      </section>
    );
  return (
    <section className="panel journey-card trip-map-panel">
      <h3>
        <MapIcon size={17} aria-hidden="true" /> {tr("Mapa da viagem inteira")}
      </h3>
      <div className="wallet-filters">
        <select value={date} onChange={(e) => { setDate(e.target.value); setTransportId(""); setSelected(undefined); }} aria-label={tr("Filtrar por dia")}>
          <option value="">{tr("Viagem inteira")}</option>
          {data.dates.map((d) => (
            <option key={d} value={d}>
              {fmt(d)}
            </option>
          ))}
        </select>
        <select value={transportId} onChange={(e) => { setTransportId(e.target.value); setDate(""); setSelected(undefined); }} aria-label={tr("Filtrar por trecho")}>
          <option value="">{tr("Todos os trechos")}</option>
          {[...new Map(data.segments.map((s) => [s.transportId, s.title])).entries()].map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </div>
      <TripMapView segments={shown.segments} points={shown.points} selected={selected} onSelect={setSelected} />
      <ul className="trip-map-legend" aria-label={tr("Legenda")}>
        {legend.map(([m, l]) => (
          <li key={m}>
            <span className={"lg-line lg-" + m} aria-hidden="true" /> {tr(l)}
          </li>
        ))}
        {pointLegend.map(([k, l]) => (
          <li key={k}>
            <span className={"lg-dot lg-" + k} aria-hidden="true" /> {tr(l)}
          </li>
        ))}
      </ul>
      {shown.segments.length > 0 && (
        <ul className="trip-map-segments">
          {shown.segments.map((s) => (
            <li key={s.id} className={selected === s.id ? "is-on" : ""}>
              <button className="text-button" onClick={() => setSelected(selected === s.id ? undefined : s.id)} aria-pressed={selected === s.id}>
                <b>
                  {s.from.name} → {s.to.name}
                </b>
                <small>
                  {[
                    tr(transportKinds[s.kind]),
                    s.date && fmt(s.date),
                    s.distanceKm !== undefined &&
                      (s.distanceKind === "straight"
                        ? tf("{km} km em linha reta", { km: formatNumber(s.distanceKm, 0) })
                        : s.distanceKind === "route"
                          ? tf("{km} km por estrada (rota calculada)", { km: formatNumber(s.distanceKm, 0) })
                          : tf("{km} km por estrada (informado)", { km: formatNumber(s.distanceKm, 0) })),
                    s.mode === "road" && s.distanceKind === "none" && tr("distância por estrada não informada"),
                    s.minutes && s.minutes > 0 && durationText(s.minutes),
                    ...s.costs.map((c) => (c.paid ? tf("{value} pago", { value: formatMoney(c.paid, c.currency) }) : tf("{value} previsto", { value: formatMoney(c.planned, c.currency) }))),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
