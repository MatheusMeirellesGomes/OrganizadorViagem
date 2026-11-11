import { getLocale } from "./i18n";
import { t as tr } from "./i18n";
import { validTimeZone } from "./travel-clock";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Users } from "lucide-react";
import type { Trip } from "./model";
import { dayLabel, travelDays } from "./travel-mode";
import {
  activityPeriod,
  calendarCells,
  optionalCount,
  periods,
  type Period,
} from "./calendar";
import "./extensions.css";
export function TripCalendar({
  trip,
  day,
  onDayChange,
  onOpenDay,
  onSave,
  busy,
}: {
  trip: Trip;
  day: number;
  onDayChange: (n: number) => void;
  onOpenDay: () => void;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
}) {
  const [month, setMonth] = useState(() => {
      const d = trip.start ? new Date(trip.start + "T12:00:00Z") : new Date();
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }),
    [message, setMessage] = useState("");
  const activities = trip.activities.filter((a) => a.day === day);
  return (
    <div className="extension-grid">
      <section className="panel">
        <h2>{tr("Fuso horário opcional")}</h2>
        <p>
          Usado para identificar o dia atual no Modo Viagem. Sem configuração,
          usamos o fuso do aparelho. Os horários que você cadastrou continuam
          como foram informados.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const timeZone = String(
              new FormData(e.currentTarget).get("timeZone") || "",
            ).trim();
            if (!validTimeZone(timeZone)) {
              setMessage(
                "Fuso inválido. Use um identificador como Europe/Lisbon.",
              );
              return;
            }
            if (await onSave({ ...trip, timeZone: timeZone || undefined }))
              setMessage("Fuso atualizado.");
          }}
        >
          <label>
            {tr("Fuso da viagem")}
            <input
              name="timeZone"
              list="trip-time-zones"
              defaultValue={trip.timeZone}
              placeholder="Usar fuso do aparelho"
            />
          </label>
          <datalist id="trip-time-zones">
            {[
              "America/Sao_Paulo",
              "America/Manaus",
              "Europe/Lisbon",
              "Europe/Madrid",
              "America/New_York",
              "Asia/Tokyo",
            ].map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <button className="secondary" disabled={busy}>
            {tr("Salvar fuso")}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Calendário da viagem</h2>
            <p>Datas ajudam a visualizar. Continuam opcionais.</p>
          </div>
          <CalendarDays size={22} />
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              start = String(f.get("start") || ""),
              end = String(f.get("end") || "");
            if (start && end && end < start) {
              setMessage("A volta precisa ser igual ou posterior à ida.");
              return;
            }
            if (await onSave({ ...trip, start, end })) {
              setMessage(
                "Datas atualizadas. A sequência das atividades foi preservada.",
              );
              if (start)
                setMonth(new Date(start.slice(0, 7) + "-01T12:00:00Z"));
            }
          }}
        >
          <div className="form-grid">
            <label>
              {tr("Ida")}
              <input name="start" type="date" defaultValue={trip.start} />
            </label>
            <label>
              {tr("Volta")}
              <input name="end" type="date" defaultValue={trip.end} />
            </label>
          </div>
          <button className="secondary" disabled={busy}>
            {tr("Salvar datas")}
          </button>
        </form>
        {trip.start ? (
          <>
            <div className="month-nav">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() =>
                  setMonth(
                    new Date(
                      Date.UTC(
                        month.getUTCFullYear(),
                        month.getUTCMonth() - 1,
                        1,
                      ),
                    ),
                  )
                }
              >
                <ArrowLeft size={18} />
              </button>
              <h3>
                {month.toLocaleDateString(getLocale(), {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </h3>
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() =>
                  setMonth(
                    new Date(
                      Date.UTC(
                        month.getUTCFullYear(),
                        month.getUTCMonth() + 1,
                        1,
                      ),
                    ),
                  )
                }
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="month-grid">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <small key={d}>{d}</small>
              ))}
              {calendarCells(
                month.getUTCFullYear(),
                month.getUTCMonth(),
                trip,
              ).map((c) => (
                <button
                  key={c.iso}
                  disabled={!c.day}
                  className={`${c.inMonth ? "" : "muted"} ${c.day === day ? "selected" : ""}`}
                  aria-label={`${c.iso}${c.day ? ", dia " + c.day : ""}`}
                  aria-pressed={c.day === day}
                  onClick={() => c.day && onDayChange(c.day)}
                >
                  <b>{c.date}</b>
                  {c.day && (
                    <small>
                      {trip.activities.filter((a) => a.day === c.day).length ||
                        "Livre"}
                    </small>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="days">
            {travelDays(trip, day).map((n) => (
              <button
                key={n}
                onClick={() => onDayChange(n)}
                className={n === day ? "selected" : ""}
              >
                {tr("Dia")}
                {n}
              </button>
            ))}
          </div>
        )}
        <h3>{dayLabel(trip, day).full}</h3>
        {(Object.keys(periods) as Period[]).map((period) => {
          const items = activities.filter((a) => activityPeriod(a) === period);
          return items.length ? (
            <section className="period-list" key={period}>
              <h4>{tr(periods[period])}</h4>
              {items.map((a) => (
                <p key={a.id}>
                  {a.time || tr("Sem horário")} · {a.title}
                </p>
              ))}
            </section>
          ) : null;
        })}
        {!activities.length && (
          <p className="subtle">Dia livre. Nenhuma atividade cadastrada.</p>
        )}
        <button className="secondary" onClick={onOpenDay}>
          Abrir este dia no roteiro
          <ArrowRight size={16} />
        </button>
        <p role="status">{message}</p>
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>Quem vai com você?</h2>
          <Users size={22} />
        </div>
        <p>
          Preencha só o que ajudar a planejar. Não precisamos de documentos ou
          dados sensíveis.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await onSave({
                ...trip,
                party: {
                  adults: optionalCount(f.get("adults")),
                  children: optionalCount(f.get("children")),
                  members: String(f.get("members") || "")
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  preferences: String(f.get("preferences") || ""),
                },
              })
            )
              setMessage("Grupo atualizado.");
          }}
        >
          <div className="form-grid">
            <label>
              {tr("Adultos")}
              <input
                type="number"
                min="0"
                max="999"
                name="adults"
                defaultValue={trip.party?.adults}
              />
            </label>
            <label>
              {tr("Crianças")}
              <input
                type="number"
                min="0"
                max="999"
                name="children"
                defaultValue={trip.party?.children}
              />
            </label>
          </div>
          <label>
            Apelidos ou nomes · um por linha
            <textarea
              name="members"
              defaultValue={trip.party?.members?.join("\n")}
              rows={3}
            />
          </label>
          <label>
            Preferências do grupo
            <textarea
              name="preferences"
              defaultValue={trip.party?.preferences}
              placeholder="Ritmo tranquilo, pausas, interesses…"
            />
          </label>
          <button className="primary full" disabled={busy}>
            {tr("Salvar grupo")}
          </button>
        </form>
      </section>
    </div>
  );
}
