import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Eye, FileText, FolderCog, Lock, Search, Trash2, Upload, X } from "lucide-react";
import { t as tr, tf, getLocale } from "../i18n";
import { uid, type Trip, type TripDocument } from "../model";
import { supabase } from "../store";
import { documentBucket, downloadDocument, readDocument } from "../documents";
import { safeExternalUrl } from "../travel-mode";
import { dateOfDay } from "../planner";
import { SecretView } from "./SecretField";
import type { SecretStore } from "./secrets";
import { transportTitle } from "./transport";
import { vehicleName } from "./vehicles";
import { countByCategory, filterWallet, organizeDocument, walletCategories, walletItems, type WalletCategory, type WalletItem } from "./wallet";

const shortDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(getLocale(), { day: "2-digit", month: "short" });

/** Opens a document as a local blob URL (account files are downloaded privately first). */
async function blobUrl(d: TripDocument, userId?: string): Promise<string> {
  if (d.url.startsWith("data:")) {
    const res = await fetch(d.url);
    return URL.createObjectURL(await res.blob());
  }
  if (!supabase || !userId) throw new Error("Entre na conta de origem para acessar este arquivo.");
  const { data, error } = await supabase.storage.from(documentBucket).download(d.url);
  if (error || !data) throw new Error("Arquivo indisponível. Verifique sua conexão e conta.");
  return URL.createObjectURL(new Blob([data], { type: d.mime }));
}

function Preview({ doc, userId, onClose }: { doc: TripDocument; userId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    let made: string | undefined;
    blobUrl(doc, userId).then(
      (u) => setUrl((made = u)),
      (e) => setError(e.message),
    );
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [doc.id]);
  return (
    <dialog ref={dialog} className="journey-dialog wallet-preview" aria-labelledby="preview-title" onClose={onClose}>
      <header className="journey-dialog-head">
        <h2 id="preview-title">{doc.name}</h2>
        <button className="icon-button" onClick={() => dialog.current?.close()} aria-label={tr("Fechar")}>
          <X size={18} />
        </button>
      </header>
      <div className="wallet-preview-body">
        {error && <p role="alert">{tr(error)}</p>}
        {url && doc.mime.startsWith("image/") && <img src={url} alt={doc.name} />}
        {url && doc.mime === "application/pdf" && (
          <object data={url} type="application/pdf" aria-label={doc.name}>
            <p>{tr("Este navegador não mostra PDF aqui. Use Baixar.")}</p>
          </object>
        )}
        {!url && !error && <p className="muted">{tr("Abrindo…")}</p>}
      </div>
      <footer className="journey-dialog-foot">
        {url && (
          <button className="secondary" onClick={() => downloadDocument(doc, url)}>
            <Download size={15} /> {tr("Baixar")}
          </button>
        )}
      </footer>
    </dialog>
  );
}

