import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";
import { t as tr } from "../i18n";
import { coverLabels, pictures, statusLabels, type Trip, type TripScope } from "../model";

/** What can be added later, shown so nobody feels they must plan everything now. */
export const laterItems = ["Destinos", "Datas", "Viajantes", "Hospedagens", "Passagens", "Transportes", "Reservas", "Passeios", "Orçamento"];

/**
 * New trip (Etapa 16): only the name matters; everything else is optional and
 * tucked into "Mais detalhes". The banner shows the chosen cover photo.
 */
export function NewTripForm({
  onSubmit,
  onClose,
  busy,
  scope,
  status,
  scopePicker,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  busy: boolean;
  scope: TripScope;
  status: Trip["status"];
  scopePicker: (value: TripScope) => ReactNode;
}) {
  const [cover, setCover] = useState<keyof typeof pictures>("coast");
  return (
    <form className="new-trip" onSubmit={onSubmit} aria-labelledby="new-trip-title">
      <div className="new-trip-banner" style={{ backgroundImage: `url(${pictures[cover]})` }}>
        <button type="button" className="icon-button new-trip-close" aria-label={tr("Fechar")} onClick={onClose}>
          <X size={18} />
        </button>
        <div>
          <span className="new-trip-kicker">{tr("Nova viagem")}</span>
          <h2 id="new-trip-title">{tr("Todo caminho começa com uma ideia.")}</h2>
        </div>
      </div>
      <div className="new-trip-body">
        <p className="muted">{tr("Preencha só o que já sabe. O resto pode esperar.")}</p>
        <label>
          {tr("Nome da viagem")}
          <input name="title" placeholder={tr("Uma nova aventura")} autoComplete="off" maxLength={120} />
        </label>
        <label>
          <span>
            {tr("Destino")} <small>{tr("opcional")}</small>
          </span>
          <input name="destination" placeholder={tr("Para onde a vontade leva?")} autoComplete="off" maxLength={120} />
        </label>
        <details className="new-trip-more">
          <summary>{tr("Mais detalhes (opcional)")}</summary>
          <div className="form-grid">
            <label>
              {tr("Ida")}
              <input type="date" name="start" />
            </label>
            <label>
              {tr("Volta")}
              <input type="date" name="end" />
            </label>
          </div>
          {scopePicker(scope)}
          <label>
            {tr("Momento da viagem")}
            <select name="status" defaultValue={status}>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option value={k} key={k}>
                  {tr(v)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="cover-picker">
            <legend>{tr("Uma capa para começar")}</legend>
            {Object.entries(pictures).map(([k, v]) => (
              <label key={k} style={{ backgroundImage: `url(${v})` }}>
                <input type="radio" name="cover" value={k} checked={cover === k} onChange={() => setCover(k as keyof typeof pictures)} />
                <span>{tr(coverLabels[k as keyof typeof pictures])}</span>
              </label>
            ))}
          </fieldset>
        </details>
        <div className="new-trip-later">
          <span>{tr("Depois, quando quiser:")}</span>
          <ul>
            {laterItems.map((i) => (
              <li key={i}>{tr(i)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="new-trip-footer">
        <button className="primary full" disabled={busy}>
          {busy ? tr("Salvando…") : tr("Criar viagem")}
          <ArrowRight size={17} />
        </button>
        <span className="form-footnote">{tr("Sem orçamento obrigatório. Sem pressa.")}</span>
      </div>
    </form>
  );
}
