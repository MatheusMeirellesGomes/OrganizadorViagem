import { useMemo, useState } from "react";
import { Plus, X, Pencil, Users, ArrowRight, CheckCircle2, Wallet } from "lucide-react";
import { t as tr, tf, formatMoney, getLocale } from "./i18n";
import { uid, type Trip } from "./model";
import {
  balances, converted, decimals, expenseCategories, isCurrency, paidMinor, plannedMinor, shares, statusLabels,
  statusOf, suggestTransfers, summarize, toMajor, type Expense, type ExpenseStatus, type Participant, type SplitMode,
} from "./budget";
import { plannedSuggestions } from "./budget-links";
import { travelDays, dayLabel } from "./travel-mode";

const COMMON = ["BRL", "EUR", "USD", "GBP", "ARS", "CLP", "JPY", "CHF", "CAD", "MXN"];
const money = (minor: number, currency: string) => formatMoney(toMajor(minor, currency), currency);

type Draft = {
  id?: string;
  title: string;
  category: string;
  status: ExpenseStatus;
  estimate: string;
  amount: string;
  currency: string;
  date: string;
  day: string;
  payerId: string;
  mode: SplitMode;
  participants: string[];
  values: Record<string, string>;
  notes: string;
  receiptDocumentId: string;
  activityId: string;
  stayId: string;
  reservationId: string;
};

