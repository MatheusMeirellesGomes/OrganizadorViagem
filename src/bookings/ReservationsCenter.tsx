import { useMemo, useState } from "react";
import { ArrowRight, BedDouble, CalendarClock, CalendarPlus, Car, CircleAlert, FileText, Info, Plane, ShieldCheck, Ticket, TriangleAlert, Utensils } from "lucide-react";
import type { Trip } from "../model";
import { formatMoney, t as tr, tf, getLocale } from "../i18n";
import { walletCategories, type WalletCategory } from "../journey/wallet";
import { bookingStatuses, cancelSoon, centralItems, filterCentral, moneySummary, nextBooking, setBooking, type BookingStatus, type CentralFilter, type CentralItem } from "./central";
import { tripAlerts, type TripAlert } from "./alerts";
import { downloadIcs } from "./ics";
import "./bookings.css";

/*
 * Central de Reservas: tudo o que já está cadastrado nas viagens (voos,
 * hospedagens, carros, ingressos e restaurantes), num lugar só. A situação e o
 * prazo de cancelamento são marcados aqui; o resto se edita na própria viagem.
 */

const icons: Record<WalletCategory, typeof Plane> = {
  tickets: Plane,
  hotels: BedDouble,
  rentals: Car,
  entries: Ticket,
  restaurants: Utensils,
  insurance: ShieldCheck,
  receipts: FileText,
  other: FileText,
};
const tabOf: Record<CentralItem["source"], string> = { transport: "Transportes", stay: "Hospedagens", vehicle: "Transportes", reservation: "Reservas", document: "Carteira" };

function when(i: CentralItem) {
  if (!i.date) return tr("Sem data");
  const d = new Date(i.date + "T12:00:00Z").toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return i.time ? `${d} · ${i.time}` : d;
}
function countdown(at: number, now: number) {
  const h = Math.round((at - now) / 3600000);
  if (h < 1) return tr("em menos de 1 hora");
  if (h < 48) return tf("em {n} h", { n: h });
  return tf("em {n} dias", { n: Math.round(h / 24) });
}

