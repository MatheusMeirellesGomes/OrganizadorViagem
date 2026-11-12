import { useMemo, useState } from "react";
import { BedDouble, Bus, Car, ExternalLink, MapPin, Pencil, Plane, Ship, Train, Trash2, TramFront, CarTaxiFront, Route } from "lucide-react";
import { t as tr, tf, formatMoney, formatNumber, getLocale } from "../i18n";
import type { Trip } from "../model";
import { linkedCosts } from "./costs";
import { SecretView } from "./SecretField";
import type { SecretStore } from "./secrets";
import { journeyTimeline, legMinutes, removeTransport, routeLabel, sortedTransports, transportTitle, undatedTransports, type TimelineItem } from "./transport";
import { durationText, zoneLabel } from "./time";
import { checkInStatuses, roadKinds, transportKinds, type Transport, type TransportKind } from "./types";
import { TransportForm } from "./TransportForm";
import { VehiclePanel } from "./VehiclePanel";
import { vehicleName } from "./vehicles";
import { drivingLinks } from "./routing";
import { statusLabels } from "../budget";

export const kindIcon: Record<TransportKind, typeof Plane> = {
  flight: Plane,
  own_car: Car,
  rental_car: Car,
  train: Train,
  bus: Bus,
  ferry: Ship,
  transit: TramFront,
  taxi: CarTaxiFront,
  other: Route,
};

