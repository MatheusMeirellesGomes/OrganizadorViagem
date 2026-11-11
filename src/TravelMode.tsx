import { tf } from "./i18n";
import { t as tr } from "./i18n";
import { TravelNearby } from "./TravelNearby";
import { currentTripDay } from "./travel-clock";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Compass,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  WifiOff,
} from "lucide-react";
import { directionsLink, transportLabels, type Transport } from "./routes";
import { staysOnDate, stayDirections } from "./stays";
import { calendarDate } from "./travel-mode";
import type { Activity, Trip } from "./model";
import {
  dayActivities,
  dayLabel,
  dayProgress,
  hasTravelInformation,
  nextActivity,
  safeExternalUrl,
  toggleVisited,
  travelDays,
} from "./travel-mode";
import "./travel-mode.css";
import { decor, hideOnError } from "./decor";
type Props = {
  trip: Trip;
  day: number;
  onDayChange: (day: number) => void;
  onBack: () => void;
  onSave: (trip: Trip) => Promise<boolean>;
  online: boolean;
  busy: boolean;
};
export function TravelMode({
  trip,
  day,
  onDayChange,
  onBack,
  onSave,
  online,
  busy,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = currentTripDay(trip, now);
  const [transport, setTransport] = useState<Transport>("walking");
  const heading = useRef<HTMLHeadingElement>(null),
    daysRef = useRef<HTMLElement>(null),
    [feedback, setFeedback] = useState(""),
    [pending, setPending] = useState(false);
  const activities = dayActivities(trip, day),
    progress = dayProgress(trip, day),
    next = nextActivity(trip, day),
    label = dayLabel(trip, day);
  const startDate = calendarDate(trip.start);
  const selectedDate = startDate
    ? new Date(+startDate + (day - 1) * 86400000).toISOString().slice(0, 10)
    : "";
  const selectedStays = staysOnDate(trip, selectedDate);
  const saving = busy || pending;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const current = daysRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (current && daysRef.current)
      daysRef.current.scrollLeft =
        current.offsetLeft - daysRef.current.offsetLeft - 12;
  }, [day]);
  useEffect(() => {
    setFeedback("");
  }, [day]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  async function update(nextTrip: Trip, message: string) {
    if (saving) return;
    setPending(true);
    try {
      if (await onSave(nextTrip)) setFeedback(message);
      else
        setFeedback(tr("Não foi possível salvar. Sua marcação não foi alterada."));
    } catch {
      setFeedback(tr("Não foi possível salvar. Tente novamente."));
    } finally {
      setPending(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(tr("Informação copiada."));
    } catch {
      setFeedback(
        tr("Não foi possível copiar automaticamente. Selecione o texto para copiar."),
      );
    }
  }
  function externalLink(url: string, text: string) {
    return online ? (
      <a className="secondary" href={url} target="_blank" rel="noreferrer">
        {text}
        <ExternalLink size={16} />
      </a>
    ) : (
      <span className="tm-unavailable">
        <WifiOff size={15} />
        {tf("{text}: precisa de internet", { text })}</span>
    );
  }
  function directions(activity: Activity) {
    const url = directionsLink(activity, transport);
    return url ? externalLink(url, "Como chegar") : null;
  }
  return (
    <section className="travel-mode" aria-labelledby="travel-mode-title">
      <header className="tm-header">
        <button className="tm-back" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>{tr("Planejamento")}</span>
        </button>
        <span className="tm-badge">
          <Compass size={15} />
          {tr("Modo Viagem")}
        </span>
      </header>
      <div className="tm-title">
        <p className="eyebrow">{tr("UM DIA DE CADA VEZ")}</p>
        <h1 id="travel-mode-title" ref={heading} tabIndex={-1}>
          {trip.title || tr("Sua viagem")}
        </h1>
        {trip.destination?.trim() && (
          <p>
            <MapPin size={15} />
            {trip.destination}
          </p>
        )}
      </div>
      {!online && (
        <p className="tm-offline" role="status">
          <WifiOff size={16} />{tr("Sem conexão · Seus dados locais continuam disponíveis. Mapas e links precisam de internet.")}</p>
      )}
      <nav ref={daysRef} className="tm-days" aria-label={tr("Dias da viagem")}>
        {travelDays(trip, day).map((number) => (
          <button
            key={number}
            aria-pressed={day === number}
            aria-label={tf("Dia {number}: {label}", { number, label: dayLabel(trip, number).full })}
            onClick={() => onDayChange(number)}
          >
            <span>
              {tf("Dia {number}", { number })}
              {today === number ? tr(" · Hoje") : ""}
            </span>
            <b>{trip.start ? dayLabel(trip, number).short : tr("Sem data")}</b>
          </button>
        ))}
      </nav>
      <div className="tm-actions">
        <small>{tr("Dia atual pelo fuso")}{" "}{trip.timeZone || tr("do aparelho")}.</small>
        {today && today !== day && (
          <button className="secondary" onClick={() => onDayChange(today)}>{tr("Ir para hoje · Dia")}{" "}{today}
          </button>
        )}
      </div>
      <div className="tm-day-heading">
        <div>
          <h2>{label.full}</h2>
          {!trip.start && <p>{tr("Sem datas definidas. Escolha o dia acima.")}</p>}
        </div>
        {progress.total > 0 && (
          <span>
            {progress.done}/{progress.total} visitadas
          </span>
        )}
      </div>
      {progress.total > 0 && (
        <progress
          className="tm-progress"
          value={progress.done}
          max={progress.total}
          aria-label={tr("Progresso das atividades do dia")}
        />
      )}
      <label className="tm-transport">
        {tr("Como você vai?")}
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as Transport)}
        >
          {Object.entries(transportLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {next ? (
        <aside className="tm-next">
          <span className="tm-next-icon">
            <Navigation size={22} />
          </span>
          <div>
            <small>{tr("A SEGUIR NO ROTEIRO")}</small>
            <h3>{next.title}</h3>
            <p>
              {next.time || tr("Sem horário definido")}
              {next.kind ? " · " + next.kind : ""}
            </p>
          </div>
          <a href={"#tm-activity-" + next.id} aria-label={tr("Ver ") + next.title}>
            <ArrowRight size={22} />
          </a>
        </aside>
      ) : progress.total > 0 ? (
        <div className="tm-complete" role="status">
          <CheckCheck size={24} />
          <div>
            <h3>{tr("Um dia cheio de caminhos percorridos.")}</h3>
            <p>{tr("Todas as atividades estão marcadas como visitadas.")}</p>
          </div>
        </div>
      ) : null}
      {activities.length === 0 ? (
        <div className="tm-empty">
          <img
            className="tm-empty-photo"
            src={decor.lake}
            alt=""
            aria-hidden="true"
            loading="lazy"
            onError={hideOnError}
          />
          <h3>{tr("Um dia aberto a possibilidades")}</h3>
          <p>{tr("Não há atividades neste dia. Você pode escolher outro dia ou voltar ao planejamento para adicionar um lugar.")}</p>
          <button className="secondary" onClick={onBack}>
            <ArrowLeft size={17} />
            {tr("Voltar ao planejamento")}
          </button>
        </div>
      ) : (
        <ol className="tm-timeline" aria-label={tr("Programação do dia")}>
          {activities.map((activity, index) => (
            <li
              id={"tm-activity-" + activity.id}
              key={activity.id}
              className={activity.done ? "is-visited" : ""}
            >
              <span className="tm-stop" aria-hidden="true">
                {activity.done ? <Check size={15} /> : index + 1}
              </span>
              <article className="tm-activity">
                <div className="tm-activity-meta">
                  <span>
                    {activity.time ? (
                      <time>{activity.time}</time>
                    ) : (
                      tr("Sem horário")
                    )}
                  </span>
                  {activity.kind && <span>{tr(activity.kind)}</span>}
                  {activity.done && (
                    <span className="tm-visited">{tr("Visitada")}</span>
                  )}
                </div>
                <h3>{activity.title || tr("Atividade")}</h3>
                {activity.address?.trim() && (
                  <p className="tm-address">
                    <MapPin size={15} />
                    {activity.address}
                  </p>
                )}
                <div className="tm-actions">
                  {directions(activity)}
                  <button
                    className={activity.done ? "secondary" : "primary"}
                    disabled={saving}
                    aria-pressed={activity.done}
                    aria-label={
                      activity.done
                        ? `Desmarcar visita: ${activity.title}`
                        : `Marcar como visitado: ${activity.title}`
                    }
                    onClick={() =>
                      update(
                        toggleVisited(trip, activity.id),
                        activity.done
                          ? tr("Visita desmarcada.")
                          : tr("Visita salva no seu roteiro."),
                      )
                    }
                  >
                    <Check size={17} />
                    {activity.done ? tr("Visitado") : tr("Marcar visita")}
                  </button>
                </div>
                <details className="tm-activity-details">
                  <summary>
                    {tr("Ver detalhes")}
                    <ChevronDown size={15} />
                  </summary>
                  <dl>
                    <dt>{tr("Atividade")}</dt>
                    <dd>{activity.title || tr("Atividade")}</dd>
                    {activity.kind && (
                      <>
                        <dt>{tr("Categoria")}</dt>
                        <dd>{tr(activity.kind)}</dd>
                      </>
                    )}
                    {activity.time && (
                      <>
                        <dt>{tr("Horário informado")}</dt>
                        <dd>{activity.time}</dd>
                      </>
                    )}
                    {activity.address?.trim() && (
                      <>
                        <dt>{tr("Endereço")}</dt>
                        <dd>
                          {activity.address}
                          <button
                            className="tm-copy"
                            onClick={() => copy(activity.address)}
                          >
                            <Copy size={15} />
                            {tr("Copiar endereço")}
                          </button>
                        </dd>
                      </>
                    )}
                    <dt>{tr("Status")}</dt>
                    <dd>
                      {activity.done
                        ? tr("Visitada")
                        : tr("Ainda não visitada")}
                    </dd>
                  </dl>
                  {!activity.address?.trim() && (
                    <p className="tm-help">{tr("Esta atividade ainda não tem endereço para navegação.")}</p>
                  )}
                </details>
              </article>
            </li>
          ))}
        </ol>
      )}
      <TravelNearby trip={trip} online={online} transport={transport} />
      {hasTravelInformation(trip) && (
        <details className="tm-information">
          <summary>
            <span>
              {tr("Informações da viagem")}
              <small>{tr("O essencial, sempre à mão")}</small>
            </span>
            <ChevronDown size={21} />
          </summary>
          <div className="tm-information-content">
            {Boolean(trip.stays?.length) && (
              <section>
                <h3>
                  {selectedStays.length
                    ? tr("Hospedagens deste dia")
                    : tr("Hospedagens cadastradas")}
                </h3>
                {!selectedStays.length && (
                  <p className="tm-help">{tr("Nenhuma estadia confirmada para este dia pelas datas cadastradas.")}</p>
                )}
                {(selectedStays.length ? selectedStays : trip.stays || []).map(
                  (s) => (
                    <article className="tm-reservation" key={s.id}>
                      <h4>{s.name}</h4>
                      <p>{[s.address, s.city].filter(Boolean).join(", ")}</p>
                      <p>
                        {s.start || tr("Sem data")} → {s.end || tr("Sem data")}
                      </p>
                      {s.confirmation && (
                        <details>
                          <summary>{tr("Código de confirmação")}</summary>
                          <p>{s.confirmation}</p>
                        </details>
                      )}
                      {stayDirections(s) &&
                        externalLink(stayDirections(s)!, "Como chegar")}
                    </article>
                  ),
                )}
              </section>
            )}
            {trip.hotel?.trim() && (
              <section>
                <h3>{tr("Hospedagem")}</h3>
                <p className="pre-wrap">{trip.hotel}</p>
                <button className="tm-copy" onClick={() => copy(trip.hotel)}>
                  <Copy size={16} />
                  {tr("Copiar hospedagem")}
                </button>
              </section>
            )}
            {trip.notes?.trim() && (
              <section>
                <h3>{tr("Anotações importantes")}</h3>
                <p className="pre-wrap">{trip.notes}</p>
              </section>
            )}
            {Boolean(trip.reservations?.length) && (
              <section>
                <h3>{tr("Reservas da viagem")}</h3>
                <p className="tm-help">
                  {trip.reservations.some((r) => r.activityId || r.stayId)
                    ? tr("Vínculos definidos por você no planejamento.")
                    : tr("Reservas gerais, sem vínculo automático com as atividades.")}
                </p>
                {trip.reservations.map((reservation) => (
                  <article className="tm-reservation" key={reservation.id}>
                    <h4>{reservation.title || tr("Reserva")}</h4>
                    {reservation.activityId && (
                      <p>{tr("Atividade:")}{" "}
                        {trip.activities.find(
                          (a) => a.id === reservation.activityId,
                        )?.title || tr("Não disponível")}
                      </p>
                    )}
                    {reservation.stayId && (
                      <p>{tr("Hospedagem:")}{" "}
                        {trip.stays?.find((s) => s.id === reservation.stayId)
                          ?.name || tr("Não disponível")}
                      </p>
                    )}
                    {reservation.details && (
                      <p className="pre-wrap">{reservation.details}</p>
                    )}
                    {safeExternalUrl(reservation.url) &&
                      externalLink(
                        safeExternalUrl(reservation.url)!,
                        "Abrir reserva",
                      )}
                  </article>
                ))}
              </section>
            )}
            {Boolean(trip.checklist?.length) && (
              <section>
                <h3>{tr("Checklist")}</h3>
                {trip.checklist.map((item) => (
                  <label className="tm-checklist" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={saving}
                      onChange={() =>
                        update(
                          {
                            ...trip,
                            checklist: trip.checklist.map((x) =>
                              x.id === item.id ? { ...x, done: !x.done } : x,
                            ),
                          },
                          tr("Checklist atualizado."),
                        )
                      }
                    />
                    <span className={item.done ? "struck" : ""}>
                      {item.title}
                    </span>
                  </label>
                ))}
              </section>
            )}
          </div>
        </details>
      )}
      <p className="tm-footnote">{tr("A sequência é a do seu planejamento. Horários são os cadastrados, sem conversão de fuso.")}</p>
      <div className="tm-feedback" role="status" aria-live="polite">
        {tr(feedback)}
      </div>
      <footer className="tm-bottom">
        <button onClick={onBack}>
          <ArrowLeft size={18} />
          {tr("Voltar ao planejamento")}
        </button>
        <span>
          {progress.total
            ? `${progress.done} de ${progress.total} visitadas`
            : tr("No seu ritmo")}
        </span>
      </footer>
    </section>
  );
}
