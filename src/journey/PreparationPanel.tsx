import { useState } from "react";
import { Bell, BellRing, Check, Copy, ExternalLink, Globe2, Luggage, Plus, Sparkles, Trash2 } from "lucide-react";
import { t as tr, tf, getLocale } from "../i18n";
import type { Trip } from "../model";
import { safeExternalUrl } from "../travel-mode";
import { addReminder, candidates, offsets, reminderKinds, remindAt, removeReminder, setReminderDone, type ReminderKind } from "./reminders";
import { addItem, packingCategories, progress, removeItem, reuseFrom, suggestions, updateItem, type PackingCategory } from "./packing";
import { looksLikeDocumentNumber, prepItems, prepStatuses, relevantPrep, setPrep, type PrepKey } from "./prep";
import { toInstant } from "./time";

const when = (ms: number) =>
  new Date(ms).toLocaleString(getLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

function Reminders({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const list = [...(trip.reminders || [])].sort((a, b) => remindAt(a) - remindAt(b));
  const options = candidates(trip);
  const [pick, setPick] = useState("");
  const [before, setBefore] = useState(1440);
  const [custom, setCustom] = useState({ title: "", date: "", time: "09:00" });
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : "unsupported");
  const now = Date.now();
  async function add() {
    const c = options[Number(pick)];
    if (c) return onSave(addReminder(trip, c, before));
    const at = toInstant(custom.date, custom.time, trip.timeZone);
    if (!custom.title.trim() || at === undefined) return;
    if (await onSave(addReminder(trip, { kind: "custom", title: custom.title, eventAt: at }, 0))) setCustom({ title: "", date: "", time: "09:00" });
  }
  return (
    <section className="panel journey-card" aria-labelledby="rem-title">
      <h3 id="rem-title">
        <Bell size={17} aria-hidden="true" /> {tr("Lembretes")}
      </h3>
      <p className="muted">
        {tr("Você escolhe o que lembrar e quando. Os lembretes aparecem aqui e no topo do app quando chega a hora.")}{" "}
        {perm === "granted"
          ? tr("Notificações deste navegador ativadas: elas só aparecem com o app aberto.")
          : tr("Sem um servidor de notificações, o app não avisa com ele fechado.")}
      </p>
      {perm !== "granted" && perm !== "unsupported" && perm !== "denied" && (
        <button className="secondary small" onClick={async () => setPerm(await Notification.requestPermission())}>
          <BellRing size={14} /> {tr("Permitir notificações neste navegador")}
        </button>
      )}
      {perm === "denied" && <p className="muted">{tr("As notificações estão bloqueadas nas configurações do navegador.")}</p>}
      <div className="reminder-add">
        <label>
          {tr("Lembrar de")}
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{tr("Outro (escrever)")}</option>
            {options.map((c, i) => (
              <option key={i} value={i}>
                {tr(reminderKinds[c.kind])}: {c.title} · {when(c.eventAt)}
              </option>
            ))}
          </select>
        </label>
        {pick !== "" ? (
          <label>
            {tr("Quando")}
            <select value={before} onChange={(e) => setBefore(Number(e.target.value))}>
              {offsets.map(([m, label]) => (
                <option key={m} value={m}>
                  {tr(label)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              {tr("Lembrete")}
              <input value={custom.title} maxLength={120} onChange={(e) => setCustom({ ...custom, title: e.target.value })} placeholder={tr("Ex.: pagar o restante do hotel")} />
            </label>
            <label>
              {tr("Data")}
              <input type="date" value={custom.date} onChange={(e) => setCustom({ ...custom, date: e.target.value })} />
            </label>
            <label>
              {tr("Hora")}
              <input type="time" value={custom.time} onChange={(e) => setCustom({ ...custom, time: e.target.value })} />
            </label>
          </>
        )}
        <button className="primary small" onClick={add} disabled={busy}>
          <Plus size={14} /> {tr("Criar lembrete")}
        </button>
      </div>
      {!options.length && <p className="muted">{tr("Datas de voos, carros, hospedagens, ingressos e pagamentos aparecem aqui para virar lembrete.")}</p>}
      {list.length > 0 && (
        <ul className="reminder-list">
          {list.map((r) => {
            const due = !r.done && remindAt(r) <= now;
            return (
              <li key={r.id} className={(r.done ? "is-done" : "") + (due ? " is-due" : "")}>
                <span>
                  <b>{tr(reminderKinds[r.kind])}</b> {r.title}
                  <small>
                    {tf("Avisar em {date}", { date: when(remindAt(r)) })}
                    {r.before > 0 && ` · ${tf("evento {date}", { date: when(r.eventAt) })}`}
                  </small>
                </span>
                <span className="vehicle-actions">
                  <button className="icon-button" onClick={() => onSave(setReminderDone(trip, r.id, !r.done))} aria-label={r.done ? tr("Reabrir lembrete") : tr("Marcar como feito")} aria-pressed={!!r.done}>
                    <Check size={15} />
                  </button>
                  <button className="icon-button" onClick={() => onSave(removeReminder(trip, r.id))} aria-label={tr("Apagar lembrete")}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Packing({ trip, trips, onSave, busy }: { trip: Trip; trips: Trip[]; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const people = trip.participants || [];
  const [who, setWho] = useState<string>("");
  const [list, setList] = useState<string>("");
  const [draft, setDraft] = useState({ title: "", category: "clothes" as PackingCategory, qty: "1" });
  const items = (trip.packing || []).filter((x) => (who ? x.travelerId === who : !x.travelerId) && (!list || x.list === list));
  const lists = [...new Set((trip.packing || []).map((x) => x.list).filter(Boolean) as string[])];
  const p = progress(items);
  const sugg = suggestions(trip, who || undefined);
  const others = trips.filter((t) => t.id !== trip.id && (t.packing || []).length);
  return (
    <section className="panel journey-card" aria-labelledby="pack-title">
      <div className="section-head">
        <h3 id="pack-title">
          <Luggage size={17} aria-hidden="true" /> {tr("Bagagem")}
        </h3>
        <span className="pack-progress" aria-label={tf("{done} de {total} itens prontos", { done: p.done, total: p.total })}>
          <span style={{ width: p.pct + "%" }} />
          <b>
            {p.done}/{p.total}
          </b>
        </span>
      </div>
      <div className="chip-row wrap">
        <button className={"chip" + (!who ? " is-on" : "")} aria-pressed={!who} onClick={() => setWho("")}>
          {tr("Grupo")}
        </button>
        {people.map((x) => (
          <button key={x.id} className={"chip" + (who === x.id ? " is-on" : "")} aria-pressed={who === x.id} onClick={() => setWho(x.id)}>
            {x.name}
          </button>
        ))}
        {lists.length > 0 && <span className="chip-sep" aria-hidden="true" />}
        {lists.map((l) => (
          <button key={l} className={"chip" + (list === l ? " is-on" : "")} aria-pressed={list === l} onClick={() => setList(list === l ? "" : l)}>
            {l}
          </button>
        ))}
      </div>
      <form
        className="pack-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.title.trim()) return;
          if (await onSave(addItem(trip, { title: draft.title, category: draft.category, qty: Number(draft.qty) || 1, travelerId: who || undefined, list: list || undefined })))
            setDraft({ ...draft, title: "", qty: "1" });
        }}
      >
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={tr("Adicionar item")} aria-label={tr("Item")} maxLength={80} />
        <input value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} inputMode="numeric" aria-label={tr("Quantidade")} className="pack-qty" />
        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PackingCategory })} aria-label={tr("Categoria")}>
          {Object.entries(packingCategories).map(([k, v]) => (
            <option key={k} value={k}>
              {tr(v)}
            </option>
          ))}
        </select>
        <button className="primary small" disabled={busy}>
          <Plus size={14} /> {tr("Adicionar")}
        </button>
      </form>
      {(Object.keys(packingCategories) as PackingCategory[]).map((c) => {
        const group = items.filter((x) => x.category === c);
        if (!group.length) return null;
        return (
          <div key={c} className="pack-group">
            <h4>{tr(packingCategories[c])}</h4>
            <ul>
              {group.map((x) => (
                <li key={x.id} className={x.packed ? "is-packed" : ""}>
                  <label className="check-row">
                    <input type="checkbox" checked={x.packed} onChange={() => onSave(updateItem(trip, x.id, { packed: !x.packed }))} />
                    <span>
                      {x.title}
                      {x.qty > 1 && <b> × {x.qty}</b>}
                      {x.reason && <small> · {tr(x.reason)}</small>}
                    </span>
                  </label>
                  <button className="icon-button" onClick={() => onSave(removeItem(trip, x.id))} aria-label={tf("Remover {name}", { name: x.title })}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="profile-buttons">
        {sugg.length > 0 && (
          <button
            className="secondary small"
            disabled={busy}
            onClick={() => onSave(sugg.reduce((t, s) => addItem(t, { ...s, list: list || undefined }), trip))}
          >
            <Sparkles size={14} /> {tf("Sugerir {count} itens", { count: sugg.length })}
          </button>
        )}
        {others.length > 0 && (
          <select
            className="pack-reuse"
            value=""
            onChange={(e) => {
              const o = others.find((t) => t.id === e.target.value);
              if (o) onSave(reuseFrom(trip, o));
            }}
            aria-label={tr("Reutilizar lista de outra viagem")}
          >
            <option value="">{tr("Reutilizar lista de…")}</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
        <button
          className="text-button small"
          onClick={() => {
            const name = prompt(tr("Nome da nova lista (ex.: Mala de mão)"))?.trim();
            if (name) setList(name.slice(0, 40));
          }}
        >
          <Copy size={13} /> {tr("Nova lista")}
        </button>
      </div>
      <p className="muted">{tr("Sugestões pela duração, pelo tipo de viagem e pelos transportes cadastrados. O app não supõe o clima: confira a previsão perto da data.")}</p>
    </section>
  );
}

function International({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const relevant = relevantPrep(trip);
  const keys = all ? (Object.keys(prepItems) as PrepKey[]) : relevant;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="panel journey-card" aria-labelledby="intl-title">
      <h3 id="intl-title">
        <Globe2 size={17} aria-hidden="true" /> {tr("Preparação internacional")}
      </h3>
      <p className="muted">{tr("Lista para conferir, não uma lista de exigências. O que é obrigatório depende do país, da sua nacionalidade, da situação e da data: confirme sempre na fonte oficial e anote quando consultou.")}</p>
      <ul className="prep-list">
        {keys.map((k) => {
          const s = trip.prep?.[k];
          const src = s?.source ? safeExternalUrl(s.source) : undefined;
          return (
            <li key={k} className={"prep-item is-" + (s?.status ?? "todo")}>
              <div>
                <b>{tr(prepItems[k].title)}</b>
                <small>{tr(prepItems[k].hint)}</small>
                {(src || s?.checkedAt) && (
                  <small>
                    {src && (
                      <a href={src} target="_blank" rel="noreferrer">
                        {tr("Fonte consultada")} <ExternalLink size={11} />
                      </a>
                    )}
                    {s?.checkedAt && ` · ${tf("consultado em {date}", { date: s.checkedAt.split("-").reverse().join("/") })}`}
                  </small>
                )}
                {s?.note && <small>{s.note}</small>}
              </div>
              <details className="prep-edit">
                <summary>
                  <span className={"prep-status is-" + (s?.status ?? "todo")}>{tr(prepStatuses[s?.status ?? "todo"])}</span> {tr("Atualizar")}
                </summary>
              <form
                className="prep-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const note = String(f.get("note") || "");
                  setError("");
                  if (looksLikeDocumentNumber(note)) return setError("Não guarde números de documentos aqui.");
                  try {
                    const source = String(f.get("source") || "").trim();
                    await onSave(setPrep(trip, k, { status: String(f.get("status")) as keyof typeof prepStatuses, source: source || undefined, checkedAt: source ? String(f.get("checkedAt") || today) : s?.checkedAt, note }));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "");
                  }
                }}
              >
                <select name="status" defaultValue={s?.status ?? "todo"} aria-label={tf("Situação de {item}", { item: tr(prepItems[k].title) })}>
                  {Object.entries(prepStatuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {tr(l)}
                    </option>
                  ))}
                </select>
                <input name="source" type="url" defaultValue={s?.source} placeholder={tr("Link da fonte oficial")} aria-label={tr("Link da fonte oficial")} />
                <input name="checkedAt" type="date" defaultValue={s?.checkedAt ?? today} aria-label={tr("Data da consulta")} />
                <input name="note" defaultValue={s?.note} maxLength={200} placeholder={tr("Observação (sem números de documentos)")} aria-label={tr("Observação")} />
                <button className="secondary small" disabled={busy}>
                  {tr("Salvar")}
                </button>
              </form>
              </details>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="form-error">{tr(error)}</p>}
      <button className="text-button small" onClick={() => setAll((x) => !x)}>
        {all ? tr("Mostrar só o que parece se aplicar") : tr("Mostrar todos os itens")}
      </button>
    </section>
  );
}

/** Reminders, packing and international preparation (Fases 8 a 10). */
export function PreparationPanel({ trip, trips, onSave, busy }: { trip: Trip; trips: Trip[]; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  return (
    <div className="journey">
      <Reminders trip={trip} onSave={onSave} busy={busy} />
      <Packing trip={trip} trips={trips} onSave={onSave} busy={busy} />
      {trip.scope !== "national" && <International trip={trip} onSave={onSave} busy={busy} />}
    </div>
  );
}

export const reminderLabel = (k: ReminderKind) => reminderKinds[k];
