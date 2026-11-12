import { tf, formatNumber } from "./i18n";
import { t as tr } from "./i18n";
import { useState } from "react";
import type { Trip } from "./model";
import { nearbySavedPlaces } from "./travel-clock";
import { directionsLink, type Transport } from "./routes";
import type { Point } from "./places";
export function TravelNearby({
  trip,
  online,
  transport,
}: {
  trip: Trip;
  online: boolean;
  transport: Transport;
}) {
  const [point, setPoint] = useState<Point>(),
    [message, setMessage] = useState(""),
    [locating, setLocating] = useState(false),
    [origin, setOrigin] = useState("");
  const origins = [
    ...(trip.stays || [])
      .filter((s) => s.coordinates)
      .map((s) => ({ id: s.id, title: s.name, coordinates: s.coordinates! })),
    ...trip.activities
      .filter((a) => a.coordinates)
      .map((a) => ({ id: a.id, title: a.title, coordinates: a.coordinates! })),
  ];
  const nearby = point ? nearbySavedPlaces(trip, point) : [];
  return (
    <details className="tm-information">
      <summary>{tr("Perto de você · lugares salvos")}</summary>
      <div className="tm-information-content">
        <p>{tr("Escolha uma referência ou consulte sua posição uma vez. A posição do aparelho não é salva na viagem.")}</p>
        <label>
          {tr("Ponto de referência")}
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setPoint(
                origins.find((o) => o.id === e.target.value)?.coordinates,
              );
            }}
          >
            <option value="">{tr("Selecione um lugar")}</option>
            {origins.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          disabled={locating}
          onClick={() => {
            if (!navigator.geolocation) {
              setMessage(tr("Localização não disponível neste aparelho."));
              return;
            }
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setPoint({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
                setOrigin("");
                setMessage(
                  tr("Posição consultada uma vez. Nenhum rastreamento está ativo."),
                );
                setLocating(false);
              },
              () => {
                setMessage(
                  tr("Não foi possível obter a posição. Você pode escolher um lugar da lista."),
                );
                setLocating(false);
              },
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
            );
          }}
        >
          {locating ? tr("Consultando posição…") : tr("Usar minha posição uma vez")}
        </button>
        {point && (
          <>
            <button
              className="text-button"
              onClick={() => {
                setPoint(undefined);
                setOrigin("");
                setMessage(tr("Referência removida."));
              }}
            >
              {tr("Limpar referência")}
            </button>
            {nearby.length ? (
              nearby.map((p) => (
                <article key={p.id} className="tm-reservation">
                  <h4>{p.title}</h4>
                  <p>{tf("{km} km em linha reta", { km: formatNumber(p.distance, 1) })}</p>
                  {online && (
                    <a
                      href={directionsLink(p, transport, {
                        address: "",
                        coordinates: point,
                      })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("Como chegar")}
                    </a>
                  )}
                </article>
              ))
            ) : (
              <p>{tr("Não há lugares salvos com coordenadas.")}</p>
            )}
            {online && (
              <a
                className="secondary"
                href={
                  "https://www.google.com/maps/search/?api=1&query=" +
                  encodeURIComponent(
                    `restaurantes perto de ${point.lat},${point.lng}`,
                  )
                }
                target="_blank"
                rel="noreferrer"
              >{tr("Consultar restaurantes no Google Maps")}</a>
            )}
            <p className="tm-help">{tr("Proximidade não confirma abertura, tempo de caminhada ou disponibilidade. Ao abrir o Google Maps, o ponto escolhido é enviado para calcular a busca.")}</p>
          </>
        )}
        <p role="status">{tr(message)}</p>
      </div>
    </details>
  );
}
