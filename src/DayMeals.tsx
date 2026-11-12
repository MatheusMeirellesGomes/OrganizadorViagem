import { useState } from "react";
import { Utensils, Route } from "lucide-react";
import { t as tr, tf } from "./i18n";
import type { Trip } from "./model";
import { mealAnchor, mealKinds, mealNames, mealTime, waySegments, type MealKind } from "./meals";
import { MealFinder } from "./LazyMaps";
import type { MealRequest } from "./explore/MealFinder";

/** "Encontrar almoço próximo" and friends, below the activities of a day (Fase 3). */
export function DayMeals({ trip, day, onSave, busy }: { trip: Trip; day: number; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [request, setRequest] = useState<MealRequest>(),
    [message, setMessage] = useState("");
  const segments = waySegments(trip, day);
  function find(meal: MealKind) {
    const time = mealTime(trip, meal);
    const anchor = mealAnchor(trip, day, time);
    if (!anchor) return setMessage(tr("Adicione um lugar com localização ou a hospedagem do dia para buscar restaurantes por perto."));
    setMessage("");
    setRequest({ day, meal, time, near: anchor.point, nearName: anchor.name });
  }
  return (
    <div className="day-meals">
      <h3>
        <Utensils size={16} aria-hidden="true" /> {tr("Refeições do dia")}
      </h3>
      <div className="chip-row wrap">
        <button className="chip" onClick={() => find("lunch")}>{tr("Encontrar almoço próximo")}</button>
        <button className="chip" onClick={() => find("dinner")}>{tr("Encontrar jantar próximo")}</button>
        <details className="day-meals-more">
          <summary className="chip">{tr("Outras refeições")}</summary>
          <div className="chip-row wrap">
            {mealKinds.filter((m) => m !== "lunch" && m !== "dinner").map((m) => (
              <button key={m} className="chip" onClick={() => find(m)}>
                {tr(mealNames[m])} · {mealTime(trip, m)}
              </button>
            ))}
          </div>
        </details>
        {segments.map((s) => (
          <button
            key={s.from.id + s.to.id}
            className="chip"
            onClick={() => {
              const at = s.from.time || mealTime(trip, "lunch");
              setRequest({ day, meal: "lunch", time: at, near: s.center, nearName: tf("{a} → {b}", { a: s.from.title, b: s.to.title }), radius: s.radius });
            }}
          >
            <Route size={14} aria-hidden="true" /> {tf("No caminho: {a} → {b}", { a: s.from.title, b: s.to.title })}
          </button>
        ))}
      </div>
      <details>
        <summary>{tr("Horários preferidos das refeições")}</summary>
        <div className="planner-meals">
          {mealKinds.map((m) => (
            <label key={m} className="planner-meal">
              {tr(mealNames[m])}
              <input
                type="time"
                value={mealTime(trip, m)}
                onChange={(e) => e.target.value && onSave({ ...trip, mealTimes: { ...trip.mealTimes, [m]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      </details>
      <p role="status" className="muted">{message}</p>
      {request && <MealFinder trip={trip} request={request} onSave={onSave} busy={busy} onClose={() => setRequest(undefined)} />}
    </div>
  );
}
