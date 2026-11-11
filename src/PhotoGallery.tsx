import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { Trip } from "./model";
import { chronologicalPhotos, removePhoto, type TripPhoto } from "./photos";
import { PrivatePhoto } from "./PrivatePhoto";
import { portableTrips } from "./backup";
import { supabase } from "./store";
import { dateLabel } from "./model";
import { TravelMap } from "./LazyMaps";
import "./photos.css";
export function PhotoGallery({
  trip,
  onSave,
  onFiles,
  busy,
  cloud,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  onFiles: (files: FileList | null) => Promise<void>;
  busy: boolean;
  cloud: boolean;
}) {
  const [album, setAlbum] = useState(""),
    [editing, setEditing] = useState<TripPhoto>(),
    [expanded, setExpanded] = useState<TripPhoto>(),
    [message, setMessage] = useState(""),
    [exporting, setExporting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    editDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);
  useEffect(() => {
    if (editing) editDialog.current?.showModal();
    else editDialog.current?.close();
  }, [editing]);
  const photos = chronologicalPhotos(trip.photos).filter(
    (p) => !album || (p.album || "Sem álbum") === album,
  );
  async function exportAlbum() {
    setExporting(true);
    try {
      const [copy] = await portableTrips(
        [{ ...trip, photos, documents: [] }],
        async (bucket, path) => {
          if (!supabase)
            throw new Error("Entre na conta para baixar as fotos.");
          const { data, error } = await supabase.storage
            .from(bucket)
            .download(path);
          if (error || !data)
            throw new Error(
              "Uma foto não pôde ser baixada. Tente novamente com internet.",
            );
          return data;
        },
      );
      const blob = new Blob(
        [JSON.stringify({ version: 1, trips: [copy] }, null, 2)],
        { type: "application/json" },
      );
      if (blob.size > 20 * 1024 * 1024)
        throw new Error("Este álbum excede 20 MB. Exporte álbuns menores.");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "gomes-album.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Álbum exportado em JSON, restaurável pelo Perfil.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>Os lugares pelos seus olhos</h2>
          <p>
            JPG, PNG ou WebP de até 15 MB, reduzidas para até 600 KB. Guarde os
            originais com você.
          </p>
          <p>
            {cloud
              ? "Fotos privadas da sua conta."
              : "Fotos neste navegador; exporte um backup para preservá-las."}
          </p>
        </div>
        <label className="secondary photo-upload">
          {tr("Adicionar fotos")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget;
              await onFiles(input.files);
              input.value = "";
            }}
          />
        </label>
      </div>
      <label>
        {tr("Álbum")}
        <select value={album} onChange={(e) => setAlbum(e.target.value)}>
          <option value="">{tr("Todas as fotos")}</option>
          {[...new Set(trip.photos.map((p) => p.album || "Sem álbum"))].map(
            (a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ),
          )}
        </select>
      </label>
      <div className="photo-grid enhanced-gallery">
        {photos.map((p) => (
          <figure key={p.id}>
            <button
              className="photo-open"
              aria-label={"Ampliar " + (p.caption || p.name)}
              onClick={() => setExpanded(p)}
            >
              <PrivatePhoto photo={p} />
            </button>
            <figcaption>
              <strong>{p.caption || p.name}</strong>
              <small>
                {[p.takenAt, p.location, p.album].filter(Boolean).join(" · ")}
              </small>
              <div className="tm-actions">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setEditing(p)}
                >
                  {tr("Editar detalhes")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (await onSave({ ...trip, coverPhotoId: p.id }))
                      setMessage("Capa da viagem atualizada.");
                  }}
                >
                  {trip.coverPhotoId === p.id
                    ? "Foto de capa"
                    : "Usar como capa"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      confirm(
                        "Remover esta foto da viagem? Guarde uma cópia antes.",
                      ) &&
                      (await onSave(removePhoto(trip, p.id)))
                    )
                      setMessage("Foto removida da viagem.");
                  }}
                >
                  {tr("Remover")}
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
      {!photos.length && (
        <p className="photo-empty">
          Seu álbum começa com a primeira foto. Adicione quando quiser.
        </p>
      )}
      <button
        className="secondary"
        disabled={busy || exporting || !photos.length}
        onClick={() => void exportAlbum()}
      >
        {exporting ? "Preparando álbum…" : "Exportar este álbum"}
      </button>
      <p role="status">{message}</p>
      <details className="retrospective">
        <summary>{tr("Retrospectiva da viagem")}</summary>
        <h2>{trip.title}</h2>
        <p>
          {trip.destination || tr("Destino em aberto")} · {dateLabel(trip)}
        </p>
        <p>
          {trip.photos.length} fotos ·{" "}
          {trip.activities.filter((a) => a.done).length} lugares visitados
        </p>
        <ul>
          {trip.activities
            .filter((a) => a.done)
            .map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
        </ul>
        {trip.notes && <p className="pre-wrap">{trip.notes}</p>}
        <TravelMap
          trips={[
            trip,
            ...trip.activities
              .filter((a) => a.done && a.coordinates)
              .map((a) => ({
                ...trip,
                id: a.id,
                title: a.title,
                destination: a.address,
                status: "past" as const,
                coordinates: a.coordinates,
              })),
          ]}
        />
      </details>
      <dialog
        ref={dialog}
        className="photo-dialog"
        onCancel={() => setExpanded(undefined)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setExpanded(undefined);
        }}
      >
        {expanded && (
          <>
            <button
              className="secondary"
              autoFocus
              onClick={() => setExpanded(undefined)}
            >
              {tr("Fechar foto")}
            </button>
            <PrivatePhoto photo={expanded} />
            <p>{expanded.caption || expanded.name}</p>
          </>
        )}
      </dialog>
      <dialog
        ref={editDialog}
        className="photo-edit-dialog"
        onCancel={() => setEditing(undefined)}
      >
        {editing && (
          <form
            key={editing.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const next = {
                ...editing,
                caption: String(f.get("caption") || ""),
                takenAt: String(f.get("takenAt") || ""),
                location: String(f.get("location") || ""),
                album: String(f.get("album") || ""),
                activityId: String(f.get("activityId") || "") || undefined,
              };
              if (
                await onSave({
                  ...trip,
                  photos: trip.photos.map((p) =>
                    p.id === editing.id ? next : p,
                  ),
                })
              ) {
                setEditing(undefined);
                setMessage("Detalhes da foto salvos.");
              }
            }}
          >
            <h2>Detalhes da foto</h2>
            <label>
              {tr("Legenda")}
              <input autoFocus name="caption" defaultValue={editing.caption} />
            </label>
            <label>
              {tr("Data opcional")}
              <input
                name="takenAt"
                type="date"
                defaultValue={editing.takenAt}
              />
            </label>
            <label>
              {tr("Local opcional")}
              <input name="location" defaultValue={editing.location} />
            </label>
            <label>
              {tr("Álbum")}
              <input
                name="album"
                defaultValue={editing.album}
                placeholder="Família, passeios, gastronomia…"
              />
            </label>
            <label>
              {tr("Passeio vinculado")}
              <select name="activityId" defaultValue={editing.activityId || ""}>
                <option value="">{tr("Sem vínculo")}</option>
                {trip.activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="tm-actions">
              <button className="primary" disabled={busy}>
                {tr("Salvar detalhes")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                {tr("Cancelar")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
