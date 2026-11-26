import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import type { Trip } from "../model";
import { t as tr, tf } from "../i18n";
import { applyImport, parseConfirmation, type Imported, type ImportedLeg } from "./importer";

const kinds = { flight: "Voo", stay: "Hospedagem", car: "Aluguel de carro" } as const;
const emptyLeg = (): ImportedLeg => ({ from: "", to: "", departDate: "", departTime: "", arriveDate: "", arriveTime: "" });

export function ImportDialog({ trips, onSave, onClose, busy }: { trips: Trip[]; onSave: (t: Trip) => Promise<boolean | void> | void; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const options = trips.filter((t) => t.status !== "past");
  const [tripId, setTripId] = useState(options[0]?.id ?? "");
  const [text, setText] = useState("");
  const [data, setData] = useState<Imported | null>(null);
  const [expense, setExpense] = useState(true);
  const [error, setError] = useState("");
  const trip = trips.find((t) => t.id === tripId);

  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => before?.focus();
  }, []);

  const read = () => {
    setError("");
    const year = trip?.start ? Number(trip.start.slice(0, 4)) : new Date().getFullYear();
    const r = parseConfirmation(text, year);
    if (r.kind === "unknown") setError(tr("Não reconhecemos um voo, hospedagem ou aluguel de carro nesse texto. Confira se colou a confirmação inteira ou cadastre direto na viagem."));
    setData(r.kind === "unknown" ? null : r);
  };
  const leg = (i: number, patch: Partial<ImportedLeg>) => data && setData({ ...data, legs: data.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  async function save() {
    if (!trip || !data) return;
    setError("");
    try {
      const next = applyImport(trip, data, { expense });
      if ((await onSave(next)) !== false) onClose();
    } catch (e) {
      setError(tr((e as Error).message));
    }
  }

  const field = (label: string, value: string | undefined, onChange: (v: string) => void, type = "text", extra?: { className?: string; maxLength?: number }) => (
    <label className={extra?.className}>
      {tr(label)}
      <input type={type} value={value ?? ""} maxLength={extra?.maxLength} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <dialog ref={ref} className="import-dialog" aria-labelledby="import-title" onCancel={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="import-head">
        <h2 id="import-title">
          <ClipboardPaste size={20} aria-hidden="true" /> {tr("Importar confirmação")}
        </h2>
        <button type="button" className="icon-button" aria-label={tr("Fechar")} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {!options.length ? (
        <p>{tr("Crie uma viagem primeiro para importar reservas nela.")}</p>
      ) : !data ? (
        <>
          <p className="import-hint">{tr("Cole o texto do e-mail ou do PDF de confirmação de um voo, hotel ou aluguel de carro. A leitura é feita aqui no seu aparelho; o texto não é enviado para nenhum lugar.")}</p>
          <label>
            {tr("Viagem")}
            <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Texto da confirmação")}
            <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Cole aqui (no PDF, selecione o texto e copie)")} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="import-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {tr("Cancelar")}
            </button>
            <button type="button" className="primary" disabled={text.trim().length < 20} onClick={read}>
              {tr("Ler confirmação")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="import-hint">{tf("Encontramos: {kind}. Confira e corrija antes de adicionar em {trip}.", { kind: tr(kinds[data.kind as keyof typeof kinds]), trip: trip?.title ?? "" })}</p>
          {data.codeFound && (
            <p className="import-secret">
              <ShieldCheck size={16} aria-hidden="true" /> {tr("O texto tem um código de reserva. Por segurança ele não é copiado; se quiser, guarde-o depois no campo protegido da reserva.")}
            </p>
          )}
          {data.kind === "flight" && (
            <div className="import-legs">
              {data.legs.map((l, i) => (
                <fieldset key={i} className="import-leg">
                  <legend>{tf("Trecho {n}", { n: i + 1 })}</legend>
                  <div className="import-grid">
                    {field("Origem", l.from, (v) => leg(i, { from: v }))}
                    {field("Destino", l.to, (v) => leg(i, { to: v }))}
                    {field("Companhia", l.carrier, (v) => leg(i, { carrier: v.toUpperCase() }), "text", { maxLength: 3 })}
                    {field("Número do voo", l.number, (v) => leg(i, { number: v }), "text", { maxLength: 5 })}
                    {field("Data de partida", l.departDate, (v) => leg(i, { departDate: v }), "date")}
                    {field("Hora de partida", l.departTime, (v) => leg(i, { departTime: v }), "time")}
                    {field("Data de chegada", l.arriveDate, (v) => leg(i, { arriveDate: v }), "date")}
                    {field("Hora de chegada", l.arriveTime, (v) => leg(i, { arriveTime: v }), "time")}
                  </div>
                  {data.legs.length > 1 && (
                    <button type="button" className="text-button" onClick={() => setData({ ...data, legs: data.legs.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} /> {tr("Tirar este trecho")}
                    </button>
                  )}
                </fieldset>
              ))}
              <button type="button" className="text-button" onClick={() => setData({ ...data, legs: [...data.legs, emptyLeg()] })}>
                <Plus size={14} /> {tr("Adicionar trecho")}
              </button>
            </div>
          )}
          {data.kind === "stay" && data.stay && (
            <div className="import-grid">
              {field("Nome da hospedagem", data.stay.name, (v) => setData({ ...data, stay: { ...data.stay!, name: v } }), "text", { className: "wide" })}
              {field("Endereço", data.stay.address, (v) => setData({ ...data, stay: { ...data.stay!, address: v } }), "text", { className: "wide" })}
              {field("Entrada", data.stay.start, (v) => setData({ ...data, stay: { ...data.stay!, start: v } }), "date")}
              {field("Horário do check-in", data.stay.checkInTime, (v) => setData({ ...data, stay: { ...data.stay!, checkInTime: v } }), "time")}
              {field("Saída", data.stay.end, (v) => setData({ ...data, stay: { ...data.stay!, end: v } }), "date")}
              {field("Horário do check-out", data.stay.checkOutTime, (v) => setData({ ...data, stay: { ...data.stay!, checkOutTime: v } }), "time")}
            </div>
          )}
          {data.kind === "car" && data.car && (
            <div className="import-grid">
              {field("Locadora", data.car.company, (v) => setData({ ...data, car: { ...data.car!, company: v } }), "text", { className: "wide" })}
              {field("Local de retirada", data.car.pickupPlace, (v) => setData({ ...data, car: { ...data.car!, pickupPlace: v } }), "text", { className: "wide" })}
              {field("Data de retirada", data.car.pickupDate, (v) => setData({ ...data, car: { ...data.car!, pickupDate: v } }), "date")}
              {field("Hora de retirada", data.car.pickupTime, (v) => setData({ ...data, car: { ...data.car!, pickupTime: v } }), "time")}
              {field("Local de devolução", data.car.dropoffPlace, (v) => setData({ ...data, car: { ...data.car!, dropoffPlace: v } }), "text", { className: "wide" })}
              {field("Data de devolução", data.car.dropoffDate, (v) => setData({ ...data, car: { ...data.car!, dropoffDate: v } }), "date")}
              {field("Hora de devolução", data.car.dropoffTime, (v) => setData({ ...data, car: { ...data.car!, dropoffTime: v } }), "time")}
            </div>
          )}
          {data.price && (
            <div className="import-price">
              <div className="import-grid">
                {field("Valor", String(data.price.amount), (v) => setData({ ...data, price: { ...data.price!, amount: Number(v.replace(",", ".")) || 0 } }), "text")}
                {field("Moeda", data.price.currency, (v) => setData({ ...data, price: { ...data.price!, currency: v.toUpperCase().slice(0, 3) } }), "text", { maxLength: 3 })}
              </div>
              <label className="checkbox-label">
                <input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />
                {tr("Registrar o valor como despesa reservada (ainda não paga)")}
              </label>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="import-actions">
            <button type="button" className="secondary" onClick={() => setData(null)}>
              {tr("Voltar")}
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
              {tr("Adicionar à viagem")}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