function Bars({ rows, currency }: { rows: { label: string; value: number; planned?: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.planned ?? 0)));
  if (!rows.length) return <p className="muted">{tr("Nada registrado ainda.")}</p>;
  return (
    <ul className="budget-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="budget-bar-label">{r.label}</span>
          <span className="budget-bar-track" aria-hidden="true">
            {r.planned !== undefined && <span className="budget-bar planned" style={{ width: `${(r.planned / max) * 100}%` }} />}
            <span className="budget-bar spent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="budget-bar-value">
            {money(r.value, currency)}
            {r.planned !== undefined && <span className="muted"> / {money(r.planned, currency)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BudgetPanel({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const people: Participant[] = trip.participants ?? [];
  const ids = people.map((p) => p.id);
  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? tr("Sem pagador");
  const reference = trip.budget?.currency ?? trip.expenses[0]?.currency ?? "BRL";
  const categories = { ...expenseCategories, ...Object.fromEntries((trip.customExpenseCategories ?? []).map((c) => [c, c])) };
  const empty = (): Draft => ({
    title: "", category: "other", status: "paid", estimate: "", amount: "", currency: reference, date: "", day: "",
    payerId: ids[0] ?? "", mode: "equal", participants: ids, values: {}, notes: "", receiptDocumentId: "", activityId: "", stayId: "", reservationId: "",
  });
  const [draft, setDraft] = useState<Draft>(),
    [message, setMessage] = useState(""),
    [newPerson, setNewPerson] = useState(""),
    [newCategory, setNewCategory] = useState(""),
    [filters, setFilters] = useState({ from: "", to: "", participant: "", category: "", city: "" }),
    [rate, setRate] = useState<Record<string, { rate: string; date: string; source: string }>>({}),
    [picked, setPicked] = useState<Set<string>>(new Set()),
    [confirmDelete, setConfirmDelete] = useState<string>();

  const cityOf = (x: Expense) =>
    x.stayId ? trip.stays?.find((s) => s.id === x.stayId)?.city : x.activityId ? trip.activities.find((a) => a.id === x.activityId)?.address.split(",").slice(-2, -1)[0]?.trim() : undefined;
  const cities = [...new Set((trip.stays ?? []).map((s) => s.city).filter(Boolean))];
  const filter = (x: Expense) =>
    (!filters.category || (x.category ?? "other") === filters.category) &&
    (!filters.participant || x.payerId === filters.participant || (x.split?.participants ?? ids).includes(filters.participant)) &&
    (!filters.from || (x.date ?? "") >= filters.from) &&
    (!filters.to || (x.date ?? "9999") <= filters.to) &&
    (!filters.city || cityOf(x) === filters.city);
  const summary = useMemo(() => summarize(trip.expenses, reference, { budget: trip.budget, people: ids, filter }), [trip.expenses, reference, trip.budget, ids.join(), JSON.stringify(filters)]);
  const currencies = [...new Set(trip.expenses.map((x) => x.currency))];
  const suggestions = plannedSuggestions(trip, reference);

  async function save(next: Trip, ok: string) {
    if (await onSave(next)) setMessage(ok);
  }
  function toExpense(d: Draft): Expense {
    const amount = Number(d.amount.replace(",", ".") || 0);
    const estimate = d.estimate.trim() ? Number(d.estimate.replace(",", ".")) : undefined;
    if (!d.title.trim()) throw new Error("Dê um nome à despesa.");
    if (!isCurrency(d.currency)) throw new Error("Moeda inválida. Use o código de 3 letras, como BRL, EUR ou USD.");
    if (!(amount >= 0) || (estimate !== undefined && !(estimate >= 0))) throw new Error("Valores precisam ser números positivos.");
    if (!amount && !estimate) throw new Error("Informe o valor previsto ou o valor pago.");
    if ((d.status === "paid" || d.status === "partial") && !amount) throw new Error("Informe quanto já foi pago.");
    const values = Object.fromEntries(Object.entries(d.values).filter(([k, v]) => d.participants.includes(k) && v.trim()).map(([k, v]) => [k, Number(v.replace(",", "."))]));
    const x: Expense = {
      id: d.id ?? uid(),
      title: d.title.trim().slice(0, 200),
      amount,
      currency: d.currency,
      estimate,
      status: d.status,
      category: d.category,
      date: d.date || undefined,
      day: d.day ? Number(d.day) : undefined,
      payerId: d.payerId || undefined,
      split: ids.length ? { mode: d.mode, participants: d.participants, values: d.mode === "equal" ? undefined : values } : undefined,
      notes: d.notes.trim() || undefined,
      receiptDocumentId: d.receiptDocumentId || undefined,
      activityId: d.activityId || undefined,
      stayId: d.stayId || undefined,
      reservationId: d.reservationId || undefined,
      conversion: trip.expenses.find((e) => e.id === d.id)?.conversion,
    };
    // Validates the split now, so a wrong total never gets saved.
    if (x.split) shares(x, Math.max(paidMinor(x), plannedMinor(x)), ids);
    return x;
  }
  const edit = (x: Expense) =>
    setDraft({
      id: x.id, title: x.title, category: x.category ?? "other", status: statusOf(x), estimate: x.estimate !== undefined ? String(x.estimate) : "",
      amount: x.amount ? String(x.amount) : "", currency: x.currency, date: x.date ?? "", day: x.day ? String(x.day) : "", payerId: x.payerId ?? "",
      mode: x.split?.mode ?? "equal", participants: x.split?.participants ?? ids, values: Object.fromEntries(Object.entries(x.split?.values ?? {}).map(([k, v]) => [k, String(v)])),
      notes: x.notes ?? "", receiptDocumentId: x.receiptDocumentId ?? "", activityId: x.activityId ?? "", stayId: x.stayId ?? "", reservationId: x.reservationId ?? "",
    });

  return (
    <section className="panel budget-panel">
      <h2>{tr("Orçamento e divisão de gastos")}</h2>
      <p>{tr("Previsto não conta como gasto. Cada despesa guarda o valor e a moeda originais; a conversão só acontece com uma cotação registrada.")}</p>

      <div className="budget-settings form-grid">
        <label>
          {tr("Moeda de referência")}
          <input list="currencies" value={reference} maxLength={3} onChange={(e) => {
            const c = e.target.value.toUpperCase();
            if (isCurrency(c)) void onSave({ ...trip, budget: { amount: trip.budget?.amount ?? 0, currency: c } });
          }} />
        </label>
        <label>
          {tr("Orçamento total")}
          <input inputMode="decimal" defaultValue={trip.budget?.amount || ""} onBlur={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            if (n >= 0) void onSave({ ...trip, budget: { amount: n, currency: reference } });
          }} />
        </label>
        <datalist id="currencies">{COMMON.map((c) => <option key={c} value={c} />)}</datalist>
      </div>

      <div className="budget-kpis">
        <div><small>{tr("Orçamento total")}</small><strong>{summary.budget !== undefined ? money(summary.budget, reference) : "—"}</strong></div>
        <div><small>{tr("Total planejado")}</small><strong>{money(summary.planned, reference)}</strong></div>
        <div><small>{tr("Gasto de fato")}</small><strong>{money(summary.spent, reference)}</strong></div>
        <div className={summary.available !== undefined && summary.available < 0 ? "negative" : ""}><small>{tr("Saldo disponível")}</small><strong>{summary.available !== undefined ? money(summary.available, reference) : "—"}</strong></div>
      </div>

      <details className="budget-filters">
        <summary>{tr("Filtrar o painel")}</summary>
        <div className="form-grid">
          <label>{tr("De")}<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label>{tr("Até")}<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <label>{tr("Categoria")}
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">{tr("Todas")}</option>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}
            </select>
          </label>
          <label>{tr("Participante")}
            <select value={filters.participant} onChange={(e) => setFilters({ ...filters, participant: e.target.value })}>
              <option value="">{tr("Todos")}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {cities.length > 1 && (
            <label>{tr("Cidade")}
              <select value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}>
                <option value="">{tr("Todas")}</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
      </details>

      <div className="budget-charts">
        <div>
          <h3>{tr("Por categoria · gasto / planejado")}</h3>
          <Bars currency={reference} rows={Object.entries(summary.byCategory).map(([k, v]) => ({ label: tr(categories[k] ?? k), value: v.spent, planned: v.planned }))} />
        </div>
        <div>
          <h3>{tr("Por dia")}</h3>
          <Bars currency={reference} rows={Object.entries(summary.byDay).sort().map(([k, v]) => ({ label: /^\d{4}-/.test(k) ? new Date(k + "T12:00:00Z").toLocaleDateString(getLocale(), { day: "numeric", month: "short", timeZone: "UTC" }) : k.startsWith("day:") ? tf("Dia {number}", { number: Number(k.slice(4)) }) : tr("Sem data"), value: v }))} />
        </div>
        {people.length > 0 && (
          <div>
            <h3>{tr("Por participante (parte de cada um)")}</h3>
            <Bars currency={reference} rows={people.map((p) => ({ label: p.name, value: summary.byParticipant[p.id] ?? 0 }))} />
          </div>
        )}
      </div>

      {summary.unconverted.length > 0 && (
        <div className="budget-rates">
          <h3>{tr("Cotações")}</h3>
          <p className="muted">{tf("{count} despesas em outra moeda não entram nos totais em {currency} até você registrar a cotação.", { count: summary.unconverted.length, currency: reference })}</p>
          {[...new Set(summary.unconverted.map((x) => x.currency))].map((c) => {
            const r = rate[c] ?? { rate: "", date: new Date().toISOString().slice(0, 10), source: "" };
            return (
              <div key={c} className="budget-rate-row">
                <strong>1 {c} =</strong>
                <input inputMode="decimal" aria-label={tf("Cotação de {from} em {to}", { from: c, to: reference })} value={r.rate} onChange={(e) => setRate({ ...rate, [c]: { ...r, rate: e.target.value } })} placeholder="0,0000" />
                <span>{reference}</span>
                <input type="date" aria-label={tr("Data da cotação")} value={r.date} onChange={(e) => setRate({ ...rate, [c]: { ...r, date: e.target.value } })} />
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      const res = await fetch(`https://api.frankfurter.app/${r.date}?from=${c}&to=${reference}`, { signal: AbortSignal.timeout(10000) });
                      const json = await res.json();
                      const value = json?.rates?.[reference];
                      if (!(value > 0)) throw new Error();
                      setRate({ ...rate, [c]: { rate: String(value), date: json.date, source: tr("Banco Central Europeu (frankfurter.app)") } });
                    } catch {
                      setMessage(tr("Cotação não encontrada para essa moeda ou data. Digite a taxa que você usou."));
                    }
                  }}
                >
                  {tr("Buscar cotação do BCE")}
                </button>
                <button
                  className="primary"
                  disabled={!(Number(r.rate.replace(",", ".")) > 0)}
                  onClick={() => {
                    const value = Number(r.rate.replace(",", "."));
                    const conversion = { currency: reference, rate: value, date: r.date, source: r.source || tr("Informada por você") };
                    // Only expenses without a rate get this one: older rates are never replaced.
                    void save(
                      { ...trip, expenses: trip.expenses.map((x) => (x.currency === c && !x.conversion ? { ...x, conversion } : x)) },
                      tf("Cotação de {date} registrada para as despesas em {currency} sem cotação.", { date: r.date, currency: c }),
                    );
                  }}
                >
                  {tr("Usar esta cotação")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="budget-people">
        <h3><Users size={18} aria-hidden="true" /> {tr("Participantes")}</h3>
        <ul className="chip-row wrap">
          {people.map((p) => {
            const used = trip.expenses.some((x) => x.payerId === p.id || x.split?.participants.includes(p.id)) || (trip.settlements ?? []).some((s) => s.from === p.id || s.to === p.id);
            return (
              <li key={p.id} className="chip">
                {p.name}
                {!used && (
                  <button className="icon-button" aria-label={tf("Remover {name}", { name: p.name })} onClick={() => save({ ...trip, participants: people.filter((x) => x.id !== p.id) }, "")}>
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newPerson.trim();
            if (!n || people.some((p) => p.name.toLowerCase() === n.toLowerCase())) return;
            void save({ ...trip, participants: [...people, { id: uid(), name: n.slice(0, 80) }] }, tf("{name} adicionado.", { name: n }));
            setNewPerson("");
          }}
        >
          <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} placeholder={tr("Nome da pessoa")} aria-label={tr("Nome da pessoa")} />
          <button className="secondary">{tr("Adicionar pessoa")}</button>
          {(trip.party?.members?.length ?? 0) > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const add = trip.party!.members!.filter((m) => m.trim() && !people.some((p) => p.name.toLowerCase() === m.trim().toLowerCase()));
                void save({ ...trip, participants: [...people, ...add.map((m) => ({ id: uid(), name: m.trim().slice(0, 80) }))] }, tf("{count} pessoas do grupo adicionadas.", { count: add.length }));
              }}
            >
              {tr("Usar as pessoas do grupo da viagem")}
            </button>
          )}
        </form>
      </div>

      {suggestions.length > 0 && (
        <details className="budget-suggestions">
          <summary>{tf("{count} despesas previstas sugeridas a partir da viagem", { count: suggestions.length })}</summary>
          <ul className="plain-list">
            {suggestions.map((s) => (
              <li key={s.key}>
                <label className="check-row">
                  <input type="checkbox" checked={picked.has(s.key)} onChange={() => setPicked((x) => { const n = new Set(x); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })} />
                  {tr(s.from)}: {s.expense.title}
                  {s.expense.estimate ? " · " + formatMoney(s.expense.estimate, s.expense.currency) : " · " + tr("valor a preencher")}
                </label>
              </li>
            ))}
          </ul>
          <button
            className="secondary"
            disabled={!picked.size}
            onClick={() => {
              const chosen = suggestions.filter((s) => picked.has(s.key)).map((s) => s.expense);
              setPicked(new Set());
              void save({ ...trip, expenses: [...trip.expenses, ...chosen] }, tf("{count} despesas previstas criadas. Preencha os valores.", { count: chosen.length }));
            }}
          >
            {tr("Criar as despesas marcadas")}
          </button>
        </details>
      )}

      <div className="budget-list-head">
        <h3>{tr("Despesas")}</h3>
        <button className="primary" onClick={() => setDraft(empty())}><Plus size={16} /> {tr("Nova despesa")}</button>
      </div>

      {draft && (
        <form
          className="budget-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const x = toExpense(draft);
              const exists = trip.expenses.some((e) => e.id === x.id);
              void save({ ...trip, expenses: exists ? trip.expenses.map((e) => (e.id === x.id ? x : e)) : [...trip.expenses, x] }, exists ? tr("Despesa atualizada.") : tr("Despesa registrada."));
              setDraft(undefined);
            } catch (err) {
              setMessage(err instanceof Error ? tr(err.message) : tr("Confira os dados."));
            }
          }}
        >
          <div className="form-grid">
            <label>{tr("Descrição")}<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label>{tr("Categoria")}
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}
              </select>
            </label>
            <label>{tr("Situação")}
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ExpenseStatus })}>
                {(Object.keys(statusLabels) as ExpenseStatus[]).map((s) => <option key={s} value={s}>{tr(statusLabels[s])}</option>)}
              </select>
            </label>
            <label>{tr("Moeda")}<input list="currencies" maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
            <label>{tr("Valor previsto")}<input inputMode="decimal" value={draft.estimate} onChange={(e) => setDraft({ ...draft, estimate: e.target.value })} /></label>
            <label>{tr("Valor já pago")}<input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></label>
            <label>{tr("Data")}<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            <label>{tr("Dia do roteiro")}
              <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>
                <option value="">{tr("Nenhum")}</option>
                {travelDays(trip).map((d) => <option key={d} value={d}>{dayLabel(trip, d).short}</option>)}
              </select>
            </label>
            {people.length > 0 && (
              <label>{tr("Quem pagou")}
                <select value={draft.payerId} onChange={(e) => setDraft({ ...draft, payerId: e.target.value })}>
                  <option value="">{tr("Ninguém ainda")}</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {people.length > 0 && (
            <fieldset className="budget-split">
              <legend>{tr("Quem participa e como dividir")}</legend>
              <select aria-label={tr("Forma de divisão")} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as SplitMode })}>
                <option value="equal">{tr("Igual entre os participantes")}</option>
                <option value="shares">{tr("Por pessoa ou casal (pesos)")}</option>
                <option value="percent">{tr("Por porcentagem")}</option>
                <option value="amounts">{tr("Valores personalizados")}</option>
              </select>
              <ul className="plain-list">
                {people.map((p) => (
                  <li key={p.id} className="budget-split-row">
                    <label className="check-row">
                      <input type="checkbox" checked={draft.participants.includes(p.id)} onChange={() => setDraft({ ...draft, participants: draft.participants.includes(p.id) ? draft.participants.filter((x) => x !== p.id) : [...draft.participants, p.id] })} />
                      {p.name}
                    </label>
                    {draft.mode !== "equal" && draft.participants.includes(p.id) && (
                      <input
                        inputMode="decimal"
                        aria-label={tf("Parte de {name}", { name: p.name })}
                        placeholder={draft.mode === "shares" ? "1" : draft.mode === "percent" ? "%" : "0,00"}
                        value={draft.values[p.id] ?? ""}
                        onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [p.id]: e.target.value } })}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <p className="muted">{tr("Quem pagou não precisa participar: pagar e dividir são coisas diferentes.")}</p>
            </fieldset>
          )}
          <details>
            <summary>{tr("Vínculos, comprovante e observações")}</summary>
            <div className="form-grid">
              <label>{tr("Atividade")}
                <select value={draft.activityId} onChange={(e) => setDraft({ ...draft, activityId: e.target.value })}>
                  <option value="">{tr("Nenhuma")}</option>
                  {trip.activities.map((a) => <option key={a.id} value={a.id}>{tf("Dia {number}", { number: a.day })} · {a.title}</option>)}
                </select>
              </label>
              <label>{tr("Hospedagem")}
                <select value={draft.stayId} onChange={(e) => setDraft({ ...draft, stayId: e.target.value })}>
                  <option value="">{tr("Nenhuma")}</option>
                  {(trip.stays ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>{tr("Reserva")}
                <select value={draft.reservationId} onChange={(e) => setDraft({ ...draft, reservationId: e.target.value })}>
                  <option value="">{tr("Nenhuma")}</option>
                  {trip.reservations.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </label>
              <label>{tr("Comprovante (documento da viagem)")}
                <select value={draft.receiptDocumentId} onChange={(e) => setDraft({ ...draft, receiptDocumentId: e.target.value })}>
                  <option value="">{tr("Nenhum")}</option>
                  {(trip.documents ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <label>{tr("Observações")}<textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            <div className="inline-form">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={tr("Nova categoria")} aria-label={tr("Nova categoria")} />
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const c = newCategory.trim();
                  if (!c || categories[c]) return;
                  void onSave({ ...trip, customExpenseCategories: [...(trip.customExpenseCategories ?? []), c.slice(0, 40)] });
                  setDraft({ ...draft, category: c.slice(0, 40) });
                  setNewCategory("");
                }}
              >
                {tr("Criar categoria")}
              </button>
            </div>
          </details>
          <div className="tm-actions">
            <button className="primary" disabled={busy}>{tr("Salvar despesa")}</button>
            <button type="button" className="secondary" onClick={() => setDraft(undefined)}>{tr("Cancelar")}</button>
          </div>
        </form>
      )}

      <ul className="budget-list">
        {trip.expenses.filter(filter).map((x) => {
          const st = statusOf(x);
          return (
            <li key={x.id} className={"budget-item status-" + st}>
              <Wallet size={18} aria-hidden="true" />
              <div>
                <strong>{x.title}</strong>
                <span className="muted">
                  {tr(categories[x.category ?? "other"] ?? x.category ?? "")} · {tr(statusLabels[st])}
                  {x.payerId && " · " + tf("pago por {name}", { name: name(x.payerId) })}
                  {x.date && " · " + new Date(x.date + "T12:00:00Z").toLocaleDateString(getLocale(), { timeZone: "UTC" })}
                </span>
              </div>
              <div className="budget-values">
                {x.estimate !== undefined && <span className="muted">{tf("previsto {value}", { value: formatMoney(x.estimate, x.currency) })}</span>}
                <b>{formatMoney(x.amount, x.currency)}</b>
                {x.currency !== reference && (() => {
                  const c = converted(paidMinor(x) || plannedMinor(x), x, reference);
                  return c !== undefined ? <span className="muted">≈ {money(c, reference)} · {x.conversion!.date}</span> : <span className="muted">{tr("sem cotação")}</span>;
                })()}
              </div>
              <button className="icon-button" aria-label={tf("Editar {name}", { name: x.title })} onClick={() => edit(x)}><Pencil size={16} /></button>
              {confirmDelete === x.id ? (
                <span className="budget-confirm">
                  <button className="secondary" onClick={() => { setConfirmDelete(undefined); void save({ ...trip, expenses: trip.expenses.filter((e) => e.id !== x.id) }, tr("Despesa excluída.")); }}>{tr("Excluir")}</button>
                  <button className="text-button" onClick={() => setConfirmDelete(undefined)}>{tr("Cancelar")}</button>
                </span>
              ) : (
                <button className="icon-button" aria-label={tr("Excluir despesa")} onClick={() => setConfirmDelete(x.id)}><X size={16} /></button>
              )}
            </li>
          );
        })}
      </ul>

      {people.length > 1 && (
        <div className="budget-settle">
          <h3>{tr("Acerto de contas")}</h3>
          {currencies.map((c) => {
            let list;
            try {
              list = balances(trip.expenses, trip.settlements ?? [], ids, c);
            } catch (e) {
              return <p key={c} role="alert">{e instanceof Error ? tr(e.message) : ""}</p>;
            }
            if (list.every((b) => !b.paid && !b.owes)) return null;
            const transfers = suggestTransfers(list);
            return (
              <div key={c} className="budget-settle-currency">
                <h4>{c}</h4>
                <table className="budget-table">
                  <thead><tr><th>{tr("Pessoa")}</th><th>{tr("Pagou")}</th><th>{tr("Parte dela")}</th><th>{tr("Saldo")}</th></tr></thead>
                  <tbody>
                    {list.map((b) => (
                      <tr key={b.id}>
                        <td>{name(b.id)}</td>
                        <td>{money(b.paid, c)}</td>
                        <td>{money(b.owes, c)}</td>
                        <td className={b.balance < 0 ? "negative" : b.balance > 0 ? "positive" : ""}>{money(b.balance, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transfers.length ? (
                  <ul className="plain-list budget-transfers">
                    {transfers.map((t) => (
                      <li key={t.from + t.to}>
                        {name(t.from)} <ArrowRight size={14} aria-label={tr("paga para")} /> {name(t.to)}: <b>{money(t.amount, c)}</b>{" "}
                        <button
                          className="secondary"
                          onClick={() =>
                            save(
                              { ...trip, settlements: [...(trip.settlements ?? []), { id: uid(), from: t.from, to: t.to, amount: toMajor(t.amount, c), currency: c, date: new Date().toISOString().slice(0, 10), done: true }] },
                              tr("Reembolso registrado."),
                            )
                          }
                        >
                          {tr("Marcar como pago")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted"><CheckCircle2 size={14} aria-hidden="true" /> {tr("Tudo acertado nesta moeda.")}</p>
                )}
              </div>
            );
          })}
          {(trip.settlements ?? []).length > 0 && (
            <details>
              <summary>{tf("{count} reembolsos concluídos", { count: trip.settlements!.length })}</summary>
              <ul className="plain-list">
                {trip.settlements!.map((s) => (
                  <li key={s.id}>
                    {s.date} · {name(s.from)} → {name(s.to)} · {formatMoney(s.amount, s.currency)}{" "}
                    <button className="text-button" onClick={() => save({ ...trip, settlements: trip.settlements!.filter((x) => x.id !== s.id) }, tr("Reembolso desfeito."))}>{tr("Desfazer")}</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="muted">{tf("Valores calculados em centavos ({digits} casas decimais por moeda), sem arredondamentos perdidos.", { digits: decimals(reference) })}</p>
        </div>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
