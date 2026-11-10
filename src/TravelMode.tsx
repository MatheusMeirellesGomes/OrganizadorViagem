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
import { staysOnDate, stayDirections } from "./stays";
import { calendarDate } from "./travel-mode";
import type { Activity, Trip } from "./model";
import {
  dayActivities,
  dayLabel,
  dayProgress,
  hasTravelInformation,
  navigationUrl,
  nextActivity,
  safeExternalUrl,
  toggleVisited,
  travelDays,
} from "./travel-mode";
import "./travel-mode.css";
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
        setFeedback("Não foi possível salvar. Sua marcação não foi alterada.");
    } catch {
      setFeedback("Não foi possível salvar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("Informação copiada.");
    } catch {
      setFeedback(
        "Não foi possível copiar automaticamente. Selecione o texto para copiar.",
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
        {text}: precisa de internet
      </span>
    );
  }
  function directions(activity: Activity) {
    const url = navigationUrl(activity);
    return url ? externalLink(url, "Como chegar") : null;
  }
  return (
    <section className="travel-mode" aria-labelledby="travel-mode-title">
      <header className="tm-header">
        <button className="tm-back" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Planejamento</span>
        </button>
        <span className="tm-badge">
          <Compass size={15} />
          Modo Viagem
        </span>
      </header>
      <div className="tm-title">
        <p className="eyebrow">UM DIA DE CADA VEZ</p>
        <h1 id="travel-mode-title" ref={heading} tabIndex={-1}>
          {trip.title || "Sua viagem"}
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
          <WifiOff size={16} />
          Sem conexão · Seus dados locais continuam disponíveis. Mapas e links
          precisam de internet.
        </p>
      )}
      <nav ref={daysRef} className="tm-days" aria-label="Dias da viagem">
        {travelDays(trip, day).map((number) => (
          <button
            key={number}
            aria-pressed={day === number}
            aria-label={`Dia ${number}: ${dayLabel(trip, number).full}`}
            onClick={() => onDayChange(number)}
          >
            <span>Dia {number}</span>
            <b>{trip.start ? dayLabel(trip, number).short : "Sem data"}</b>
          </button>
        ))}
      </nav>
      <div className="tm-day-heading">
        <div>
          <h2>{label.full}</h2>
          {!trip.start && <p>Sem datas definidas. Escolha o dia acima.</p>}
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
          aria-label="Progresso das atividades do dia"
        />
      )}
      {next ? (
        <aside className="tm-next">
          <span className="tm-next-icon">
            <Navigation size={22} />
          </span>
          <div>
            <small>A SEGUIR NO ROTEIRO</small>
            <h3>{next.title}</h3>
            <p>
              {next.time || "Sem horário definido"}
              {next.kind ? " · " + next.kind : ""}
            </p>
          </div>
          <a href={"#tm-activity-" + next.id} aria-label={"Ver " + next.title}>
            <ArrowRight size={22} />
          </a>
        </aside>
      ) : progress.total > 0 ? (
        <div className="tm-complete" role="status">
          <CheckCheck size={24} />
          <div>
            <h3>Um dia cheio de caminhos percorridos.</h3>
            <p>Todas as atividades estão marcadas como visitadas.</p>
          </div>
        </div>
      ) : null}
      {activities.length === 0 ? (
        <div className="tm-empty">
          <Compass size={34} strokeWidth={1.4} />
          <h3>Um dia aberto a possibilidades</h3>
          <p>
            Não há atividades neste dia. Você pode escolher outro dia ou voltar
            ao planejamento para adicionar um lugar.
          </p>
          <button className="secondary" onClick={onBack}>
            <ArrowLeft size={17} />
            Voltar ao planejamento
          </button>
        </div>
      ) : (
        <ol className="tm-timeline" aria-label="Programação do dia">
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
                      "Sem horário"
                    )}
                  </span>
                  {activity.kind && <span>{activity.kind}</span>}
                  {activity.done && (
                    <span className="tm-visited">Visitada</span>
                  )}
                </div>
                <h3>{activity.title || "Atividade"}</h3>
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
                          ? "Visita desmarcada."
                          : "Visita salva no seu roteiro.",
                      )
                    }
                  >
                    <Check size={17} />
                    {activity.done ? "Visitado" : "Marcar visita"}
                  </button>
                </div>
                <details className="tm-activity-details">
                  <summary>
                    Ver detalhes
                    <ChevronDown size={15} />
                  </summary>
                  <dl>
                    <dt>Atividade</dt>
                    <dd>{activity.title || "Atividade"}</dd>
                    {activity.kind && (
                      <>
                        <dt>Categoria</dt>
                        <dd>{activity.kind}</dd>
                      </>
                    )}
                    {activity.time && (
                      <>
                        <dt>Horário informado</dt>
                        <dd>{activity.time}</dd>
                      </>
                    )}
                    {activity.address?.trim() && (
                      <>
                        <dt>Endereço</dt>
                        <dd>
                          {activity.address}
                          <button
                            className="tm-copy"
                            onClick={() => copy(activity.address)}
                          >
                            <Copy size={15} />
                            Copiar endereço
                          </button>
                        </dd>
                      </>
                    )}
                    <dt>Status</dt>
                    <dd>{activity.done ? "Visitada" : "Ainda não visitada"}</dd>
                  </dl>
                  {!activity.address?.trim() && (
                    <p className="tm-help">
                      Esta atividade ainda não tem endereço para navegação.
                    </p>
                  )}
                </details>
              </article>
            </li>
          ))}
        </ol>
      )}
      {hasTravelInformation(trip) && (
        <details className="tm-information">
          <summary>
            <span>
              Informações da viagem<small>O essencial, sempre à mão</small>
            </span>
            <ChevronDown size={21} />
          </summary>
          <div className="tm-information-content">
            {Boolean(trip.stays?.length) && (
              <section>
                <h3>
                  {selectedStays.length
                    ? "Hospedagens deste dia"
                    : "Hospedagens cadastradas"}
                </h3>
                {!selectedStays.length && (
                  <p className="tm-help">
                    Nenhuma estadia confirmada para este dia pelas datas
                    cadastradas.
                  </p>
                )}
                {(selectedStays.length ? selectedStays : trip.stays || []).map(
                  (s) => (
                    <article className="tm-reservation" key={s.id}>
                      <h4>{s.name}</h4>
                      <p>{[s.address, s.city].filter(Boolean).join(", ")}</p>
                      <p>
                        {s.start || "Sem data"} → {s.end || "Sem data"}
                      </p>
                      {s.confirmation && (
                        <details>
                          <summary>Código de confirmação</summary>
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
                <h3>Hospedagem</h3>
                <p className="pre-wrap">{trip.hotel}</p>
                <button className="tm-copy" onClick={() => copy(trip.hotel)}>
                  <Copy size={16} />
                  Copiar hospedagem
                </button>
              </section>
            )}
            {trip.notes?.trim() && (
              <section>
                <h3>Anotações importantes</h3>
                <p className="pre-wrap">{trip.notes}</p>
              </section>
            )}
            {Boolean(trip.reservations?.length) && (
              <section>
                <h3>Reservas da viagem</h3>
                <p className="tm-help">
                  {trip.reservations.some(r=>r.activityId||r.stayId)?"Vínculos definidos por você no planejamento.":"Reservas gerais, sem vínculo automático com as atividades."}
                </p>
                {trip.reservations.map((reservation) => (
                  <article className="tm-reservation" key={reservation.id}>
                    <h4>{reservation.title || "Reserva"}</h4>
                    {reservation.activityId && (
                      <p>
                        Atividade:{" "}
                        {trip.activities.find(
                          (a) => a.id === reservation.activityId,
                        )?.title || "Não disponível"}
                      </p>
                    )}
                    {reservation.stayId && (
                      <p>
                        Hospedagem:{" "}
                        {trip.stays?.find((s) => s.id === reservation.stayId)
                          ?.name || "Não disponível"}
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
                <h3>Checklist</h3>
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
                          "Checklist atualizado.",
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
      <p className="tm-footnote">
        A sequência é a do seu planejamento. Horários são os cadastrados, sem
        conversão de fuso.
      </p>
      <div className="tm-feedback" role="status" aria-live="polite">
        {feedback}
      </div>
      <footer className="tm-bottom">
        <button onClick={onBack}>
          <ArrowLeft size={18} />
          Voltar ao planejamento
        </button>
        <span>
          {progress.total
            ? `${progress.done} de ${progress.total} visitadas`
            : "No seu ritmo"}
        </span>
      </footer>
    </section>
  );
}
