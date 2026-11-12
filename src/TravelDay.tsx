import { useState } from "react";
import { Play, SkipForward, Clock, CalendarClock, StickyNote, Wallet, Navigation, Hotel, Ticket, MapPin, Eye, EyeOff, AlarmClock, RotateCcw } from "lucide-react";
import { t as tr, tf, formatMoney, getLocale } from "./i18n";
import type { Activity, Trip } from "./model";
import { travelDays, dayLabel } from "./travel-mode";
import {
  addNote, addPaidExpense, dayPanel, isFixed, navigationLinks, postpone, replanOptions, reschedule, resumeActivity,
  skipActivity, startActivity, type NavMode,
} from "./travel-day";
import { modeLabels } from "./planner";

/** Today at a glance (Fase 5): where, what is next, how to get there, bookings and spending. */
export function TravelDayPanel({
  trip,
  day,
  mode,
  online,
  onApply,
}: {
  trip: Trip;
  day: number;
  mode: NavMode;
  online: boolean;
  onApply: (t: Trip, message: string) => void;
}) {
  const p = dayPanel(trip, day, mode);
  const [shown, setShown] = useState<Set<string>>(new Set()),
    [late, setLate] = useState(false),
    [delay, setDelay] = useState(30);
  const options = late ? replanOptions(trip, day, delay) : [];
  const optionText: Record<string, string> = {
    keep: "Manter o restante do dia",
    next: "Adiar só a próxima atividade",
    shift: "Adiar as atividades flexíveis",
    move: "Mover para o dia seguinte o que não cabe mais",
  };
  return (
    <section className="tm-panel" aria-label={tr("Painel do dia")}>
      <div className="tm-panel-grid">
        <div>
          <small>{tr("Onde")}</small>
          <strong>{p.city || tr("Destino não informado")}</strong>
          {p.date && <span>{new Date(p.date + "T12:00:00Z").toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>}
        </div>
        <div>
          <small><Hotel size={13} aria-hidden="true" /> {tr("Hospedagem")}</small>
          <strong>{p.stay?.name ?? tr("Não cadastrada para este dia")}</strong>
          {p.stay?.address && <span>{p.stay.address}</span>}
        </div>
        <div className="tm-panel-next">
          <small>{p.current ? tr("Agora") : tr("Próxima atividade")}</small>
          {p.current || p.next ? (
            <>
              <strong>{(p.current ?? p.next)!.title}</strong>
              <span>
                {(p.current ?? p.next)!.time || tr("Sem horário")}
                {(p.current ?? p.next)!.address && " · " + (p.current ?? p.next)!.address}
              </span>
              {!p.current && p.travel && (
                <span>
                  {tf("≈ {minutes} min · {mode} · saindo de {place} (estimativa)", { minutes: p.travel.minutes, mode: tr(modeLabels[p.travel.mode]), place: p.travel.from })}
                </span>
              )}
            </>
          ) : (
            <strong>{tr("Nada pendente hoje")}</strong>
          )}
        </div>
        <div>
          <small><Wallet size={13} aria-hidden="true" /> {tr("Gastos do dia")}</small>
          {p.expenses.length ? (
            p.expenses.map((e) => (
              <span key={e.currency}>
                <strong>{formatMoney(e.spent, e.currency)}</strong> <span className="muted">{tf("de {value} previstos", { value: formatMoney(e.planned, e.currency) })}</span>
              </span>
            ))
          ) : (
            <strong>—</strong>
          )}
        </div>
      </div>
      {p.reservations.length > 0 && (
        <div className="tm-panel-bookings">
          <small><Ticket size={13} aria-hidden="true" /> {tr("Reservas do dia")}</small>
          <ul className="plain-list">
            {p.reservations.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong>{" "}
                {r.details && (
                  <>
                    {shown.has(r.id) ? <span className="tm-secret">{r.details}</span> : <span className="muted">••••••</span>}{" "}
                    <button
                      className="text-button"
                      aria-pressed={shown.has(r.id)}
                      onClick={() => setShown((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                    >
                      {shown.has(r.id) ? <><EyeOff size={14} /> {tr("Ocultar detalhes")}</> : <><Eye size={14} /> {tr("Mostrar detalhes")}</>}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tm-late">
        {!late ? (
          <button className="secondary" onClick={() => setLate(true)}>
            <AlarmClock size={16} /> {tr("Estou atrasado")}
          </button>
        ) : (
          <div className="tm-late-box">
            <label>
              {tr("Quanto tempo de atraso?")}
              <select value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{tf("{minutes} min", { minutes: m })}</option>
                ))}
              </select>
            </label>
            <p className="muted">{tr("Atividades ligadas a reservas não são movidas. Nada muda sem você escolher.")}</p>
            <ul className="plain-list tm-late-options">
              {options.map((o) => (
                <li key={o.key}>
                  <strong>{tr(optionText[o.key])}</strong>
                  {o.changes.length > 0 && (
                    <ul>
                      {o.changes.map((c) => (
                        <li key={c.id}>
                          {c.title}: {c.from || tr("sem horário")} → {c.to === "+1" ? tr("dia seguinte") : c.to}
                        </li>
                      ))}
                    </ul>
                  )}
                  {o.conflicts.map((c, i) => (
                    <p key={i} className="planner-alert">{tf("{name} fica perto do horário fixo de {fixed} ({time})", { name: c.title, fixed: c.fixed, time: c.time })}</p>
                  ))}
                  <button
                    className={o.key === "keep" ? "secondary" : "primary"}
                    onClick={() => {
                      setLate(false);
                      if (o.key !== "keep") onApply(o.trip, tr("Dia reorganizado. As reservas continuam nos mesmos horários."));
                    }}
                  >
                    {o.key === "keep" ? tr("Manter") : tr("Aplicar")}
                  </button>
                </li>
              ))}
            </ul>
            <button className="text-button" onClick={() => setLate(false)}>{tr("Cancelar")}</button>
          </div>
        )}
      </div>
      {!online && <p className="muted">{tr("Sem internet: roteiro, endereços, coordenadas, reservas, notas e checklist continuam aqui. Mapas e rotas precisam de conexão.")}</p>}
    </section>
  );
}

/** Start, skip, postpone, reschedule, navigate, note and spend for one activity. */
export function ActivityActions({
  trip,
  activity,
  mode,
  online,
  busy,
  onApply,
}: {
  trip: Trip;
  activity: Activity;
  mode: NavMode;
  online: boolean;
  busy: boolean;
  onApply: (t: Trip, message: string) => void;
}) {
  const [open, setOpen] = useState<"" | "reschedule" | "note" | "expense">(""),
    [day, setDay] = useState(activity.day),
    [time, setTime] = useState(activity.time),
    [note, setNote] = useState(""),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState(trip.budget?.currency ?? trip.expenses.at(-1)?.currency ?? "EUR"),
    [error, setError] = useState("");
  const links = navigationLinks(activity, mode);
  const fixed = isFixed(trip, activity);
  const run = (f: () => Trip, message: string) => {
    try {
      setError("");
      onApply(f(), message);
      setOpen("");
    } catch (e) {
      setError(e instanceof Error ? tr(e.message) : tr("Não foi possível salvar."));
    }
  };
  const id = activity.id;
  return (
    <div className="tm-activity-actions">
      <div className="tm-actions">
        {activity.status === "skipped" ? (
          <button className="secondary" disabled={busy} onClick={() => run(() => resumeActivity(trip, id), tr("Atividade de volta ao dia."))}>
            <RotateCcw size={16} /> {tr("Retomar")}
          </button>
        ) : (
          !activity.done && (
            <>
              {activity.status !== "started" && (
                <button className="secondary" disabled={busy} onClick={() => run(() => startActivity(trip, id), tr("Atividade iniciada."))}>
                  <Play size={16} /> {tr("Iniciar")}
                </button>
              )}
              <button className="secondary" disabled={busy} onClick={() => run(() => skipActivity(trip, id), tr("Atividade pulada. Ela continua no roteiro."))}>
                <SkipForward size={16} /> {tr("Pular")}
              </button>
              {activity.time && !fixed && (
                <button className="secondary" disabled={busy} onClick={() => run(() => postpone(trip, id, 30), tr("Atividade adiada 30 minutos."))}>
                  <Clock size={16} /> {tr("Adiar 30 min")}
                </button>
              )}
            </>
          )
        )}
        {links && online && (
          <>
            <a className="secondary" href={links.google} target="_blank" rel="noreferrer"><Navigation size={16} /> Google Maps</a>
            {links.apple && <a className="secondary" href={links.apple} target="_blank" rel="noreferrer"><MapPin size={16} /> Apple Maps</a>}
          </>
        )}
      </div>
      <div className="tm-actions tm-actions-small">
        {!fixed && (
          <button className="text-button" onClick={() => setOpen(open === "reschedule" ? "" : "reschedule")} aria-expanded={open === "reschedule"}>
            <CalendarClock size={15} /> {tr("Reagendar")}
          </button>
        )}
        <button className="text-button" onClick={() => setOpen(open === "note" ? "" : "note")} aria-expanded={open === "note"}>
          <StickyNote size={15} /> {tr("Observação")}
        </button>
        <button className="text-button" onClick={() => setOpen(open === "expense" ? "" : "expense")} aria-expanded={open === "expense"}>
          <Wallet size={15} /> {tr("Registrar gasto")}
        </button>
        {fixed && <span className="muted">{tr("Ligada a uma reserva: horário fixo")}</span>}
      </div>
      {open === "reschedule" && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(() => reschedule(trip, id, day, time), tr("Atividade reagendada.")); }}>
          <select aria-label={tr("Dia")} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {travelDays(trip).map((d) => <option key={d} value={d}>{dayLabel(trip, d).short}</option>)}
          </select>
          <input type="time" aria-label={tr("Horário")} value={time} onChange={(e) => setTime(e.target.value)} />
          <button className="primary" disabled={busy}>{tr("Salvar")}</button>
        </form>
      )}
      {open === "note" && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(() => addNote(trip, id, note), tr("Observação salva.")); setNote(""); }}>
          <input aria-label={tr("Observação")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <button className="primary" disabled={busy}>{tr("Salvar")}</button>
        </form>
      )}
      {open === "expense" && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(() => addPaidExpense(trip, activity, Number(amount.replace(",", ".")), currency), tf("Gasto de {value} registrado.", { value: formatMoney(Number(amount.replace(",", ".")) || 0, currency) })); setAmount(""); }}>
          <input inputMode="decimal" aria-label={tr("Valor")} placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select aria-label={tr("Moeda")} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currency, "EUR", "BRL", "USD", "GBP"])].map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="primary" disabled={busy}>{tr("Salvar")}</button>
        </form>
      )}
      {error && <p role="alert" className="planner-alert">{error}</p>}
      {(activity.history?.length ?? 0) > 0 && (
        <details className="tm-history">
          <summary>{tr("Histórico")}</summary>
          <ul className="plain-list">
            {activity.history!.slice().reverse().map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString(getLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                {tr(({ started: "Iniciada", done: "Concluída", skipped: "Pulada", resumed: "Retomada", postponed: "Adiada", rescheduled: "Reagendada", note: "Observação adicionada" } as Record<string, string>)[h.what] ?? h.what)}
                {h.from !== undefined && ` (${h.from} → ${h.to})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {activity.notes && <p className="activity-notes">{activity.notes}</p>}
    </div>
  );
}
