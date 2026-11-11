import { t as tr } from "./i18n";
import { useMemo, useState } from "react";
import type { Trip } from "./model";
import { RouteMap } from "./RouteMap";
import {
  mapStops,
  daySegments,
  directionsLink,
  routeLocations,
  transportLabels,
  type Transport,
} from "./routes";
import { travelDays, dayLabel } from "./travel-mode";
export function RoutePlanner({
  trip,
  day,
  onDayChange,
}: {
  trip: Trip;
  day: number;
  onDayChange: (n: number) => void;
}) {
  const [mode, setMode] = useState<Transport>("walking"),
    [origin, setOrigin] = useState(""),
    [destination, setDestination] = useState("");
  const stops = useMemo(() => mapStops(trip, day), [trip, day]),
    segments = useMemo(() => daySegments(trip.activities, day), [trip, day]);
  const locations = routeLocations(trip),
    selected = locations.find((l) => l.id === destination),
    from = locations.find((l) => l.id === origin),
    url = selected && directionsLink(selected, mode, from);
  return (
    <section className="panel">
      <h2>{tr("O caminho do dia")}</h2>
      <label>
        {tr("Dia no mapa")}
        <select
          value={day}
          onChange={(e) => onDayChange(Number(e.target.value))}
        >
          {travelDays(trip, day).map((n) => (
            <option key={n} value={n}>
              {dayLabel(trip, n).full}
            </option>
          ))}
        </select>
      </label>
      <RouteMap stops={stops} segments={segments} />
      {!stops.length && (
        <p>
          Nenhuma coordenada cadastrada para mostrar. Você ainda pode navegar
          usando os endereços.
        </p>
      )}
      <div className="catalog-filters">
        <label>
          {tr("Sair de")}
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">
              {tr("Localização escolhida no Google Maps")}
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Ir para")}
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">{tr("Selecione um lugar")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Transporte")}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Transport)}
          >
            {Object.entries(transportLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {url ? (
        <a className="primary" href={url} target="_blank" rel="noreferrer">
          {tr("Calcular trajeto no Google Maps")}
        </a>
      ) : (
        <p className="subtle">
          Escolha um destino com endereço ou coordenadas.
        </p>
      )}
      <p className="subtle">
        O Google Maps consulta trajetos, estimativas e opções de metrô, ônibus
        ou trem onde disponíveis. Linhas, horários, baldeações e custos não são
        calculados por este aplicativo.
      </p>
      <ol>
        {trip.activities
          .filter((a) => a.day === day)
          .map((a) => (
            <li key={a.id}>
              <b>{a.title}</b>
              {!a.coordinates && " · Sem coordenadas no mapa"}
              {directionsLink(a, mode) && (
                <p>
                  <a
                    href={directionsLink(a, mode)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Como chegar · {tr(transportLabels[mode])}
                  </a>
                </p>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}
