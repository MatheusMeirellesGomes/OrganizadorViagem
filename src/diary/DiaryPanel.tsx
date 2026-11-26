import { useState } from "react";
import { BookHeart, Camera, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import type { Trip } from "../model";
import { formatMoney, formatNumber, getLocale, t as tr, tf } from "../i18n";
import { PrivatePhoto } from "../PrivatePhoto";
import { countryName, flag } from "../profile/passport";
import { moods, removeEntry, retrospective, saveEntry, sortedJournal, toggleHighlight, type JournalEntry, type Mood } from "./diary";
import "./diary.css";

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function DiaryPanel({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean | void> | void; busy?: boolean }) {
  const today = localToday();
  const inTrip = trip.start && trip.end && today >= trip.start && today <= trip.end;
  const defaultDate = inTrip ? today : trip.start || today;
  const [editing, setEditing] = useState<JournalEntry | "new" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const journal = sortedJournal(trip);
  const finished = trip.status === "past" || (trip.end && trip.end < today);
  const retro = retrospective(trip);
  const byDate = new Map<string, JournalEntry[]>();
  for (const e of journal) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const photo = (id: string) => trip.photos.find((p) => p.id === id);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      const next = saveEntry(trip, {
        id: editing && editing !== "new" ? editing.id : undefined,
        date: String(f.get("date") || ""),
        title: String(f.get("title") || ""),
        text: String(f.get("text") || ""),
        mood: (String(f.get("mood") || "") || undefined) as Mood | undefined,
        photoIds: f.getAll("photo").map(String),
        highlight: editing && editing !== "new" ? editing.highlight : undefined,
      });
      if ((await onSave(next)) !== false) setEditing(null);
    } catch (err) {
      setError(tr((err as Error).message));
    }
  }

  const form = editing && (
    <form className="diary-form panel" onSubmit={submit} key={editing === "new" ? "new" : editing.id}>
      <div className="diary-form-head">
        <h3>{editing === "new" ? tr("Novo registro") : tr("Editar registro")}</h3>
        <button type="button" className="icon-button" aria-label={tr("Fechar")} onClick={() => setEditing(null)}>
          <X size={18} />
        </button>
      </div>
      <div className="diary-form-row">
        <label>
          {tr("Dia")}
          <input type="date" name="date" required defaultValue={editing === "new" ? defaultDate : editing.date} />
        </label>
        <label className="diary-title-field">
          {tr("Título (opcional)")}
          <input name="title" maxLength={120} defaultValue={editing === "new" ? "" : editing.title} placeholder={tr("Ex.: O pôr do sol no miradouro")} />
        </label>
      </div>
      <fieldset className="diary-moods">
        <legend>{tr("Como foi o dia?")}</legend>
        <label className="diary-mood">
          <input type="radio" name="mood" value="" defaultChecked={editing === "new" || !editing.mood} />
          <span>—</span>
          <small>{tr("Sem humor")}</small>
        </label>
        {(Object.keys(moods) as Mood[]).map((m) => (
          <label key={m} className="diary-mood">
            <input type="radio" name="mood" value={m} defaultChecked={editing !== "new" && editing.mood === m} />
            <span aria-hidden="true">{moods[m].emoji}</span>
            <small>{tr(moods[m].label)}</small>
          </label>
        ))}
      </fieldset>
      <label>
        {tr("O que aconteceu")}
        <textarea name="text" rows={6} maxLength={5000} defaultValue={editing === "new" ? "" : editing.text} placeholder={tr("Conte do seu jeito: lugares, sabores, pessoas, o que você não quer esquecer.")} />
      </label>
      {trip.photos.length > 0 && (
        <fieldset className="diary-photo-pick">
          <legend>
            <Camera size={15} aria-hidden="true" /> {tr("Fotos da viagem")}
          </legend>
          <div>
            {trip.photos.slice(0, 60).map((p) => (
              <label key={p.id} className="diary-photo-option">
                <input type="checkbox" name="photo" value={p.id} defaultChecked={editing !== "new" && editing.photoIds?.includes(p.id)} />
                <PrivatePhoto photo={p} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="diary-form-actions">
        <button type="button" className="secondary" onClick={() => setEditing(null)}>
          {tr("Cancelar")}
        </button>
        <button className="primary" disabled={busy}>
          {tr("Salvar registro")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="diary">
      {finished && (retro.places > 0 || retro.entries > 0 || retro.photos > 0) && (
        <section className="diary-retro" aria-labelledby="retro-title">
          <span className="diary-retro-label">{tr("Retrospectiva")}</span>
          <h2 id="retro-title">{trip.title}</h2>
          <ul className="diary-retro-numbers">
            {retro.days !== undefined && (
              <li>
                <strong>{formatNumber(retro.days)}</strong>
                <span>{retro.days === 1 ? tr("dia") : tr("dias")}</span>
              </li>
            )}
            <li>
              <strong>{formatNumber(retro.places)}</strong>
              <span>{retro.places === 1 ? tr("lugar visitado") : tr("lugares visitados")}</span>
            </li>
            <li>
              <strong>{formatNumber(retro.photos)}</strong>
              <span>{retro.photos === 1 ? tr("foto") : tr("fotos")}</span>
            </li>
            <li>
              <strong>{formatNumber(retro.entries)}</strong>
              <span>{retro.entries === 1 ? tr("registro no diário") : tr("registros no diário")}</span>
            </li>
          </ul>
          <div className="diary-retro-facts">
            {retro.countries.length > 0 && <span>{retro.countries.map((c) => `${flag(c)} ${countryName(c, getLocale())}`).join(" · ")}</span>}
            {retro.busiestDay && <span>{tf("Dia mais cheio: dia {day}, com {n} lugares", { day: retro.busiestDay.day, n: retro.busiestDay.count })}</span>}
            {retro.moods[0] && <span>{tf("Humor que mais apareceu: {emoji} {label}", { emoji: moods[retro.moods[0].mood].emoji, label: tr(moods[retro.moods[0].mood].label) })}</span>}
            {retro.spent.length > 0 && <span>{tr("Gasto registrado:")} {retro.spent.map((s) => formatMoney(s.amount, s.currency)).join(" + ")}</span>}
          </div>
          {retro.highlights.length > 0 && (
            <div className="diary-retro-highlights">
              <h3>{tr("Momentos favoritos")}</h3>
              <ul>
                {retro.highlights.slice(0, 6).map((h) => (
                  <li key={h.id}>
                    <b>{h.title || h.text.slice(0, 80)}</b>
                    <small>{longDate(h.date)}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="diary-head">
        <div>
          <h2>{tr("Diário de viagem")}</h2>
          <p>{tr("Um registro por dia, do seu jeito. Só você e quem participa da viagem veem.")}</p>
        </div>
        {!editing && (
          <button type="button" className="primary" onClick={() => setEditing("new")}>
            <Plus size={17} /> {tr("Escrever")}
          </button>
        )}
      </div>
      {form}

      {journal.length ? (
        <ol className="diary-days">
          {[...byDate].map(([date, entries]) => (
            <li key={date}>
              <h3 className="diary-date">{longDate(date)}</h3>
              <ul className="diary-entries">
                {entries.map((e) => (
                  <li key={e.id} className={"diary-entry" + (e.highlight ? " is-highlight" : "")}>
                    <header>
                      {e.mood && (
                        <span className="diary-entry-mood" title={tr(moods[e.mood].label)} aria-label={tr(moods[e.mood].label)}>
                          {moods[e.mood].emoji}
                        </span>
                      )}
                      {e.title && <b>{e.title}</b>}
                      <span className="diary-entry-actions">
                        <button type="button" className="icon-button" aria-pressed={!!e.highlight} aria-label={e.highlight ? tr("Tirar dos favoritos") : tr("Marcar como momento favorito")} disabled={busy} onClick={() => void onSave(toggleHighlight(trip, e.id))}>
                          <Star size={16} fill={e.highlight ? "currentColor" : "none"} />
                        </button>
                        <button type="button" className="icon-button" aria-label={tr("Editar registro")} onClick={() => setEditing(e)}>
                          <Pencil size={16} />
                        </button>
                        {confirm === e.id ? (
                          <button type="button" className="secondary small danger" disabled={busy} onClick={() => { void onSave(removeEntry(trip, e.id)); setConfirm(""); }}>
                            {tr("Apagar mesmo")}
                          </button>
                        ) : (
                          <button type="button" className="icon-button" aria-label={tr("Apagar registro")} onClick={() => setConfirm(e.id)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </span>
                    </header>
                    {e.text && <p>{e.text}</p>}
                    {e.photoIds?.length ? (
                      <div className="diary-entry-photos">
                        {e.photoIds.map((id) => {
                          const p = photo(id);
                          return p ? <PrivatePhoto key={id} photo={p} /> : null;
                        })}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        !editing && (
          <div className="diary-empty">
            <BookHeart size={30} aria-hidden="true" />
            <p>{tr("Nenhum registro ainda. Escreva sobre um dia da viagem, com fotos e como você se sentiu.")}</p>
          </div>
        )
      )}
    </div>
  );
}
