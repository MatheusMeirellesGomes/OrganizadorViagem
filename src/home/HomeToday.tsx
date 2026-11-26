import { ArrowRight, BedDouble, CalendarCheck, Car, Clock, Compass, MapPin, Navigation, Plane, Ticket, TriangleAlert } from "lucide-react";
import type { Trip } from "../model";
import { getLocale, t as tr, tf } from "../i18n";
import { centralItems, nextBooking } from "../bookings/central";
import { tripAlerts } from "../bookings/alerts";
import type { SearchKind } from "../search/links";
import { featuredTrip, nextActivity, tripMoment } from "./today";
import "./home-today.css";

/*
 * Topo da Visão geral para quem já tem viagens: a viagem em destaque com o
 * que vem a seguir, o Modo Viajante e atalhos para planejar.
 */

const short = (iso?: string) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");

export function HomeToday({
  trips,
  cover,
  onOpenTrip,
  onTraveler,
  onSearch,
  onGo,
}: {
  trips: Trip[];
  cover: (t: Trip) => string;
  onOpenTrip: (t: Trip, tab?: string) => void;
  onTraveler: () => void;
  onSearch: (k: SearchKind) => void;
  onGo: (p: "bookings" | "explore") => void;
}) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5);
  const trip = featuredTrip(trips, today);
  const items = trip ? centralItems([trip]) : [];
  const booking = trip ? nextBooking(items) : undefined;
  const activity = trip ? nextActivity(trip, today, hhmm) : undefined;
  const moment = trip ? tripMoment(trip, today) : undefined;
  const alerts = trip ? tripAlerts(trip, items).filter((a) => a.level !== "info").length : 0;

  const shortcuts: { k: SearchKind; label: string; icon: typeof Plane }[] = [
    { k: "flights", label: "Voos", icon: Plane },
    { k: "hotels", label: "Hotéis", icon: BedDouble },
    { k: "cars", label: "Carros", icon: Car },
    { k: "experiences", label: "Passeios", icon: Ticket },
  ];

  return (
    <div className="home-today">
      {trip && moment && (
        <article className="today-trip">
          <div className="today-photo" style={{ backgroundImage: `url(${cover(trip)})` }} aria-hidden="true" />
          <div className="today-body">
            <span className="today-label">{moment.kind === "during" ? tr("Viagem em andamento") : tr("Próxima viagem")}</span>
            <h2>{trip.title}</h2>
            <p className="today-where">
              <MapPin size={14} aria-hidden="true" /> {trip.destination || tr("Destino em aberto")}
            </p>
            <p className="today-count">
              {moment.kind === "before"
                ? moment.days === 0
                  ? tr("Começa hoje!")
                  : moment.days === 1
                    ? tr("Começa amanhã")
                    : tf("Faltam {n} dias", { n: moment.days })
                : moment.kind === "during"
                  ? moment.total
                    ? tf("Dia {day} de {total}", { day: moment.day, total: moment.total })
                    : tf("Dia {day}", { day: moment.day })
                  : tr("Ainda sem data")}
            </p>
            <ul className="today-next">
              <li>
                <Clock size={16} aria-hidden="true" />
                <span>
                  <small>{tr("Próxima atividade")}</small>
                  {activity ? (
                    <b>
                      {activity.title}
                      {activity.date ? ` · ${short(activity.date)}` : ""}
                      {/^\d{2}:\d{2}$/.test(activity.time) ? ` · ${activity.time}` : ""}
                    </b>
                  ) : (
                    <b className="muted">{tr("Nada no roteiro ainda")}</b>
                  )}
                </span>
              </li>
              <li>
                <CalendarCheck size={16} aria-hidden="true" />
                <span>
                  <small>{tr("Próxima reserva")}</small>
                  {booking ? (
                    <b>
                      {booking.title} · {short(booking.date)}
                      {booking.time ? ` · ${booking.time}` : ""}
                    </b>
                  ) : (
                    <b className="muted">{tr("Nenhuma reserva com data")}</b>
                  )}
                </span>
              </li>
            </ul>
            <div className="today-actions">
              <button type="button" className="primary" onClick={() => onOpenTrip(trip)}>
                {tr("Abrir viagem")} <ArrowRight size={16} />
              </button>
              {alerts > 0 && (
                <button type="button" className="today-alert" onClick={() => onGo("bookings")}>
                  <TriangleAlert size={15} aria-hidden="true" /> {alerts === 1 ? tr("1 ponto de atenção") : tf("{n} pontos de atenção", { n: alerts })}
                </button>
              )}
            </div>
          </div>
        </article>
      )}
      <div className="today-side">
        <button type="button" className="today-traveler" data-tour="modo-viajante" onClick={onTraveler}>
          <span className="today-traveler-ico" aria-hidden="true">
            <Navigation size={22} />
          </span>
          <span>
            <b>{tr("Ativar Modo Viajante")}</b>
            <small>{tr("O que tem perto de você, o que fazer agora e como chegar.")}</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <section className="today-plan" aria-labelledby="today-plan-title">
          <h2 id="today-plan-title">{tr("Planejar")}</h2>
          <div className="today-shortcuts" data-tour="nav-search">
            {shortcuts.map(({ k, label, icon: Icon }) => (
              <button key={k} type="button" className={"k-" + k} onClick={() => onSearch(k)}>
                <span aria-hidden="true">
                  <Icon size={19} />
                </span>
                {tr(label)}
              </button>
            ))}
          </div>
          <div className="today-links">
            <button type="button" data-tour="nav-bookings" onClick={() => onGo("bookings")}>
              <CalendarCheck size={17} aria-hidden="true" /> {tr("Central de Reservas")} <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onGo("explore")}>
              <Compass size={17} aria-hidden="true" /> {tr("Explorar lugares")} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
