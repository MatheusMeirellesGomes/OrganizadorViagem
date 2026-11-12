import { useEffect, useState } from "react";
import { Users, Link2, Copy, X, Sparkles, Send } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t as tr, tf, getLocale } from "./i18n";
import type { Trip } from "./model";
import { createInvite, listInvites, listMembers, removeMember, revokeInvite, roleIn, roleLabels, setMemberRole, type Invite, type Member } from "./sharing";
import { askAssistant, assistantEnabled, AssistantError } from "./assistant";
import { addToItinerary } from "./explore/trip";
import type { AssistantAnswer } from "../supabase/functions/_shared/assistant";
import { wikiLanguage } from "./catalog-service";

/** People of a trip and invites (Etapa 15). Shown only with an account. */
export function SharePanel({ client, trip, userId, ownerId }: { client: SupabaseClient; trip: Trip; userId: string; ownerId?: string }) {
  const [members, setMembers] = useState<Member[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [link, setLink] = useState(""),
    [role, setRole] = useState<"editor" | "viewer">("editor"),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false);
  const mine = roleIn(ownerId, userId, members);
  const owner = mine === "owner";
  async function load() {
    try {
      setMembers(await listMembers(client, trip.id));
      if (ownerId === undefined || ownerId === userId) setInvites(await listInvites(client, trip.id));
      setReady(true);
    } catch {
      setMessage(tr("O compartilhamento ainda não está ativo no servidor (migração 003)."));
    }
  }
  useEffect(() => {
    void load();
  }, [trip.id]);
  return (
    <section className="panel share-panel">
      <h2><Users size={20} aria-hidden="true" /> {tr("Pessoas da viagem")}</h2>
      <p className="muted">{tr("Convide quem vai com você. Quem pode editar muda o roteiro; quem só visualiza acompanha. Fotos e documentos privados continuam só seus.")}</p>
      {mine && mine !== "owner" && <p className="share-role">{tf("Seu acesso: {role}", { role: tr(roleLabels[mine]) })}</p>}
      {ready && (
        <ul className="plain-list share-list">
          <li><strong>{tr("Dono")}</strong>{ownerId === userId || !ownerId ? " · " + tr("você") : ""}</li>
          {members.map((m) => (
            <li key={m.userId}>
              <span>{m.email ?? tr("Participante")}{m.userId === userId ? " · " + tr("você") : ""}</span>
              {owner ? (
                <select aria-label={tf("Acesso de {name}", { name: m.email ?? tr("Participante") })} value={m.role} onChange={async (e) => { await setMemberRole(client, trip.id, m.userId, e.target.value as Member["role"]); void load(); }}>
                  <option value="editor">{tr(roleLabels.editor)}</option>
                  <option value="viewer">{tr(roleLabels.viewer)}</option>
                </select>
              ) : (
                <span className="muted">{tr(roleLabels[m.role])}</span>
              )}
              {(owner || m.userId === userId) && (
                <button className="text-button" onClick={async () => { await removeMember(client, trip.id, m.userId); setMessage(m.userId === userId ? tr("Você saiu da viagem.") : tr("Pessoa removida.")); void load(); }}>
                  {m.userId === userId ? tr("Sair da viagem") : tr("Remover")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {owner && ready && (
        <div className="share-invite">
          <label>
            {tr("Novo convite")}
            <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}>
              <option value="editor">{tr(roleLabels.editor)}</option>
              <option value="viewer">{tr(roleLabels.viewer)}</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={async () => {
              try {
                const r = await createInvite(client, trip.id, role, userId);
                setLink(r.link);
                setMessage(tr("Convite criado. Ele vale por 7 dias e pode ser usado uma vez."));
                void load();
              } catch {
                setMessage(tr("Não foi possível criar o convite agora."));
              }
            }}
          >
            <Link2 size={16} /> {tr("Criar link de convite")}
          </button>
          {link && (
            <div className="share-link">
              <input readOnly value={link} aria-label={tr("Link do convite")} onFocus={(e) => e.currentTarget.select()} />
              <button className="secondary" onClick={() => navigator.clipboard?.writeText(link).then(() => setMessage(tr("Link copiado.")), () => setMessage(tr("Selecione o link para copiar.")))}>
                <Copy size={16} /> {tr("Copiar")}
              </button>
            </div>
          )}
          {invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date()).length > 0 && (
            <ul className="plain-list">
              {invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date()).map((i) => (
                <li key={i.id}>
                  {tf("Convite pendente ({role}) até {date}", { role: tr(roleLabels[i.role]), date: new Date(i.expiresAt).toLocaleDateString(getLocale()) })}{" "}
                  <button className="text-button" onClick={async () => { await revokeInvite(client, i.id); void load(); }}><X size={14} /> {tr("Cancelar convite")}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p role="status" className="muted">{message}</p>
    </section>
  );
}

/** Optional AI suggestions for the itinerary (Etapa 15). Nothing changes without a click. */
export function AssistantPanel({ client, trip, onSave, busy }: { client: SupabaseClient; trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<AssistantAnswer>(),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  if (!assistantEnabled) return null;
  const saved = (trip.placeChoices ?? []).map((c) => c.place);
  return (
    <section className="panel assistant-panel">
      <h2><Sparkles size={20} aria-hidden="true" /> {tr("Assistente de roteiro (beta)")}</h2>
      <p className="muted">{tr("Envia só o destino, as datas, o roteiro e os lugares salvos. Códigos de reserva, documentos, fotos, gastos e nomes não são enviados.")}</p>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setMessage("");
          try {
            setAnswer(await askAssistant(client, trip.id, question, wikiLanguage(), saved.map((p) => p.id)));
          } catch (err) {
            setMessage(err instanceof AssistantError ? tr(err.message) : tr("O assistente não respondeu agora. Tente novamente."));
          } finally {
            setLoading(false);
          }
        }}
      >
        <input value={question} maxLength={600} onChange={(e) => setQuestion(e.target.value)} placeholder={tr("Ex.: Como organizo os museus em dois dias?")} aria-label={tr("Pergunta para o assistente")} />
        <button className="primary" disabled={loading || question.trim().length < 3}><Send size={16} /> {loading ? tr("Pensando…") : tr("Perguntar")}</button>
      </form>
      {answer && (
        <div className="assistant-answer">
          {answer.answer && <p>{answer.answer}</p>}
          <ul className="plain-list">
            {answer.suggestions.map((s, i) => {
              const place = saved.find((p) => p.id === s.placeId);
              return (
                <li key={i}>
                  <strong>{s.title}</strong>
                  {s.day && " · " + tf("Dia {number}", { number: s.day })}
                  {s.reason && <span className="muted"> · {s.reason}</span>}
                  {place && s.day ? (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          if (await onSave(addToItinerary(trip, place, { day: s.day! }))) setMessage(tf("{name} adicionado ao dia {day}.", { name: place.name, day: s.day! }));
                        } catch (err) {
                          setMessage(err instanceof Error ? tr(err.message) : "");
                        }
                      }}
                    >
                      {tr("Adicionar ao roteiro")}
                    </button>
                  ) : (
                    !place && <span className="muted"> · {tr("ideia nova: confirme no Explorar")}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted">{tr("Sugestões geradas por IA. Confira horários e preços nas fontes oficiais.")}</p>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
