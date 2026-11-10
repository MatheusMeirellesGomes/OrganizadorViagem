import { useState } from "react";
import { BedDouble, MapPin, Plus } from "lucide-react";
import { type Trip, type Stay, uid } from "./model";
import { removeStay, stayFromForm, stayDirections } from "./stays";
import { safeExternalUrl } from "./travel-mode";
export function StaysPanel({
  trip,
  onSave,
  busy,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<Partial<Stay> | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || busy) return;
    setPending(true);
    try {
      const stay = stayFromForm(
        new FormData(e.currentTarget),
        editing?.id || uid(),
      );
      if (
        await onSave({
          ...trip,
          stays: [...(trip.stays || []).filter((s) => s.id !== stay.id), stay],
        })
      ) {
        setEditing(null);
        setMessage("Hospedagem salva.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel stays-panel">
      <div className="section-head">
        <div>
          <h2>Onde vamos ficar?</h2>
          <p>Uma ou várias paradas. Todos os detalhes são opcionais.</p>
        </div>
        <button
          className="secondary"
          disabled={busy || pending}
          onClick={() => setEditing({})}
        >
          <Plus size={16} />
          Hospedagem
        </button>
      </div>
      {trip.hotel && (
        <p className="legacy-stay">
          <b>Hospedagem já cadastrada</b>
          <br />
          {trip.hotel}
        </p>
      )}
      {!(trip.stays || []).length && !editing && (
        <p className="subtle">
          Adicione hotéis, pousadas, casas ou qualquer lugar onde vai ficar.
        </p>
      )}
      {(trip.stays || []).map((s) => (
        <article className="stay-card" key={s.id}>
          <h3>
            <BedDouble size={18} />
            {s.name}
          </h3>
          <p>{[s.address, s.city].filter(Boolean).join(" · ")}</p>
          <p>
            Entrada: {s.start || "Em aberto"} {s.checkInTime} · Saída:{" "}
            {s.end || "Em aberto"} {s.checkOutTime}
          </p>
          {s.notes && <p className="pre-wrap">{s.notes}</p>}
          {s.confirmation && (
            <details>
              <summary>Código de confirmação</summary>
              <p>{s.confirmation}</p>
            </details>
          )}
          <div className="tm-actions">
            {stayDirections(s) && (
              <a
                className="secondary"
                href={stayDirections(s)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={16} />
                Como chegar
              </a>
            )}
            {safeExternalUrl(s.url) && (
              <a
                className="secondary"
                href={safeExternalUrl(s.url)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir reserva
              </a>
            )}
            <button
              className="secondary"
              disabled={busy || pending}
              onClick={() => setEditing(s)}
            >
              Editar
            </button>
            <button
              className="secondary"
              disabled={busy || pending}
              onClick={async () => {
                if (
                  !confirm(
                    "Excluir esta hospedagem? As reservas serão preservadas, sem o vínculo.",
                  )
                )
                  return;
                setPending(true);
                try {
                  if (await onSave(removeStay(trip, s.id))) {
                    if (editing?.id === s.id) setEditing(null);
                    setMessage("Hospedagem excluída; reservas preservadas.");
                  }
                } finally {
                  setPending(false);
                }
              }}
            >
              Excluir
            </button>
          </div>
        </article>
      ))}
      {editing && (
        <form className="stay-form" key={editing.id || "new"} onSubmit={submit}>
          <h3>{editing.id ? "Editar hospedagem" : "Nova hospedagem"}</h3>
          <div className="form-grid">
            {(
              [
                "name",
                "city",
                "address",
                "start",
                "end",
                "checkInTime",
                "checkOutTime",
                "url",
                "confirmation",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    name: "Nome",
                    city: "Cidade",
                    address: "Endereço",
                    start: "Check-in",
                    end: "Check-out",
                    checkInTime: "Horário de entrada",
                    checkOutTime: "Horário de saída",
                    url: "Link da reserva",
                    confirmation: "Código de confirmação",
                  }[key]
                }
                <input
                  name={key}
                  type={
                    key === "start" || key === "end"
                      ? "date"
                      : key.endsWith("Time")
                        ? "time"
                        : key === "url"
                          ? "url"
                          : "text"
                  }
                  defaultValue={editing[key]}
                />
              </label>
            ))}
            <label>
              Latitude
              <input
                name="lat"
                type="number"
                step="any"
                min="-90"
                max="90"
                defaultValue={editing.coordinates?.lat}
              />
            </label>
            <label>
              Longitude
              <input
                name="lng"
                type="number"
                step="any"
                min="-180"
                max="180"
                defaultValue={editing.coordinates?.lng}
              />
            </label>
          </div>
          <label>
            Observações
            <textarea name="notes" defaultValue={editing.notes} />
          </label>
          <div className="tm-actions">
            <button className="primary" disabled={busy || pending}>
              Salvar hospedagem
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
export function ReservationLinks({
  trip,
  reservationId,
  onSave,
  busy,
}: {
  trip: Trip;
  reservationId: string;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
}) {
  const r = trip.reservations.find((r) => r.id === reservationId)!;
  return (
    <div className="form-grid reservation-links">
      <label>
        Atividade vinculada
        <select
          aria-label={"Atividade de " + r.title}
          value={r.activityId || ""}
          disabled={busy}
          onChange={(e) =>
            void onSave({
              ...trip,
              reservations: trip.reservations.map((x) =>
                x.id === r.id
                  ? { ...x, activityId: e.target.value || undefined }
                  : x,
              ),
            })
          }
        >
          <option value="">Sem vínculo</option>
          {trip.activities.map((a) => (
            <option key={a.id} value={a.id}>
              Dia {a.day} · {a.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Hospedagem vinculada
        <select
          aria-label={"Hospedagem de " + r.title}
          value={r.stayId || ""}
          disabled={busy}
          onChange={(e) =>
            void onSave({
              ...trip,
              reservations: trip.reservations.map((x) =>
                x.id === r.id
                  ? { ...x, stayId: e.target.value || undefined }
                  : x,
              ),
            })
          }
        >
          <option value="">Sem vínculo</option>
          {(trip.stays || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