const longDate = (d: string) => {
  const s = new Date(d + "T12:00:00").toLocaleDateString(getLocale(), { weekday: "short", day: "2-digit", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === "checkin" || item.kind === "checkout")
    return (
      <li className="tl-item tl-stay">
        <span className="tl-icon">
          <BedDouble size={15} />
        </span>
        <span className="tl-time">{item.time}</span>
        <span>
          {item.kind === "checkin" ? tf("Check-in em {name}", { name: item.stay.name }) : tf("Check-out de {name}", { name: item.stay.name })}
          {item.stay.city && <small> · {item.stay.city}</small>}
        </span>
      </li>
    );
  if (item.kind === "activities")
    return (
      <li className="tl-item tl-activities">
        <span className="tl-icon">
          <MapPin size={15} />
        </span>
        <span className="tl-time">{item.time}</span>
        <span>
          {item.count === 1 ? item.first.title : tf("{title} e mais {count} atividades", { title: item.first.title, count: item.count - 1 })}
          <small> · {tf("Dia {number}", { number: item.day })}</small>
        </span>
      </li>
    );
  const Icon = kindIcon[item.transport.kind];
  const l = item.leg;
  return (
    <li className={"tl-item tl-move tl-" + item.transport.kind}>
      <span className="tl-icon">
        <Icon size={15} />
      </span>
      <span className="tl-time">{item.kind === "depart" ? l.departTime : l.arriveTime}</span>
      <span>
        {item.kind === "depart" ? (
          <>
            <b>
              {l.from.code || l.from.name} → {l.to.code || l.to.name}
            </b>
            {(l.carrier || l.number) && <small> · {[l.carrier, l.number].filter(Boolean).join(" ")}</small>}
            {l.arriveDate === l.departDate && l.arriveTime && <small> · {tf("chega {time}", { time: l.arriveTime })}</small>}
          </>
        ) : (
          <>{tf("Chegada em {place}", { place: l.to.name })}</>
        )}
      </span>
    </li>
  );
}

/** "Transportes" tab: chronological journey, every transport, vehicles, calculator and comparator. */
export function TransportPanel({ trip, store, onSave, busy }: { trip: Trip; store: SecretStore; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [form, setForm] = useState<{ kind?: TransportKind; initial?: Transport }>();
  const days = useMemo(() => journeyTimeline(trip), [trip]);
  const list = sortedTransports(trip);
  const undated = undatedTransports(trip);
  const add = (kind: TransportKind) => setForm({ kind });

  return (
    <div className="journey">
      <div className="journey-add" role="group" aria-label={tr("Adicionar transporte")}>
        {(["flight", "rental_car", "own_car", "train", "bus", "other"] as TransportKind[]).map((k) => {
          const Icon = kindIcon[k];
          return (
            <button key={k} className="journey-add-button" onClick={() => add(k)}>
              <Icon size={18} aria-hidden="true" />
              <span>{tr(transportKinds[k])}</span>
            </button>
          );
        })}
      </div>

      <section className="panel journey-card" aria-labelledby="timeline-title">
        <h2 id="timeline-title">{tr("Linha do tempo da viagem")}</h2>
        {!days.length ? (
          <p className="muted">{tr("Adicione voos, carros ou trens com data para ver o percurso inteiro, junto com hospedagens e atividades.")}</p>
        ) : (
          <ol className="journey-timeline">
            {days.map((d) => (
              <li key={d.date} className="tl-day">
                <span className="tl-date">{longDate(d.date)}</span>
                <ul>
                  {d.items.map((item, i) => (
                    <TimelineRow key={i} item={item} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {undated.length > 0 && <p className="muted">{tf("{count} transportes ainda sem data.", { count: undated.length })}</p>}
      </section>

      {list.length > 0 && (
        <ul className="transport-list">
          {list.map((t) => {
            const Icon = kindIcon[t.kind];
            const costs = linkedCosts(trip, { transportId: t.id });
            const vehicles = (trip.vehicles || []).filter((v) => t.road?.vehicleIds?.includes(v.id));
            const first = t.legs[0];
            const last = t.legs[t.legs.length - 1];
            const total = t.legs.reduce((n, l) => n + (legMinutes(trip, l) ?? 0), 0);
            const pts = [first.from.point, last.to.point];
            const links = roadKinds.includes(t.kind) && pts.every(Boolean) ? drivingLinks(pts as never) : undefined;
            const docs = (trip.documents || []).filter((d) => t.documentIds?.includes(d.id));
            return (
              <li key={t.id} className="transport-card">
                <header>
                  <span className={"transport-badge tb-" + t.kind}>
                    <Icon size={16} aria-hidden="true" /> {tr(transportKinds[t.kind])}
                  </span>
                  <div className="vehicle-actions">
                    <button className="icon-button" onClick={() => setForm({ initial: t })} aria-label={tf("Editar {name}", { name: transportTitle(t) })}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={async () => {
                        if (!confirm(tr("Remover este transporte? As despesas dele continuam no orçamento, sem vínculo."))) return;
                        if (await onSave(removeTransport(trip, t.id))) await store.remove(trip.id, t.id).catch(() => undefined);
                      }}
                      aria-label={tf("Remover {name}", { name: transportTitle(t) })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </header>
                <h3>{transportTitle(t)}</h3>
                {t.title && <p className="muted">{routeLabel(t)}</p>}
                <ol className="leg-list">
                  {t.legs.map((l) => {
                    const m = legMinutes(trip, l);
                    return (
                      <li key={l.id}>
                        <span className="leg-ends">
                          <b>{l.from.code || l.from.name}</b> {l.departDate && <small>{[l.departDate.split("-").reverse().join("/"), l.departTime, zoneLabel(l.departZone)].filter(Boolean).join(" ")}</small>}
                        </span>
                        <span className="leg-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="leg-ends">
                          <b>{l.to.code || l.to.name}</b> {l.arriveDate && <small>{[l.arriveDate.split("-").reverse().join("/"), l.arriveTime, zoneLabel(l.arriveZone)].filter(Boolean).join(" ")}</small>}
                        </span>
                        <small className="leg-meta">
                          {[l.carrier, l.number, l.from.terminal && tf("Terminal {name}", { name: l.from.terminal }), l.gate && tf("Portão {name}", { name: l.gate }), l.cabin, l.seat && tf("Assento {name}", { name: l.seat }), m && m > 0 && durationText(m)]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </li>
                    );
                  })}
                </ol>
                <div className="transport-facts">
                  {t.legs.length > 1 && total > 0 && <span>{tf("{count} trechos · {time} em voo ou viagem", { count: t.legs.length, time: durationText(total) })}</span>}
                  {t.road?.distanceKm && (
                    <span>
                      {tf("{km} km por estrada", { km: formatNumber(t.road.distanceKm, 0) })} ({t.road.distanceSource === "route" ? tr("rota calculada") : tr("informado por você")})
                      {t.road.durationMin ? ` · ${durationText(t.road.durationMin)}` : ""}
                    </span>
                  )}
                  {vehicles.length > 0 && <span>{vehicles.map((v) => tr(vehicleName(v))).join(" + ")}</span>}
                  {t.flight?.cabinBag && <span>{tf("Mão: {text}", { text: t.flight.cabinBag })}</span>}
                  {t.flight?.checkedBag && <span>{tf("Despachada: {text}", { text: t.flight.checkedBag })}</span>}
                  {t.flight && (t.flight.checkInDate || t.flight.checkInStatus !== "unknown") && (
                    <span>
                      {tr("Check-in")}: {tr(checkInStatuses[t.flight.checkInStatus ?? "unknown"])}
                      {t.flight.checkInDate && ` · ${tf("abre {date} {time}", { date: t.flight.checkInDate.split("-").reverse().join("/"), time: t.flight.checkInTime ?? "" }).trim()}`}
                    </span>
                  )}
                  {t.passengers?.length ? <span>{tf("{count} passageiros", { count: t.passengers.length })}</span> : null}
                </div>
                {costs.length > 0 && (
                  <ul className="transport-costs">
                    {costs.map((x) => (
                      <li key={x.id}>
                        <span>{x.title.split(":")[0]}</span>
                        <span>
                          {x.estimate !== undefined && tf("previsto {value}", { value: formatMoney(x.estimate, x.currency) })}
                          {x.amount > 0 && ` · ${tf("pago {value}", { value: formatMoney(x.amount, x.currency) })}`}
                          <small> · {tr(statusLabels[x.status ?? "paid"])}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="transport-foot">
                  {t.hasSecret && <SecretView store={store} tripId={trip.id} refId={t.id} />}
                  {t.flight?.checkInUrl && (
                    <a href={t.flight.checkInUrl} target="_blank" rel="noreferrer">
                      {tr("Check-in na companhia")} <ExternalLink size={12} />
                    </a>
                  )}
                  {links && (
                    <>
                      <a href={links.google} target="_blank" rel="noreferrer">
                        Google Maps <ExternalLink size={12} />
                      </a>
                      <a href={links.apple} target="_blank" rel="noreferrer">
                        Apple Maps <ExternalLink size={12} />
                      </a>
                    </>
                  )}
                  {docs.map((d) => (
                    <span key={d.id} className="transport-doc">
                      {d.name}
                    </span>
                  ))}
                </div>
                {t.notes && <p className="transport-notes">{t.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <VehiclePanel trip={trip} store={store} onSave={onSave} busy={busy} />

      {form && (
        <TransportForm trip={trip} initial={form.initial} kind={form.kind} store={store} onSave={onSave} onClose={() => setForm(undefined)} busy={busy} />
      )}
      <p className="muted">{tr("Horários com fuso: a duração dos voos considera o fuso de cada aeroporto.")}</p>
    </div>
  );
}
