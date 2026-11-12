import { useMemo, useState } from "react";
import { CalendarClock, Undo2, Utensils, TriangleAlert, Footprints } from "lucide-react";
import { t as tr, tf, formatNumber } from "./i18n";
import type { Trip } from "./model";
import { categories } from "./places";
import { travelDays, dayLabel } from "./travel-mode";
import { RouteMap } from "./LazyMaps";
import type { MapStop } from "./routes";
import {
  applyPlan, changesByDay, modeLabels, planAlternatives, planItinerary, toClock,
  type Meal, type Mode, type Pace, type Plan, type PlannerInput, type Strategy,
} from "./planner";

const strategyText: Record<Strategy, [string, string]> = {
  balanced: ["Equilibrada", "Passeios e descansos no ritmo escolhido."],
  fast: ["Mais rápida", "Menos dias e menos tempo parado entre os lugares."],
  budget: ["Mais econômica", "Quando não cabe tudo, ficam primeiro os gratuitos e os sem preço informado."],
  relaxed: ["Mais tranquila", "No máximo 3 lugares por dia e pausas maiores."],
};
const mealNames: Record<Meal["kind"], string> = { breakfast: "Café da manhã", lunch: "Almoço", dinner: "Jantar" };

export function SmartPlanner({
  trip,
  onSave,
  busy,
  onFindMeal,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
  /** Opens the restaurant finder near a point (Fase 3). */
  onFindMeal?: (request: { day: number; meal: Meal["kind"]; at: string; near?: { lat: number; lng: number }; nearName?: string }) => void;
}) {
  const candidates = useMemo(
    () => (trip.placeChoices ?? []).filter((c) => c.decision === "want" || c.decision === "maybe"),
    [trip.placeChoices],
  );
  const allDays = travelDays(trip);
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.decision === "want").map((c) => c.place.id))),
    [days, setDays] = useState<Set<number>>(() => new Set(allDays)),
    [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("19:00"),
    [mode, setMode] = useState<Mode>("transit"),
    [pace, setPace] = useState<Pace>("balanced"),
    [stayId, setStayId] = useState(""),
    [meals, setMeals] = useState<Record<Meal["kind"], { on: boolean; at: string; minutes: number }>>({
      breakfast: { on: false, at: "08:00", minutes: 30 },
      lunch: { on: true, at: "13:00", minutes: 60 },
      dinner: { on: false, at: "20:00", minutes: 75 },
    }),
    [durations, setDurations] = useState<Record<string, number>>({}),
    [forcedDays, setForcedDays] = useState<Record<string, number>>({}),
    [strategy, setStrategy] = useState<Strategy>(),
    [alternatives, setAlternatives] = useState<Plan[]>(),
    [plan, setPlan] = useState<Plan>(),
    [shownDay, setShownDay] = useState<number>(),
    [confirming, setConfirming] = useState(false),
    [undo, setUndo] = useState<{ before: Trip; after: Trip }>(),
    [message, setMessage] = useState("");

  const input = (): PlannerInput => ({
    places: candidates.filter((c) => selected.has(c.place.id)).map((c) => c.place),
    days: [...days],
    dayStart: start,
    dayEnd: end,
    mode,
    pace,
    stayId: stayId || undefined,
    meals: (Object.keys(meals) as Meal["kind"][]).filter((k) => meals[k].on).map((k) => ({ kind: k, at: meals[k].at, minutes: meals[k].minutes })),
    durations,
    forcedDays,
  });
  function run(next?: Strategy, overrides: Partial<PlannerInput> = {}) {
    try {
      const p = planItinerary(trip, { ...input(), ...overrides, strategy: next ?? strategy ?? "balanced" });
      setPlan(p);
      setShownDay(p.days.find((d) => d.stops.length)?.day);
      setConfirming(false);
      setMessage(p.summary.places ? "" : tr("Nenhum lugar novo coube na proposta. Veja os motivos abaixo."));
    } catch (e) {
      setMessage(e instanceof Error ? tr(e.message) : tr("Não foi possível organizar."));
    }
  }
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const shown = plan?.days.find((d) => d.day === shownDay);
  const stops: MapStop[] = shown
    ? [
        ...(shown.base ? [{ id: "base", title: shown.baseName ?? tr("Hospedagem"), point: shown.base, label: "H", kind: "stay" as const }] : []),
        ...shown.stops.filter((s) => s.place.coordinates).map((s, i) => ({ id: s.place.id, title: s.place.name, point: s.place.coordinates!, label: String(i + 1), kind: "activity" as const })),
      ]
    : [];
  const segments = stops.slice(1).map((s, i) => [stops[i].point, s.point] as [typeof s.point, typeof s.point]);

  return (
    <section className="panel smart-planner">
      <div className="section-head">
        <div>
          <h2>{tr("Organizar meu roteiro")}</h2>
          <p>{tr("Escolha os lugares e os dias. O app agrupa por proximidade, respeita horários e compromissos e mostra a proposta antes de salvar.")}</p>
        </div>
        <CalendarClock size={28} aria-hidden="true" />
      </div>
      {undo && (
        <div className="planner-undo" role="status">
          <span>{tr("Roteiro atualizado.")}</span>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              // Undo only if nothing changed since the plan was applied.
              if (JSON.stringify(trip.activities) !== JSON.stringify(undo.after.activities)) {
                setMessage(tr("O roteiro mudou depois disso. Desfaça manualmente para não perder alterações."));
                setUndo(undefined);
                return;
              }
              if (await onSave({ ...trip, activities: undo.before.activities, placeChoices: undo.before.placeChoices })) {
                setUndo(undefined);
                setMessage(tr("Alteração desfeita. O roteiro voltou ao que era."));
              }
            }}
          >
            <Undo2 size={16} /> {tr("Desfazer")}
          </button>
        </div>
      )}
      {!open ? (
        <button className="primary" onClick={() => setOpen(true)} disabled={!candidates.length}>
          {tr("Organizar meu roteiro")}
        </button>
      ) : (
        <div className="planner-form">
          <fieldset>
            <legend>{tf("Lugares ({count})", { count: selected.size })}</legend>
            {!candidates.length && <p className="muted">{tr("Salve lugares como Quero ir ou Talvez no Explorar.")}</p>}
            <div className="planner-checks">
              {candidates.map((c) => (
                <label key={c.place.id} className="check-row">
                  <input type="checkbox" checked={selected.has(c.place.id)} onChange={() => setSelected((s) => toggle(s, c.place.id))} />
                  <span>
                    {c.place.name} <span className="muted">· {tr(categories[c.place.category] ?? "Outros lugares")}{c.decision === "maybe" ? " · " + tr("Talvez") : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{tr("Dias disponíveis")}</legend>
            <div className="chip-row wrap">
              {allDays.map((d) => (
                <button key={d} type="button" className={"chip" + (days.has(d) ? " is-on" : "")} aria-pressed={days.has(d)} onClick={() => setDays((s) => toggle(s, d))}>
                  {dayLabel(trip, d).short}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <label>
              {tr("Começo do dia")}
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              {tr("Fim do dia")}
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label>
              {tr("Meio de transporte")}
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                {(Object.keys(modeLabels) as Mode[]).map((m) => (
                  <option key={m} value={m}>{tr(modeLabels[m])}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Ritmo")}
              <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
                <option value="relaxed">{tr("Tranquilo · até 3 lugares por dia")}</option>
                <option value="balanced">{tr("Equilibrado · até 5 lugares por dia")}</option>
                <option value="intense">{tr("Intenso · até 7 lugares por dia")}</option>
              </select>
            </label>
            {(trip.stays?.length ?? 0) > 0 && (
              <label>
                {tr("Hospedagem de referência")}
                <select value={stayId} onChange={(e) => setStayId(e.target.value)}>
                  <option value="">{tr("A hospedagem de cada data")}</option>
                  {trip.stays!.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <fieldset>
            <legend>{tr("Pausas para refeições")}</legend>
            <div className="planner-meals">
              {(Object.keys(meals) as Meal["kind"][]).map((k) => (
                <div key={k} className="planner-meal">
                  <label className="check-row">
                    <input type="checkbox" checked={meals[k].on} onChange={(e) => setMeals((m) => ({ ...m, [k]: { ...m[k], on: e.target.checked } }))} />
                    {tr(mealNames[k])}
                  </label>
                  <input type="time" aria-label={tf("Horário de {meal}", { meal: tr(mealNames[k]) })} value={meals[k].at} disabled={!meals[k].on} onChange={(e) => setMeals((m) => ({ ...m, [k]: { ...m[k], at: e.target.value } }))} />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="tm-actions">
            <button className="primary" disabled={!selected.size || !days.size} onClick={() => { setStrategy("balanced"); setAlternatives(undefined); run("balanced"); }}>
              {tr("Criar proposta")}
            </button>
            <button
              className="secondary"
              disabled={!selected.size || !days.size}
              onClick={() => {
                try {
                  setAlternatives(planAlternatives(trip, input()));
                  setPlan(undefined);
                } catch (e) {
                  setMessage(e instanceof Error ? tr(e.message) : tr("Não foi possível organizar."));
                }
              }}
            >
              {tr("Comparar alternativas")}
            </button>
          </div>
        </div>
      )}
      <p role="status">{message}</p>

      {alternatives && !plan && (
        <div className="alt-compare" role="list">
          {alternatives.map((a) => {
            const [title, text] = strategyText[a.strategy];
            const s = a.summary;
            return (
              <article className="alt-card" role="listitem" key={a.strategy}>
                <h3>{tr(title)}</h3>
                <p className="muted">{tr(text)}</p>
                <dl>
                  <dt>{tr("Dias usados")}</dt>
                  <dd>{s.daysUsed}</dd>
                  <dt>{tr("Lugares incluídos")}</dt>
                  <dd>{s.places}</dd>
                  <dt>{tr("Fora da proposta")}</dt>
                  <dd>{s.leftOut}</dd>
                  <dt>{tr("Deslocamento estimado")}</dt>
                  <dd>{tf("{minutes} min · {km} km", { minutes: s.travelMinutes, km: formatNumber(s.travelKm, 1) })}</dd>
                  <dt>{tr("Alertas")}</dt>
                  <dd>{s.conflicts}</dd>
                  <dt>{tr("Entrada")}</dt>
                  <dd>{tf("{free} gratuitos · {paid} pagos · {unknown} sem informação", { free: s.free, paid: s.paid, unknown: s.unknownPrice })}</dd>
                </dl>
                <button className="secondary" disabled={!s.places} onClick={() => { setStrategy(a.strategy); setPlan(a); setShownDay(a.days.find((d) => d.stops.length)?.day); }}>
                  {tr("Escolher e revisar")}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {plan && (
        <div className="planner-preview">
          <h3>{tf("Proposta {name} · {count} lugares", { name: tr(strategyText[plan.strategy][0]).toLowerCase(), count: plan.summary.places })}</h3>
          {alternatives && (
            <button className="text-button" onClick={() => setPlan(undefined)}>{tr("Voltar à comparação")}</button>
          )}
          {plan.warnings.map((w) => (
            <p key={w} className="muted">{tr(w)}</p>
          ))}
          <div className="planner-days" role="tablist" aria-label={tr("Dias da proposta")}>
            {plan.days.filter((d) => d.stops.length || d.busy.some((b) => b.kind === "fixed")).map((d) => (
              <button key={d.day} role="tab" aria-selected={d.day === shownDay} className={"chip" + (d.day === shownDay ? " is-on" : "")} onClick={() => setShownDay(d.day)}>
                {dayLabel(trip, d.day).short} · {d.stops.length}
                {d.conflicts.length > 0 && <TriangleAlert size={14} aria-label={tr("Com alertas")} />}
              </button>
            ))}
          </div>
          {shown && (
            <div className="planner-day">
              <div className="planner-timeline">
                <p className="muted">
                  {dayLabel(trip, shown.day).full}
                  {shown.baseName && " · " + tf("saindo de {place}", { place: shown.baseName })}
                </p>
                <ol>
                  {[
                    ...shown.stops.map((s) => ({ t: s.start, el: (
                      <li key={s.place.id} className="planner-stop">
                        {s.travel.minutes > 0 && (
                          <p className="planner-travel">
                            <Footprints size={14} aria-hidden="true" />{" "}
                            {tf("≈ {minutes} min · {km} km · {mode} (estimativa)", { minutes: s.travel.minutes, km: formatNumber(s.travel.km, 1), mode: tr(modeLabels[s.travel.mode]) })}
                          </p>
                        )}
                        <div className="planner-stop-main">
                          <time>{toClock(s.start)}–{toClock(s.end)}</time>
                          <div>
                            <strong>{s.place.name}</strong>
                            <span className="muted"> · {tr(categories[s.place.category] ?? "Outros lugares")}</span>
                            {s.notes.map((n) => (
                              <p key={n} className={n.startsWith("Fecha") ? "planner-alert" : "muted"}>{tr(n)}</p>
                            ))}
                          </div>
                        </div>
                        <div className="planner-stop-edit">
                          <label>
                            {tr("Duração (min)")}
                            <input type="number" min="10" max="600" step="5" value={s.visit} onChange={(e) => { const v = Number(e.target.value); const next = { ...durations, [s.place.id]: v }; setDurations(next); run(undefined, { durations: next }); }} />
                          </label>
                          <label>
                            {tr("Dia")}
                            <select value={shown.day} onChange={(e) => { const next = { ...forcedDays, [s.place.id]: Number(e.target.value) }; setForcedDays(next); run(undefined, { forcedDays: next }); }}>
                              {[...days].sort((a, b) => a - b).map((d) => (
                                <option key={d} value={d}>{dayLabel(trip, d).short}</option>
                              ))}
                            </select>
                          </label>
                          <button className="text-button" onClick={() => { const next = new Set(selected); next.delete(s.place.id); setSelected(next); run(undefined, { places: candidates.filter((c) => next.has(c.place.id)).map((c) => c.place) }); }}>
                            {tr("Retirar da proposta")}
                          </button>
                        </div>
                      </li>
                    ) })),
                    ...shown.busy.map((b, i) => ({ t: b.start, el: (
                      <li key={"b" + i} className={"planner-busy " + b.kind}>
                        <div className="planner-stop-main">
                          <time>{toClock(b.start)}–{toClock(b.end)}</time>
                          <div>
                            {b.kind === "meal" ? (
                              <>
                                <Utensils size={14} aria-hidden="true" /> <strong>{tr(mealNames[b.meal!])}</strong>
                                {onFindMeal && (
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      const before = shown.stops.filter((s) => s.end <= b.start).pop();
                                      onFindMeal({ day: shown.day, meal: b.meal!, at: toClock(b.start), near: before?.place.coordinates ?? shown.base, nearName: before?.place.name ?? shown.baseName });
                                    }}
                                  >
                                    {b.meal === "dinner" ? tr("Encontrar jantar próximo") : b.meal === "lunch" ? tr("Encontrar almoço próximo") : tr("Encontrar café da manhã próximo")}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <strong>{b.title}</strong> <span className="muted">· {tr("compromisso fixo, não será movido")}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    ) })),
                  ].sort((a, b) => a.t - b.t).map((x) => x.el)}
                </ol>
                {shown.conflicts.map((c, i) => (
                  <p key={i} className="planner-alert">
                    <TriangleAlert size={14} aria-hidden="true" />{" "}
                    {c.kind === "overlap"
                      ? tf("{a} e {b} acontecem ao mesmo tempo", { a: c.title, b: c.other ?? "" })
                      : c.kind === "closed"
                        ? tf("{name} está fechado neste dia segundo o horário cadastrado", { name: c.title })
                        : tf("{name} fecha às {time}, antes do fim da visita", { name: c.title, time: c.time ?? "" })}
                  </p>
                ))}
              </div>
              {stops.length > 1 && <RouteMap stops={stops} segments={segments} />}
            </div>
          )}
          {plan.unassigned.length > 0 && (
            <details>
              <summary>{tf("{count} lugares fora da proposta", { count: plan.unassigned.length })}</summary>
              <ul className="plain-list">
                {plan.unassigned.map((u) => (
                  <li key={u.place.id}>{u.place.name} · <span className="muted">{tr(u.reason)}</span></li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary>{tr("Antes e depois por dia")}</summary>
            <table className="planner-diff">
              <thead>
                <tr><th>{tr("Dia")}</th><th>{tr("Atividades hoje")}</th><th>{tr("Novas")}</th></tr>
              </thead>
              <tbody>
                {changesByDay(trip, plan).filter((c) => c.added).map((c) => (
                  <tr key={c.day}><td>{dayLabel(trip, c.day).short}</td><td>{c.before}</td><td>+{c.added}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
          {!confirming ? (
            <div className="tm-actions">
              <button className="primary" disabled={busy || !plan.summary.places} onClick={() => setConfirming(true)}>
                {tr("Aplicar ao roteiro")}
              </button>
              <button className="secondary" onClick={() => { setPlan(undefined); setAlternatives(undefined); setMessage(tr("Proposta descartada. Roteiro preservado.")); }}>
                {tr("Descartar proposta")}
              </button>
            </div>
          ) : (
            <div className="planner-confirm" role="alertdialog" aria-label={tr("Confirmar")}>
              <p>{tf("Adicionar {count} atividades com horário? As atividades atuais e as reservas não serão alteradas.", { count: plan.summary.places })}</p>
              <div className="tm-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    const before = trip;
                    const after = applyPlan(trip, plan);
                    if (await onSave(after)) {
                      setUndo({ before, after });
                      setPlan(undefined);
                      setAlternatives(undefined);
                      setConfirming(false);
                      setMessage(tf("{count} atividades adicionadas ao roteiro.", { count: after.activities.length - before.activities.length }));
                    }
                  }}
                >
                  {tr("Confirmar e salvar")}
                </button>
                <button className="secondary" onClick={() => setConfirming(false)}>{tr("Cancelar")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