export function ReservationsCenter({ trips, onSave, onOpen, busy }: { trips: Trip[]; onSave: (t: Trip) => Promise<boolean | void> | void; onOpen: (t: Trip, tab: string) => void; busy?: boolean }) {
  const [filter, setFilter] = useState<CentralFilter>({ when: "upcoming" });
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const items = useMemo(() => centralItems(trips), [trips]);
  const shown = filterCentral(items, filter, now);
  const next = nextBooking(items, now);
  const deadlines = cancelSoon(items, today);
  const money = moneySummary(filterCentral(items, { tripId: filter.tripId }));
  const alerts = useMemo(
    () => trips.filter((t) => t.status !== "past").flatMap((t) => tripAlerts(t, items, now).map((a) => ({ ...a, trip: t }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trips, items],
  );
  const counts = Object.keys(bookingStatuses).map((k) => [k, items.filter((i) => i.status === k).length] as const);
  const usedCategories = [...new Set(items.map((i) => i.category))];

  const mark = (i: CentralItem, patch: { status?: BookingStatus | ""; cancelBy?: string }) => {
    const current = i.trip.bookings?.[i.id] ?? {};
    const status = patch.status === undefined ? current.status : patch.status || undefined;
    const cancelBy = patch.cancelBy === undefined ? current.cancelBy : patch.cancelBy || undefined;
    void onSave(setBooking(i.trip, i.id, { ...current, status, cancelBy }));
  };

  if (!items.length)
    return (
      <section className="panel bookings-empty">
        <CalendarClock size={34} aria-hidden="true" />
        <h2>{tr("Nenhuma reserva ainda")}</h2>
        <p>{tr("Quando você cadastrar voos, hospedagens, carros ou reservas numa viagem, eles aparecem aqui, com situação, prazos e valores.")}</p>
      </section>
    );

  return (
    <div className="bookings-page">
      <section className="bookings-top">
        {next ? (
          <article className="booking-next">
            <span className="booking-next-label">{tr("Próxima reserva")}</span>
            <h2>{next.title}</h2>
            <p>
              {when(next)} · <b>{countdown(next.at!, now)}</b>
            </p>
            {next.legs?.length ? <Boarding legs={next.legs} /> : <p className="booking-detail">{next.detail}</p>}
            <button type="button" className="secondary" onClick={() => onOpen(next.trip, tabOf[next.source])}>
              {tf("Abrir em {trip}", { trip: next.trip.title })} <ArrowRight size={15} />
            </button>
          </article>
        ) : (
          <article className="booking-next muted">
            <span className="booking-next-label">{tr("Próxima reserva")}</span>
            <p>{tr("Nada com data marcada pela frente.")}</p>
          </article>
        )}
        <div className="booking-stats">
          <div className="booking-counts" aria-label={tr("Reservas por situação")}>
            {counts.map(([k, n]) => (
              <button key={k} type="button" className={"booking-count st-" + k + (filter.status === k ? " on" : "")} aria-pressed={filter.status === k} onClick={() => setFilter({ ...filter, status: filter.status === k ? "" : (k as BookingStatus), when: "all" })}>
                <b>{n}</b>
                <span>{tr(bookingStatuses[k as BookingStatus])}</span>
              </button>
            ))}
          </div>
          <div className="booking-money">
            <h3>{tr("Valores ligados às reservas")}</h3>
            {money.length ? (
              money.map((m) => (
                <dl key={m.currency}>
                  <div>
                    <dt>{tr("Previsto")}</dt>
                    <dd>{formatMoney(m.planned, m.currency)}</dd>
                  </div>
                  <div>
                    <dt>{tr("Pago")}</dt>
                    <dd>{formatMoney(m.paid, m.currency)}</dd>
                  </div>
                  <div>
                    <dt>{tr("Falta pagar")}</dt>
                    <dd>{formatMoney(m.pending, m.currency)}</dd>
                  </div>
                </dl>
              ))
            ) : (
              <p>{tr("Ligue despesas às reservas na aba Despesas da viagem para ver os valores aqui.")}</p>
            )}
            <small>{tr("Opções em pesquisa e reservas canceladas não entram na conta.")}</small>
          </div>
        </div>
      </section>

      {(alerts.length > 0 || deadlines.length > 0) && (
        <section className="panel booking-alerts" aria-labelledby="alerts-title">
          <h2 id="alerts-title">{tr("Pontos de atenção")}</h2>
          <ul>
            {alerts.slice(0, 12).map((a) => (
              <AlertRow key={a.trip.id + a.id} a={a} trip={a.trip} items={items} onOpen={onOpen} />
            ))}
            {deadlines
              .filter((d) => !alerts.some((a) => a.id === "cancel:" + d.id))
              .map((d) => (
                <li key={"dl" + d.id} className="lv-info">
                  <CalendarClock size={18} aria-hidden="true" />
                  <div>
                    <b>{tr("Cancelamento gratuito até")} {new Date(d.cancelBy + "T12:00:00Z").toLocaleDateString(getLocale(), { day: "numeric", month: "short", timeZone: "UTC" })}</b>
                    <span>
                      {d.title} · {d.trip.title}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="panel booking-list-panel" aria-labelledby="list-title">
        <div className="booking-list-head">
          <h2 id="list-title">{tr("Todas as reservas")}</h2>
          <div className="booking-filters">
            <label>
              <span>{tr("Viagem")}</span>
              <select value={filter.tripId ?? ""} onChange={(e) => setFilter({ ...filter, tripId: e.target.value || undefined })}>
                <option value="">{tr("Todas")}</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{tr("Situação")}</span>
              <select value={filter.status ?? ""} onChange={(e) => setFilter({ ...filter, status: e.target.value as CentralFilter["status"] })}>
                <option value="">{tr("Todas")}</option>
                <option value="none">{tr("Sem situação")}</option>
                {Object.entries(bookingStatuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {tr(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{tr("Quando")}</span>
              <select value={filter.when ?? "all"} onChange={(e) => setFilter({ ...filter, when: e.target.value as CentralFilter["when"] })}>
                <option value="upcoming">{tr("Próximas")}</option>
                <option value="past">{tr("Passadas")}</option>
                <option value="all">{tr("Todas")}</option>
              </select>
            </label>
          </div>
        </div>
        {usedCategories.length > 1 && (
          <div className="booking-chips" role="group" aria-label={tr("Tipo")}>
            <button type="button" aria-pressed={!filter.category} className={!filter.category ? "on" : ""} onClick={() => setFilter({ ...filter, category: "" })}>
              {tr("Tudo")}
            </button>
            {usedCategories.map((c) => {
              const Icon = icons[c];
              return (
                <button key={c} type="button" aria-pressed={filter.category === c} className={filter.category === c ? "on" : ""} onClick={() => setFilter({ ...filter, category: filter.category === c ? "" : c })}>
                  <Icon size={15} aria-hidden="true" /> {tr(walletCategories[c])}
                </button>
              );
            })}
          </div>
        )}
        {shown.length ? (
          <ul className="booking-list">
            {shown.map((i) => (
              <BookingCard key={i.trip.id + i.id} i={i} busy={busy} onMark={(p) => mark(i, p)} onOpen={() => onOpen(i.trip, tabOf[i.source])} />
            ))}
          </ul>
        ) : (
          <p className="booking-none">{tr("Nenhuma reserva com esses filtros.")}</p>
        )}
      </section>

      <section className="panel booking-ics">
        <div>
          <h2>{tr("Levar para o seu calendário")}</h2>
          <p>{tr("Baixe um arquivo .ics com voos, hospedagens, carros e atividades com horário. Funciona no Google Agenda, no Calendário da Apple e no Outlook. Códigos de reserva não vão no arquivo.")}</p>
        </div>
        <div className="booking-ics-list">
          {trips
            .filter((t) => t.status !== "past")
            .map((t) => (
              <button key={t.id} type="button" className="secondary" onClick={() => downloadIcs(t)}>
                <CalendarPlus size={16} aria-hidden="true" /> {t.title}
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}

function AlertRow({ a, trip, items, onOpen }: { a: TripAlert; trip: Trip; items: CentralItem[]; onOpen: (t: Trip, tab: string) => void }) {
  const Icon = a.level === "danger" ? CircleAlert : a.level === "warning" ? TriangleAlert : Info;
  const ref = items.find((i) => i.trip.id === trip.id && a.refs.includes(i.id));
  // Datas aparecem no formato do idioma (ex.: 27 de nov.).
  const values = Object.fromEntries(
    Object.entries(a.values).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (d) => new Date(d + "T12:00:00Z").toLocaleDateString(getLocale(), { day: "numeric", month: "short", timeZone: "UTC" })) : v]),
  );
  return (
    <li className={"lv-" + a.level}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <b>{tf(a.title, values)}</b>
        <span>{tf(a.detail, values)}</span>
        <small>{trip.title}</small>
      </div>
      <button type="button" className="text-button" onClick={() => onOpen(trip, ref ? tabOf[ref.source] : a.id === "gaps" || a.id.startsWith("stays") ? "Hospedagens" : "Roteiro")}>
        {tr("Conferir")}
      </button>
    </li>
  );
}

function Boarding({ legs }: { legs: NonNullable<CentralItem["legs"]> }) {
  return (
    <ol className="boarding">
      {legs.map((l, n) => (
        <li key={n}>
          <div>
            <b>{l.from}</b>
            <small>{l.depart.slice(11) || l.depart}</small>
          </div>
          <span className="boarding-line" aria-hidden="true">
            <Plane size={14} />
          </span>
          <div>
            <b>{l.to}</b>
            <small>{l.arrive.slice(11) || l.arrive}</small>
          </div>
          {(l.carrier || l.number) && <em>{[l.carrier, l.number].filter(Boolean).join(" ")}</em>}
        </li>
      ))}
    </ol>
  );
}

function BookingCard({ i, onMark, onOpen, busy }: { i: CentralItem; onMark: (p: { status?: BookingStatus | ""; cancelBy?: string }) => void; onOpen: () => void; busy?: boolean }) {
  const Icon = icons[i.category];
  const id = "bk-" + i.trip.id + i.id.replace(":", "-");
  return (
    <li className={"booking-card" + (i.status ? " st-" + i.status : "")}>
      <span className={"booking-ico cat-" + i.category} aria-hidden="true">
        <Icon size={19} />
      </span>
      <div className="booking-main">
        <div className="booking-title">
          <h3>{i.title}</h3>
          {i.status && <span className={"booking-pill st-" + i.status}>{tr(bookingStatuses[i.status])}</span>}
        </div>
        <p className="booking-when">
          {when(i)} · {i.trip.title}
        </p>
        {i.legs?.length ? <Boarding legs={i.legs} /> : i.detail && <p className="booking-detail">{i.detail}</p>}
        <div className="booking-edit">
          <label htmlFor={id + "-st"}>
            <span>{tr("Situação")}</span>
            <select id={id + "-st"} disabled={busy} value={i.status ?? ""} onChange={(e) => onMark({ status: e.target.value as BookingStatus | "" })}>
              <option value="">{tr("Sem situação")}</option>
              {Object.entries(bookingStatuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {tr(v)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id + "-cx"}>
            <span>{tr("Cancelar grátis até")}</span>
            <input id={id + "-cx"} type="date" disabled={busy} value={i.cancelBy ?? ""} onChange={(e) => onMark({ cancelBy: e.target.value })} />
          </label>
          <button type="button" className="secondary" onClick={onOpen}>
            {tr("Abrir na viagem")} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </li>
  );
}
