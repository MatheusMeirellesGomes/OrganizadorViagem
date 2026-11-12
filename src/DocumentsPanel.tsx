import { t as tr } from "./i18n";
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
      <h2>{tr("Documentos da viagem")}</h2>
      <p>{tr("Ingressos e comprovantes em PDF, JPG, PNG ou WebP. Até 1 MB por arquivo.")}</p>
      <p className="subtle">
        {userId
          ? tr("Arquivos privados da sua conta. Para baixar, é necessária uma conexão.")
          : tr("Guardados somente neste navegador, acessíveis a quem usar este perfil do aparelho. Incluídos no backup JSON.")}
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
                  tr("Não foi possível enviar. Confira a conexão e a configuração do armazenamento privado."),
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
              setMessage(tr("Documento salvo."));
              if (input.current) input.current.value = "";
            } else if (userId && supabase) {
              await supabase.storage.from(documentBucket).remove([url]);
              setMessage(tr("Não foi possível salvar o documento na viagem."));
            }
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : tr("Não foi possível salvar."),
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          {tr("Arquivo")}
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={pending || busy}
          />
        </label>
        <label>
          {tr("Reserva vinculada")}
          <select name="reservation" disabled={pending || busy}>
            <option value="">{tr("Documento geral")}</option>
            {trip.reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title || tr("Reserva")}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" disabled={pending || busy}>
          {pending ? tr("Salvando…") : tr("Anexar documento")}
        </button>
      </form>
      {(trip.documents || []).map((d) => (
        <article className="stay-card" key={d.id}>
          <h3>{d.name}</h3>
          <p>
            {Math.ceil(d.size / 1024)}{" "}{tr("KB ·")}{" "}
            {d.reservationId
              ? trip.reservations.find((r) => r.id === d.reservationId)
                  ?.title || tr("Reserva não disponível")
              : tr("Documento geral")}
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
                        tr("Arquivo indisponível. Verifique sua conexão e conta."),
                      );
                    const url = URL.createObjectURL(data);
                    downloadDocument(d, url);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } else
                    throw new Error(
                      tr("Entre na conta de origem para acessar este arquivo."),
                    );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : tr("Não foi possível baixar."),
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              {tr("Baixar")}
            </button>
            <button
              className="secondary"
              disabled={pending || busy}
              onClick={async () => {
                if (
                  !confirm(
                    tr("Remover o documento desta viagem? Guarde uma cópia antes."),
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
                    setMessage(tr("Documento removido desta viagem."));
                } finally {
                  setPending(false);
                }
              }}
            >
              {tr("Remover")}
            </button>
          </div>
        </article>
      ))}
      <p role="status">{tr(message)}</p>
    </section>
  );
}
