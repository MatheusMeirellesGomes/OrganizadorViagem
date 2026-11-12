import { useEffect, useRef, useState } from "react";
import { X, MapPin, Train, Navigation } from "lucide-react";
import { t as tr, tf, formatNumber, getLocale } from "../i18n";
import { categories, type Place, type Point } from "../places";
import type { Trip } from "../model";
import { decisionLabels, type Decision } from "../choices";
import { safeExternalUrl } from "../travel-mode";
import { fetchGallery, fetchSummary, fetchTransport, nearbyPlaces, type GalleryPhoto, type Stop, type Summary } from "./details";
import { PlacePhoto, badgesFor, priceText } from "./PlaceCard";
import { addToItinerary, dayOf } from "./trip";
import { parseOpeningHours } from "./hours";
import { wikiLanguage } from "../catalog-service";

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** Days marked closed in the registered hours (only when the hours were understood). */
export function closedDays(hours?: string): string[] | undefined {
  const week = parseOpeningHours(hours);
  if (!week) return;
  return DAY_NAMES.filter((_, d) => !week.some(([s, e]) => s < (d + 1) * 1440 && e > d * 1440));
}

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children || <span className="muted">{tr("Não informado")}</span>}</dd>
    </>
  );
}

export function AddToTrip({
  place,
  trips,
  onSave,
  busy,
  initialTrip,
  onDone,
}: {
  place: Place;
  trips: Trip[];
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
  initialTrip?: string;
  onDone?: (message: string) => void;
}) {
  const [tripId, setTripId] = useState(initialTrip || trips[0]?.id || ""),
    [decision, setDecision] = useState<Decision>("want"),
    [day, setDay] = useState(1),
    [time, setTime] = useState(""),
    [notes, setNotes] = useState(""),
    [stayId, setStayId] = useState(""),
    [message, setMessage] = useState("");
  const trip = trips.find((t) => t.id === tripId);
  const already = trip ? dayOf(trip, place) : undefined;
  if (!trips.length)
    return <p className="muted">{tr("Crie uma viagem em Minhas viagens para adicionar lugares ao roteiro.")}</p>;
  return (
    <form
      className="add-to-trip"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!trip) return;
        if (already !== undefined) {
          setMessage(tf("Este lugar já está no roteiro (dia {day}).", { day: already }));
          return;
        }
        try {
          const next = addToItinerary(trip, place, { day, time, notes, stayId: stayId || undefined, decision });
          if (await onSave(next)) {
            const done = tf("{name} adicionado ao dia {day} de {trip}.", { name: place.name, day, trip: trip.title });
            setMessage(done);
            onDone?.(done);
          }
        } catch (err) {
          setMessage(err instanceof Error ? tr(err.message) : tr("Não foi possível adicionar."));
        }
      }}
    >
      <div className="form-grid">
        <label>
          {tr("Viagem")}
          <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Dia do roteiro")}
          <input type="number" min="1" max="3660" value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </label>
        <label>
          {tr("Horário opcional")}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        {(trip?.stays?.length ?? 0) > 0 && (
          <label>
            {tr("Hospedagem")}
            <select value={stayId} onChange={(e) => setStayId(e.target.value)}>
              <option value="">{tr("Nenhuma")}</option>
              {trip!.stays!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset className="decision-row">
        <legend>{tr("Marcar como")}</legend>
        {(["want", "maybe", "visited"] as Decision[]).map((d) => (
          <label key={d} className="chip-choice">
            <input type="radio" name="decision" checked={decision === d} onChange={() => setDecision(d)} />
            <span>{tr(decisionLabels[d])}</span>
          </label>
        ))}
      </fieldset>
      <label>
        {tr("Observações")}
        <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {already !== undefined && <p className="muted">{tf("Este lugar já está no roteiro (dia {day}).", { day: already })}</p>}
      <button className="primary" disabled={busy || !trip || already !== undefined}>
        {tr("Adicionar à viagem")}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}

export function PlacePanel({
  place,
  all,
  center,
  trips,
  onSave,
  busy,
  targetTrip,
  onClose,
  onShowOnMap,
  onSearchNear,
  onOpen,
}: {
  place: Place;
  all: Place[];
  center?: Point;
  trips: Trip[];
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
  targetTrip?: string;
  onClose: () => void;
  onShowOnMap: () => void;
  onSearchNear: (p: Point, name: string) => void;
  onOpen: (id: string) => void;
}) {
  const [summary, setSummary] = useState<Summary>(),
    [gallery, setGallery] = useState<GalleryPhoto[]>(),
    [stops, setStops] = useState<Stop[]>(),
    [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lang = wikiLanguage();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    const stop = new AbortController();
    setSummary(undefined);
    setGallery(undefined);
    setStops(undefined);
    setFailed(false);
    const p = place;
    Promise.allSettled([
      p.tags.article ? fetchSummary(p.tags.article, fetch, stop.signal).then(setSummary) : Promise.resolve(),
      fetchGallery(p, 8, fetch, stop.signal).then(setGallery),
      fetchTransport(p.coordinates, lang, fetch, stop.signal).then(setStops),
    ]).then((r) => {
      if (!stop.signal.aborted && r.every((x) => x.status === "rejected")) setFailed(true);
    });
    return () => stop.abort();
  }, [place.id]);

  const p = place;
  const near = nearbyPlaces(p, all);
  const website = safeExternalUrl(p.website || "");
  const hours = p.tags.opening_hours;
  const closed = closedDays(hours);
  const address = [p.address, p.tags["addr:suburb"], p.city, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  return (
    <dialog
      ref={dialog}
      className="place-panel"
      aria-labelledby="place-panel-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="place-panel-inner">
        <button className="icon-button place-panel-close" onClick={() => dialog.current?.close()} aria-label={tr("Fechar")}>
          <X size={20} />
        </button>
        <div className="place-gallery">
          {gallery && gallery.length > 1 ? (
            <div className="place-gallery-strip" role="list" aria-label={tr("Fotos verificadas")}>
              {gallery.map((g) => (
                <figure key={g.file} role="listitem">
                  <img src={g.url} alt={tf("Foto de {name}", { name: p.name })} loading="lazy" referrerPolicy="no-referrer" />
                  <figcaption className="photo-credit">
                    <a href={"https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(g.file.replace(/ /g, "_"))} target="_blank" rel="noreferrer">
                      {g.credit?.artist}
                    </a>{" "}
                    · {g.credit?.license}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <PlacePhoto place={p} large />
          )}
        </div>
        <p className="eyebrow">{tr(categories[p.category] ?? "Outros lugares")}</p>
        <h2 id="place-panel-title">{p.name}</h2>
        {p.tags.official_name && <p className="place-card-official">{p.tags.official_name}</p>}
        <ul className="place-badges">
          {badgesFor(p).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {summary ? (
          <p className="place-summary">
            {summary.text}{" "}
            <a href={summary.url} target="_blank" rel="noreferrer">
              {tr("Ler na Wikipédia")}
            </a>
          </p>
        ) : (
          p.tags.description && <p className="place-summary">{p.tags.description}</p>
        )}
        <div className="tm-actions">
          <button className="secondary" onClick={onShowOnMap}>
            <MapPin size={16} /> {tr("Ver no mapa")}
          </button>
          <a className="button secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${p.coordinates.lat},${p.coordinates.lng}`} target="_blank" rel="noreferrer">
            <Navigation size={16} /> {tr("Como chegar")}
          </a>
          <button className="secondary" onClick={() => onSearchNear(p.coordinates, p.name)}>
            {tr("Buscar perto daqui")}
          </button>
        </div>
        <dl className="place-details">
          <Row label={tr("Endereço")}>{address}</Row>
          <Row label={tr("Horários")}>{hours && <span>{hours} <span className="muted">· {tr("cadastro colaborativo, confirme antes de ir")}</span></span>}</Row>
          <Row label={tr("Dias de fechamento")}>{closed && (closed.length ? closed.map((d) => tr(d)).join(", ") : tr("Abre todos os dias"))}</Row>
          <Row label={tr("Preços")}>{priceText(p)}</Row>
          <Row label={tr("Site oficial")}>
            {website && (
              <a href={website} target="_blank" rel="noreferrer">
                {new URL(website).hostname}
              </a>
            )}
          </Row>
          <Row label={tr("Ingressos")}>{website && p.tags.fee !== "no" && tr("Compre e confira descontos no site oficial.")}</Row>
          <Row label={tr("Duração estimada")} />
          <Row label={tr("Acessibilidade")}>
            {p.tags.wheelchair === "yes" ? tr("Acessível para cadeira de rodas") : p.tags.wheelchair === "limited" ? tr("Acessibilidade parcial") : p.tags.wheelchair === "no" ? tr("Sem acesso para cadeira de rodas") : ""}
          </Row>
          <Row label={tr("Transporte público próximo")}>
            {stops === undefined && !failed ? (
              <span className="muted">{tr("Carregando…")}</span>
            ) : (
              stops?.length ? (
                <ul className="plain-list">
                  {stops.map((s) => (
                    <li key={s.kind + s.name}>
                      <Train size={14} aria-hidden="true" /> {tr(s.kind)} · {s.name} · {tf("{m} m", { m: Math.round(s.km * 1000) })}
                    </li>
                  ))}
                </ul>
              ) : null
            )}
          </Row>
          <Row label={tr("Atrações próximas")}>
            {near.length ? (
              <ul className="plain-list">
                {near.map(({ place: n, km }) => (
                  <li key={n.id}>
                    <button className="text-link" onClick={() => onOpen(n.id)}>
                      {n.name}
                    </button>{" "}
                    · {tf("{km} km", { km: formatNumber(km, 1) })}
                  </li>
                ))}
              </ul>
            ) : null}
          </Row>
          <Row label={tr("Fonte dos dados")}>
            <a href={p.source} target="_blank" rel="noreferrer">
              {p.tags.provider === "openstreetmap" ? "OpenStreetMap" : p.tags.provider === "wikidata" ? "Wikidata / Wikipédia" : tr("Ver fonte")}
            </a>
            {p.tags.wikidata && p.tags.provider !== "wikidata" && (
              <>
                {" · "}
                <a href={"https://www.wikidata.org/wiki/" + p.tags.wikidata} target="_blank" rel="noreferrer">
                  Wikidata
                </a>
              </>
            )}
          </Row>
          <Row label={tr("Última atualização")}>
            {tf("Consultado em {date}", { date: new Date(p.retrievedAt).toLocaleString(getLocale()) })}
          </Row>
        </dl>
        {failed && <p className="muted">{tr("Alguns detalhes não carregaram. Verifique a conexão.")}</p>}
        <h3>{tr("Adicionar à viagem")}</h3>
        <AddToTrip place={p} trips={trips} onSave={onSave} busy={busy} initialTrip={targetTrip} />
      </div>
    </dialog>
  );
}
