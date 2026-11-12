import { tf } from "./i18n";
import { t as tr } from "./i18n";
import { ItineraryBuilder } from "./ItineraryBuilder";
import { useRef, useState } from "react";
import { uid, type Trip } from "./model";
import {
  type SavedPlace,
  choosePlace,
  undoChoice,
  decisionLabels,
  swipeDecision,
} from "./choices";
import { ChoiceButtons } from "./ChoiceButtons";
import { addPlaceToTrip } from "./food";
import { TravelMap } from "./LazyMaps";
import { validPoint } from "./places";
export function SavedPlaces({
  trip,
  onSave,
  busy,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  busy: boolean;
}) {
  const [filter, setFilter] = useState("all"),
    [message, setMessage] = useState(""),
    [day, setDay] = useState(1),
    [pending, setPending] = useState(false);
  const start = useRef<{ x: number; y: number; id: string } | undefined>(
    undefined,
  );
  const choices = (trip.placeChoices || []).filter(
    (c) => filter === "all" || c.decision === filter,
  );
  async function save(next: Trip, text: string) {
    if (pending || busy) return;
    setPending(true);
    try {
      if (await onSave(next)) setMessage(text);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <ItineraryBuilder trip={trip} onSave={onSave} busy={busy || pending} />
      <section className="panel">
        <h2>{tr("Seus lugares, suas escolhas")}</h2>
        <p>{tr("Salve ideias antes de decidir o dia. Deslize um cartão para a direita para “Quero ir”, ou para a esquerda para “Passar”. Os botões fazem o mesmo.")}</p>
        <details>
          <summary>{tr("Adicionar um lugar por conta própria")}</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form),
                lat = String(f.get("lat") || ""),
                lng = String(f.get("lng") || "");
              const coordinates =
                lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined;
              if ((lat || lng) && (!coordinates || !validPoint(coordinates))) {
                setMessage(
                  tr("Informe coordenadas válidas juntas ou deixe ambas vazias."),
                );
                return;
              }
              const place: SavedPlace = {
                id: "manual:" + uid(),
                name: String(f.get("name") || tr("Lugar sem nome")),
                address: String(f.get("address") || ""),
                city: "",
                country: "",
                category: "other",
                source: "",
                retrievedAt: new Date().toISOString(),
                tags: {},
                coordinates,
              };
              await save(
                choosePlace(trip, place, "want"),
                "Lugar salvo na lista Quero ir.",
              );
            }}
          >
            <label>
              {tr("Nome")}
              <input name="name" />
            </label>
            <label>
              {tr("Endereço")}
              <input name="address" />
            </label>
            <div className="form-grid">
              <label>
                {tr("Latitude opcional")}
                <input type="number" step="any" min="-90" max="90" name="lat" />
              </label>
              <label>
                {tr("Longitude opcional")}
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  name="lng"
                />
              </label>
            </div>
            <button className="secondary" disabled={busy || pending}>
              {tr("Salvar lugar")}
            </button>
          </form>
        </details>
        <div className="catalog-filters">
          <label>
            {tr("Mostrar")}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{tr("Todas as decisões")}</option>
              {Object.entries(decisionLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {tr(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Adicionar ao dia")}
            <input
              type="number"
              min="1"
              max="3660"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </label>
        </div>
        <p role="status">{tr(message)}</p>
      </section>
      <div className="catalog-grid">
        {choices.map((c) => (
          <article
            className="panel place-card swipe-card"
            key={c.place.id}
            onPointerDown={(e) => {
              if (
                e.target instanceof Element &&
                e.target.closest("button,a,input,select")
              )
                return;
              start.current = { x: e.clientX, y: e.clientY, id: c.place.id };
            }}
            onPointerCancel={() => {
              start.current = undefined;
            }}
            onPointerUp={(e) => {
              const s = start.current;
              start.current = undefined;
              if (!s || s.id !== c.place.id) return;
              const d = swipeDecision(e.clientX - s.x, e.clientY - s.y);
              if (d)
                void save(
                  choosePlace(trip, c.place, d),
                  tf("{decision} salvo.", { decision: tr(decisionLabels[d]) }),
                );
            }}
          >
            <span className="eyebrow">{tr(decisionLabels[c.decision])}</span>
            <h3>{c.place.name}</h3>
            <p>{c.place.address || tr("Endereço em aberto")}</p>
            <ChoiceButtons
              value={c.decision}
              disabled={busy || pending}
              onChoose={(d) =>
                void save(
                  choosePlace(trip, c.place, d),
                  tf("{decision} salvo.", { decision: tr(decisionLabels[d]) }),
                )
              }
            />
            <div className="tm-actions">
              <button
                className="secondary"
                disabled={busy || pending}
                onClick={() => {
                  try {
                    void save(
                      addPlaceToTrip(trip, c.place, day),
                      "Lugar adicionado ao roteiro.",
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : tr("Confira o dia."),
                    );
                  }
                }}
              >
                {tr("Adicionar ao roteiro")}
              </button>
              <button
                className="text-button"
                disabled={busy || pending}
                onClick={() => {
                  if (
                    confirm(
                      tr("Desfazer esta decisão e retirar o lugar da lista? Atividades do roteiro serão preservadas."),
                    )
                  )
                    void save(
                      undoChoice(trip, c.place.id),
                      "Decisão desfeita.",
                    );
                }}
              >
                {tr("Desfazer decisão")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!choices.length && (
        <p className="panel">{tr("Nenhum lugar nesta lista. Adicione uma ideia ou escolha lugares em Explorar.")}</p>
      )}
      <section className="panel">
        <h2>{tr("Lugares no mapa")}</h2>
        <TravelMap
          trips={choices
            .filter((c) => c.decision !== "skip" && c.place.coordinates)
            .map((c) => ({
              ...trip,
              id: c.place.id,
              title: c.place.name,
              destination: c.place.address,
              coordinates: c.place.coordinates,
              status: c.decision === "visited" ? "past" : "planning",
            }))}
        />
        <p className="subtle">{tr("Somente lugares com coordenadas. Itens marcados como Passar ficam fora do mapa.")}</p>
      </section>
    </>
  );
}
