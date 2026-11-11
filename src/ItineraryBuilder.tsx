import { tf, formatNumber } from "./i18n";
import { t as tr } from "./i18n";
import { useState } from "react";
import type { Trip } from "./model";
import {
  generateItinerary,
  generateAlternatives,
  appendDraft,
  type Alternative,
  type PlanDraft,
  type PlanOptions,
  type Strategy,
  straightLineLength,
} from "./itinerary";

const strategyText: Record<Strategy, [string, string]> = {
  fast: ["Mais rápida", "Menos dias, mais lugares por dia."],
  budget: [
    "Mais econômica",
    "Primeiro os lugares cadastrados como gratuitos; os pagos ficam por último.",
  ],
  relaxed: ["Mais tranquila", "No máximo 3 lugares por dia, espalhados pelos dias."],
};

function Comparison({
  alternatives,
  onChoose,
}: {
  alternatives: Alternative[];
  onChoose: (a: Alternative) => void;
}) {
  const fewestDays = Math.min(...alternatives.map((a) => a.summary.daysUsed));
  const shortest = Math.min(
    ...alternatives.filter((a) => a.summary.places > 1).map((a) => a.summary.km),
  );
  return (
    <div className="alt-compare" role="list">
      {alternatives.map((a) => {
        const s = a.summary;
        const [title, text] = strategyText[a.strategy];
        return (
          <article className="alt-card" role="listitem" key={a.strategy}>
            <h3>{tr(title)}</h3>
            <p className="subtle">{tr(text)}</p>
            <div className="alt-badges">
              {s.places > 0 && s.daysUsed === fewestDays && (
                <span>{tr("Menos dias")}</span>
              )}
              {s.places > 1 && s.kmComplete && s.km === shortest && (
                <span>{tr("Menor distância")}</span>
              )}
              {s.paid === 0 && s.free > 0 && <span>{tr("Sem pagos cadastrados")}</span>}
            </div>
            <dl>
              <dt>{tr("Dias usados")}</dt>
              <dd>{s.daysUsed}</dd>
              <dt>{tr("Lugares incluídos")}</dt>
              <dd>{s.places}</dd>
              <dt>{tr("Fora da proposta")}</dt>
              <dd>{s.leftOut}</dd>
              <dt>{tr("Máximo em um dia")}</dt>
              <dd>{s.maxPerDay}</dd>
              <dt>{tr("Distância em linha reta")}</dt>
              <dd>
                {tf("{km} km", { km: formatNumber(s.km, 1) })}
                {!s.kmComplete && " · " + tr("incompleta")}
              </dd>
              <dt>{tr("Entrada")}</dt>
              <dd>
                {tf("{free} gratuitos · {paid} pagos · {unknown} sem informação", {
                  free: s.free,
                  paid: s.paid,
                  unknown: s.unknownPrice,
                })}
              </dd>
            </dl>
            <button
              className="secondary"
              disabled={!s.places}
              onClick={() => onChoose(a)}
            >
              {tr("Escolher e revisar")}
            </button>
          </article>
        );
      })}
      <p className="subtle alt-note">
        {tr(
          "Distâncias em linha reta entre lugares do mesmo dia. Preços só aparecem quando a fonte informa se a entrada é gratuita ou paga; nada é estimado.",
        )}
      </p>
    </div>
  );
}
import { calendarDate } from "./travel-mode";
import { periods, type Period } from "./calendar";
export function ItineraryBuilder({
  trip,
  onSave,
  busy,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
}) {
  const start = calendarDate(trip.start),
    end = calendarDate(trip.end),
    count =
      start && end && end >= start
        ? Math.min(3660, Math.floor((+end - +start) / 86400000) + 1)
        : 3;
  const [days, setDays] = useState(count),
    [pace, setPace] = useState<PlanOptions["pace"]>("balanced"),
    [maybe, setMaybe] = useState(false),
    [draft, setDraft] = useState<PlanDraft>(),
    [alternatives, setAlternatives] = useState<Alternative[]>(),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const distance = draft ? straightLineLength(draft.activities) : undefined;
  return (
    <section className="panel itinerary-builder">
      <h2>{tr("Gerar roteiro")}</h2>
      <p>{tr("Organize os lugares da sua lista Quero ir. Você revisa a proposta antes de salvar.")}</p>
      <div className="catalog-filters">
        <label>
          {tr("Dias disponíveis")}
          <input
            type="number"
            min="1"
            max="3660"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label>
          {tr("Ritmo")}
          <select
            value={pace}
            onChange={(e) => setPace(e.target.value as PlanOptions["pace"])}
          >
            <option value="relaxed">
              {tr("Tranquilo · até 3 lugares por dia")}
            </option>
            <option value="balanced">
              {tr("Equilibrado · até 5 lugares por dia")}
            </option>
            <option value="intense">
              {tr("Intenso · até 7 lugares por dia")}
            </option>
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={maybe}
            onChange={(e) => setMaybe(e.target.checked)}
          />
          {tr("Incluir Talvez")}
        </label>
      </div>
      <button
        className="secondary"
        disabled={busy || pending}
        onClick={() => {
          try {
            const next = generateItinerary(trip, {
              days,
              pace,
              includeMaybe: maybe,
            });
            setDraft(next);
            setAlternatives(undefined);
            setMessage(
              next.activities.length
                ? tr("Prévia criada. Confira a distribuição.")
                : tr("Salve lugares em Quero ir, ou inclua Talvez."),
            );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : tr("Não foi possível gerar."),
            );
          }
        }}
      >
        {tr("Criar prévia")}
      </button>{" "}
      <button
        className="secondary"
        disabled={busy || pending}
        onClick={() => {
          try {
            const alts = generateAlternatives(trip, { days, includeMaybe: maybe });
            if (!alts.some((a) => a.summary.places)) {
              setAlternatives(undefined);
              setMessage(tr("Salve lugares em Quero ir, ou inclua Talvez."));
              return;
            }
            setAlternatives(alts);
            setDraft(undefined);
            setMessage(tr("Compare as alternativas e escolha uma para revisar."));
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : tr("Não foi possível gerar."),
            );
          }
        }}
      >
        {tr("Comparar alternativas")}
      </button>
      {alternatives && !draft && (
        <Comparison
          alternatives={alternatives}
          onChoose={(a) => {
            setDraft(a.draft);
            setMessage(
              tf("Prévia criada a partir da alternativa “{name}”. Edite o que quiser antes de salvar.", {
                name: tr(strategyText[a.strategy][0]),
              }),
            );
          }}
        />
      )}
      {draft && (
        <div className="itinerary-preview">
          <h3>
            {tf("Sua proposta · {count} lugares", {
              count: draft.activities.length,
            })}
          </h3>
          {alternatives && (
            <button className="text-button" onClick={() => setDraft(undefined)}>
              {tr("Voltar à comparação")}
            </button>
          )}
          {draft.warnings.map((w) => (
            <p className="subtle" key={w}>
              {tr(w)}
            </p>
          ))}
          {distance && distance.segments > 0 && (
            <p>
              {tf("{km} km em linha reta entre pontos do mesmo dia. Não inclui ida/volta do hotel.", { km: formatNumber(distance.km, 1) })}</p>
          )}
          {draft.activities.map((a, index) => (
            <article className="stay-card" key={a.id}>
              <label>
                {tr("Atividade")}
                {index + 1}
                <input
                  value={a.title}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      activities: draft.activities.map((x) =>
                        x.id === a.id ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  {tr("Dia")}
                  <input
                    type="number"
                    min="1"
                    max="3660"
                    value={a.day}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        activities: draft.activities.map((x) =>
                          x.id === a.id
                            ? { ...x, day: Number(e.target.value) }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {tr("Horário opcional")}
                  <input
                    type="time"
                    value={a.time}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        activities: draft.activities.map((x) =>
                          x.id === a.id ? { ...x, time: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {tr("Período")}
                  <select
                    value={a.period || "any"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        activities: draft.activities.map((x) =>
                          x.id === a.id
                            ? { ...x, period: e.target.value as Period }
                            : x,
                        ),
                      })
                    }
                  >
                    {Object.entries(periods).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="tm-actions">
                <button
                  className="secondary"
                  disabled={index === 0}
                  onClick={() => {
                    const items = [...draft.activities];
                    [items[index - 1], items[index]] = [
                      items[index],
                      items[index - 1],
                    ];
                    setDraft({ ...draft, activities: items });
                  }}
                >
                  {tr("Subir")}
                </button>
                <button
                  className="secondary"
                  disabled={index === draft.activities.length - 1}
                  onClick={() => {
                    const items = [...draft.activities];
                    [items[index + 1], items[index]] = [
                      items[index],
                      items[index + 1],
                    ];
                    setDraft({ ...draft, activities: items });
                  }}
                >
                  {tr("Descer")}
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      activities: draft.activities.filter((x) => x.id !== a.id),
                    })
                  }
                >
                  {tr("Retirar da prévia")}
                </button>
              </div>
            </article>
          ))}
          {draft.unassigned.length > 0 && (
            <p>{tr("Fora da proposta:")}{" "}{draft.unassigned.map((p) => p.name).join(", ")}
              .
            </p>
          )}
          <p>{tr("As atividades atuais serão mantidas. Lugares já presentes no roteiro não serão adicionados novamente.")}</p>
          <div className="tm-actions">
            <button
              className="primary"
              disabled={busy || pending || !draft.activities.length}
              onClick={async () => {
                setPending(true);
                try {
                  const next = appendDraft(trip, draft.activities),
                    added = next.activities.length - trip.activities.length;
                  if (!added) {
                    setMessage(tr("Todos estes lugares já estão no roteiro."));
                    return;
                  }
                  if (await onSave(next)) {
                    setDraft(undefined);
                    setAlternatives(undefined);
                    setMessage(
                      tf("{count} atividades adicionadas. Seu roteiro anterior foi preservado.", { count: added }),
                    );
                  }
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : tr("Não foi possível salvar."),
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              {tr("Aceitar e adicionar ao roteiro")}
            </button>
            <button
              className="secondary"
              disabled={pending}
              onClick={() => {
                setDraft(undefined);
                setAlternatives(undefined);
                setMessage(tr("Prévia descartada. Roteiro preservado."));
              }}
            >
              {tr("Descartar prévia")}
            </button>
          </div>
        </div>
      )}
      <p role="status">{tr(message)}</p>
    </section>
  );
}
