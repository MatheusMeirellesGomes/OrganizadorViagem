import { useRef, useState } from "react";
import type { Trip } from "./model";
import { uid } from "./model";
import { supabase } from "./store";
import { documentBucket, readDocument, downloadDocument } from "./documents";
export function DocumentsPanel({
  trip,
  onSave,
  userId,
  busy,
}: {
  trip: Trip;
  onSave: (t: Trip) => Promise<boolean>;
  userId?: string;
  busy: boolean;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="panel">
      <h2>Documentos da viagem</h2>
      <p>
        Ingressos e comprovantes em PDF, JPG, PNG ou WebP. Até 1 MB por arquivo.
      </p>
      <p className="subtle">
        {userId
          ? "Arquivos privados da sua conta. Para baixar, é necessária uma conexão."
          : "Guardados somente neste navegador, acessíveis a quem usar este perfil do aparelho. Incluídos no backup JSON."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending || busy) return;
          const f = new FormData(e.currentTarget),
            file = input.current?.files?.[0];
          if (!file) return;
          setPending(true);
          setMessage("");
          try {
            const data = await readDocument(file),
              id = uid();
            let url = data;
            if (userId && supabase) {
              url = `${userId}/${trip.id}/${id}`;
              const { error } = await supabase.storage
                .from(documentBucket)
                .upload(url, file, { contentType: file.type, upsert: false });
              if (error)
                throw new Error(
                  "Não foi possível enviar. Confira a conexão e a configuração do armazenamento privado.",
                );
            }
            const saved = await onSave({
              ...trip,
              documents: [
                ...(trip.documents || []),
                {
                  id,
                  name: file.name,
                  mime: file.type,
                  size: file.size,
                  url,
                  reservationId:
                    String(f.get("reservation") || "") || undefined,
                },
              ],
            });
            if (saved) {
              setMessage("Documento salvo.");
              if (input.current) input.current.value = "";
            } else if (userId && supabase) {
              await supabase.storage.from(documentBucket).remove([url]);
              setMessage("Não foi possível salvar o documento na viagem.");
            }
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Arquivo
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={pending || busy}
          />
        </label>
        <label>
          Reserva vinculada
          <select name="reservation" disabled={pending || busy}>
            <option value="">Documento geral</option>
            {trip.reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title || "Reserva"}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" disabled={pending || busy}>
          {pending ? "Salvando…" : "Anexar documento"}
        </button>
      </form>
      {(trip.documents || []).map((d) => (
        <article className="stay-card" key={d.id}>
          <h3>{d.name}</h3>
          <p>
            {Math.ceil(d.size / 1024)} KB ·{" "}
            {d.reservationId
              ? trip.reservations.find((r) => r.id === d.reservationId)
                  ?.title || "Reserva não disponível"
              : "Documento geral"}
          </p>
          <div className="tm-actions">
            <button
              className="secondary"
              disabled={pending || busy}
              onClick={async () => {
                setPending(true);
                try {
                  if (d.url.startsWith("data:")) downloadDocument(d, d.url);
                  else if (supabase && userId) {
                    const { data, error } = await supabase.storage
                      .from(documentBucket)
                      .download(d.url);
                    if (error || !data)
                      throw new Error(
                        "Arquivo indisponível. Verifique sua conexão e conta.",
                      );
                    const url = URL.createObjectURL(data);
                    downloadDocument(d, url);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } else
                    throw new Error(
                      "Entre na conta de origem para acessar este arquivo.",
                    );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Não foi possível baixar.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Baixar
            </button>
            <button
              className="secondary"
              disabled={pending || busy}
              onClick={async () => {
                if (
                  !confirm(
                    "Remover o documento desta viagem? Guarde uma cópia antes.",
                  )
                )
                  return;
                setPending(true);
                try {
                  if (
                    await onSave({
                      ...trip,
                      documents: (trip.documents || []).filter(
                        (x) => x.id !== d.id,
                      ),
                    })
                  )
                    setMessage("Documento removido desta viagem.");
                } finally {
                  setPending(false);
                }
              }}
            >
              Remover
            </button>
          </div>
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  );
}