/** "Carteira" tab: bookings and private documents, with search and filters (Fase 7). */
export function WalletPanel({ trip, store, userId, onSave, busy }: { trip: Trip; store: SecretStore; userId?: string; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const all = useMemo(() => walletItems(trip), [trip]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<WalletCategory | "">("");
  const [date, setDate] = useState("");
  const [onlyFiles, setOnlyFiles] = useState(false);
  const [preview, setPreview] = useState<TripDocument>();
  const [organizing, setOrganizing] = useState<string>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [showStayCode, setShowStayCode] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const counts = countByCategory(all);
  const items = filterWallet(all, { q, category, date, onlyFiles });
  const dates = [...new Set(all.map((i) => i.date).filter(Boolean) as string[])].sort();
  const docs = trip.documents || [];
  const days = trip.start ? Array.from({ length: Math.min(60, Math.max(1, Math.round((Date.parse((trip.end || trip.start) + "T12:00:00Z") - Date.parse(trip.start + "T12:00:00Z")) / 86400000) + 1)) }, (_, i) => i + 1) : [];

  async function upload(form: HTMLFormElement) {
    const f = new FormData(form);
    const file = input.current?.files?.[0];
    if (!file || pending || busy) return;
    setPending(true);
    setMessage("");
    try {
      const data = await readDocument(file);
      const id = uid();
      let url = data;
      if (userId && supabase) {
        url = `${userId}/${trip.id}/${id}`;
        const { error } = await supabase.storage.from(documentBucket).upload(url, file, { contentType: file.type, upsert: false });
        if (error) throw new Error("Não foi possível enviar. Confira a conexão e a configuração do armazenamento privado.");
      }
      const doc: TripDocument = { id, name: file.name.slice(0, 120), mime: file.type, size: file.size, url };
      const next = organizeDocument({ ...trip, documents: [...docs, doc] }, id, {
        category: (String(f.get("category") || "") || undefined) as WalletCategory | undefined,
        day: Number(f.get("day")) || undefined,
        transportId: String(f.get("link") || "").startsWith("t:") ? String(f.get("link")).slice(2) : undefined,
        stayId: String(f.get("link") || "").startsWith("s:") ? String(f.get("link")).slice(2) : undefined,
        vehicleId: String(f.get("link") || "").startsWith("v:") ? String(f.get("link")).slice(2) : undefined,
        reservationId: String(f.get("link") || "").startsWith("r:") ? String(f.get("link")).slice(2) : undefined,
      });
      if (await onSave(next)) {
        setMessage("Documento salvo.");
        form.reset();
      } else if (userId && supabase) {
        await supabase.storage.from(documentBucket).remove([url]);
        setMessage("Não foi possível salvar o documento na viagem.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }

  async function remove(d: TripDocument) {
    if (!confirm(tr("Remover o documento desta viagem? Guarde uma cópia antes."))) return;
    setPending(true);
    try {
      const next = {
        ...trip,
        documents: docs.filter((x) => x.id !== d.id),
        transports: (trip.transports || []).map((t) => (t.documentIds?.includes(d.id) ? { ...t, documentIds: t.documentIds.filter((x) => x !== d.id) } : t)),
        expenses: trip.expenses.map((x) => (x.receiptDocumentId === d.id ? { ...x, receiptDocumentId: undefined } : x)),
      };
      if (await onSave(next)) {
        if (!d.url.startsWith("data:") && supabase && userId) await supabase.storage.from(documentBucket).remove([d.url]);
        setMessage("Documento removido desta viagem.");
      }
    } finally {
      setPending(false);
    }
  }

  async function download(d: TripDocument) {
    try {
      const u = await blobUrl(d, userId);
      downloadDocument(d, u);
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível baixar.");
    }
  }

  const linkOptions = (
    <>
      <option value="">{tr("Sem vínculo")}</option>
      {(trip.transports || []).map((t) => (
        <option key={t.id} value={"t:" + t.id}>
          {tr("Transporte")}: {transportTitle(t)}
        </option>
      ))}
      {(trip.stays || []).map((s) => (
        <option key={s.id} value={"s:" + s.id}>
          {tr("Hospedagem")}: {s.name}
        </option>
      ))}
      {(trip.vehicles || []).map((v) => (
        <option key={v.id} value={"v:" + v.id}>
          {tr("Veículo")}: {tr(vehicleName(v))}
        </option>
      ))}
      {trip.reservations.map((r) => (
        <option key={r.id} value={"r:" + r.id}>
          {tr("Reserva")}: {r.title}
        </option>
      ))}
    </>
  );
  const linkOf = (d: TripDocument) => (d.transportId ? "t:" + d.transportId : d.stayId ? "s:" + d.stayId : d.vehicleId ? "v:" + d.vehicleId : d.reservationId ? "r:" + d.reservationId : "");

  const docChip = (id: string) => {
    const d = docs.find((x) => x.id === id);
    if (!d) return null;
    return (
      <span key={id} className="wallet-doc">
        <FileText size={13} aria-hidden="true" />
        <span>{d.name}</span>
        <button className="icon-button" onClick={() => setPreview(d)} aria-label={tf("Ver {name}", { name: d.name })}>
          <Eye size={14} />
        </button>
        <button className="icon-button" onClick={() => download(d)} aria-label={tf("Baixar {name}", { name: d.name })}>
          <Download size={14} />
        </button>
      </span>
    );
  };

  const row = (i: WalletItem) => {
    const d = i.document;
    const link = i.url ? safeExternalUrl(i.url) : undefined;
    return (
      <li key={i.id} className={"wallet-item wc-" + i.category}>
        <div className="wallet-item-head">
          <span className="wallet-badge">{tr(walletCategories[i.category])}</span>
          {i.date && <span className="wallet-date">{shortDate(i.date)}</span>}
        </div>
        <h3>{i.title}</h3>
        {i.detail && <p className="muted">{i.detail}</p>}
        <div className="wallet-actions">
          {i.hasSecret && i.source === "transport" && <SecretView store={store} tripId={trip.id} refId={i.id.slice(2)} />}
          {i.hasSecret && i.source === "vehicle" && <SecretView store={store} tripId={trip.id} refId={i.id.slice(2)} label="Reserva" />}
          {i.hasSecret && i.source === "stay" && (
            <span className="secret-view">
              <Lock size={13} aria-hidden="true" /> {tr("Confirmação")}:{" "}
              <code>{showStayCode === i.id ? trip.stays?.find((s) => "s:" + s.id === i.id)?.confirmation : "••••••"}</code>
              <button className="text-button small" onClick={() => setShowStayCode(showStayCode === i.id ? undefined : i.id)}>
                {showStayCode === i.id ? tr("Ocultar") : tr("Mostrar")}
              </button>
            </span>
          )}
          {link && (
            <a href={link} target="_blank" rel="noreferrer">
              {tr("Abrir link")} <ExternalLink size={12} />
            </a>
          )}
          {!d && i.documentIds.map(docChip)}
          {d && (
            <>
              <button className="secondary small" onClick={() => setPreview(d)}>
                <Eye size={14} /> {tr("Ver")}
              </button>
              <button className="secondary small" onClick={() => download(d)}>
                <Download size={14} /> {tr("Baixar")}
              </button>
              <button className="secondary small" onClick={() => setOrganizing(organizing === d.id ? undefined : d.id)} aria-expanded={organizing === d.id}>
                <FolderCog size={14} /> {tr("Organizar")}
              </button>
              <button className="icon-button" onClick={() => remove(d)} disabled={pending || busy} aria-label={tf("Remover {name}", { name: d.name })}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
        {d && organizing === d.id && (
          <form
            className="wallet-organize"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const l = String(f.get("link") || "");
              const next = organizeDocument(trip, d.id, {
                category: (String(f.get("category")) || undefined) as WalletCategory | undefined,
                day: Number(f.get("day")) || undefined,
                transportId: l.startsWith("t:") ? l.slice(2) : undefined,
                stayId: l.startsWith("s:") ? l.slice(2) : undefined,
                vehicleId: l.startsWith("v:") ? l.slice(2) : undefined,
                reservationId: l.startsWith("r:") ? l.slice(2) : undefined,
              });
              if (await onSave(next)) setOrganizing(undefined);
            }}
          >
            <label>
              {tr("Categoria")}
              <select name="category" defaultValue={d.category ?? i.category}>
                {Object.entries(walletCategories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {tr(v)}
                  </option>
                ))}
              </select>
            </label>
            {days.length > 0 && (
              <label>
                {tr("Dia")}
                <select name="day" defaultValue={d.day ?? ""}>
                  <option value="">{tr("Sem dia")}</option>
                  {days.map((n) => (
                    <option key={n} value={n}>
                      {tf("Dia {number}", { number: n })} · {shortDate(dateOfDay(trip, n)!)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {tr("Vincular a")}
              <select name="link" defaultValue={linkOf(d)}>
                {linkOptions}
              </select>
            </label>
            <button className="primary small" disabled={busy}>
              {tr("Salvar")}
            </button>
          </form>
        )}
      </li>
    );
  };

  return (
    <div className="wallet">
      <section className="panel wallet-intro">
        <div>
          <h2>{tr("Carteira da viagem")}</h2>
          <p className="muted">
            {userId
              ? tr("Arquivos guardados na pasta privada da sua conta. Só você consegue abrir; quem participa da viagem não vê seus documentos.")
              : tr("Modo local: documentos e reservas ficam só neste navegador. Exporte um backup para não perder.")}
          </p>
        </div>
        <form
          className="wallet-upload"
          onSubmit={(e) => {
            e.preventDefault();
            upload(e.currentTarget);
          }}
        >
          <label className="wallet-file">
            <span>
              <Upload size={15} aria-hidden="true" /> {tr("Arquivo (PDF, JPG, PNG ou WebP, até 1 MB)")}
            </span>
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={pending || busy} />
          </label>
          <label>
            {tr("Categoria")}
            <select name="category" defaultValue="">
              <option value="">{tr("Automática")}</option>
              {Object.entries(walletCategories).map(([k, v]) => (
                <option key={k} value={k}>
                  {tr(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Vincular a")}
            <select name="link" defaultValue="">
              {linkOptions}
            </select>
          </label>
          {days.length > 0 && (
            <label>
              {tr("Dia")}
              <select name="day" defaultValue="">
                <option value="">{tr("Sem dia")}</option>
                {days.map((n) => (
                  <option key={n} value={n}>
                    {tf("Dia {number}", { number: n })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary" disabled={pending || busy}>
            {pending ? tr("Salvando…") : tr("Anexar documento")}
          </button>
        </form>
        <p role="status" className="muted">
          {tr(message)}
        </p>
      </section>

      <div className="wallet-cats" role="group" aria-label={tr("Categorias")}>
        <button className={"wallet-cat" + (!category ? " is-on" : "")} aria-pressed={!category} onClick={() => setCategory("")}>
          <span>{tr("Tudo")}</span>
          <b>{all.length}</b>
        </button>
        {(Object.keys(walletCategories) as WalletCategory[]).map((k) => (
          <button key={k} className={"wallet-cat wc-" + k + (category === k ? " is-on" : "")} aria-pressed={category === k} onClick={() => setCategory(category === k ? "" : k)} disabled={!counts[k] && category !== k}>
            <span>{tr(walletCategories[k])}</span>
            <b>{counts[k]}</b>
          </button>
        ))}
      </div>
      <div className="wallet-filters">
        <label className="wallet-search">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Buscar por nome, cidade, companhia…")} aria-label={tr("Buscar na carteira")} />
        </label>
        <select value={date} onChange={(e) => setDate(e.target.value)} aria-label={tr("Filtrar por data")}>
          <option value="">{tr("Todas as datas")}</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {shortDate(d)}
            </option>
          ))}
        </select>
        <label className="check-row">
          <input type="checkbox" checked={onlyFiles} onChange={(e) => setOnlyFiles(e.target.checked)} /> {tr("Só arquivos")}
        </label>
      </div>
      {items.length ? (
        <ul className="wallet-list">{items.map(row)}</ul>
      ) : (
        <p className="muted">{all.length ? tr("Nada encontrado com esses filtros.") : tr("Passagens, hospedagens, locações e reservas aparecem aqui assim que forem cadastradas.")}</p>
      )}
      {preview && <Preview doc={preview} userId={userId} onClose={() => setPreview(undefined)} />}
    </div>
  );
}
