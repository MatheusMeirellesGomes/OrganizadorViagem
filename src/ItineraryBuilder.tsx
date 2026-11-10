import { useState } from "react";
import type { Trip } from "./model";
import {
  generateItinerary,
  appendDraft,
  type PlanDraft,
  type PlanOptions,
  straightLineLength,
} from "./itinerary";
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
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const distance = draft ? straightLineLength(draft.activities) : undefined;
  return (
    <section className="panel itinerary-builder">
      <h2>Gerar roteiro</h2>
      <p>
        Organize os lugares da sua lista Quero ir. Você revisa a proposta antes
        de salvar.
      </p>
      <div className="catalog-filters">
        <label>
          Dias disponíveis
          <input
            type="number"
            min="1"
            max="3660"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <label>
          Ritmo
          <select
            value={pace}
            onChange={(e) => setPace(e.target.value as PlanOptions["pace"])}
          >
            <option value="relaxed">Tranquilo · até 3 lugares por dia</option>
            <option value="balanced">
              Equilibrado · até 5 lugares por dia
            </option>
            <option value="intense">Intenso · até 7 lugares por dia</option>
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={maybe}
            onChange={(e) => setMaybe(e.target.checked)}
          />
          Incluir Talvez
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
            setMessage(
              next.activities.length
                ? "Prévia criada. Confira a distribuição."
                : "Salve lugares em Quero ir, ou inclua Talvez.",
            );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Não foi possível gerar.",
            );
          }
        }}
      >
        Criar prévia
      </button>
      {draft && (
        <div className="itinerary-preview">
          <h3>Sua proposta · {draft.activities.length} lugares</h3>
          {draft.warnings.map((w) => (
            <p className="subtle" key={w}>
              {w}
            </p>
          ))}
          {distance && distance.segments > 0 && (
            <p>
              {distance.km.toFixed(1)} km em linha reta entre pontos do mesmo
              dia. Não inclui ida/volta do hotel.
            </p>
          )}
          {draft.activities.map((a, index) => (
            <article className="stay-card" key={a.id}>
              <label>
                Atividade {index + 1}
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
                  Dia
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
                  Horário opcional
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
                  Período
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
                  Subir
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
                  Descer
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
                  Retirar da prévia
                </button>
              </div>
            </article>
          ))}
          {draft.unassigned.length > 0 && (
            <p>
              Fora da proposta: {draft.unassigned.map((p) => p.name).join(", ")}
              .
            </p>
          )}
          <p>
            As atividades atuais serão mantidas. Lugares já presentes no roteiro
            não serão adicionados novamente.
          </p>
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
                    setMessage("Todos estes lugares já estão no roteiro.");
                    return;
                  }
                  if (await onSave(next)) {
                    setDraft(undefined);
                    setMessage(
                      `${added} atividades adicionadas. Seu roteiro anterior foi preservado.`,
                    );
                  }
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Não foi possível salvar.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Aceitar e adicionar ao roteiro
            </button>
            <button
              className="secondary"
              disabled={pending}
              onClick={() => {
                setDraft(undefined);
                setMessage("Prévia descartada. Roteiro preservado.");
              }}
            >
              Descartar prévia
            </button>
          </div>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
