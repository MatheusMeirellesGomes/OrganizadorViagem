import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, Lock, Trash2 } from "lucide-react";
import { t as tr } from "../i18n";
import type { SecretStore } from "./secrets";

/**
 * Booking reference hidden by default. "Mostrar" reads it from the private
 * store for 30 seconds. The value is never written to the trip data.
 */
export function SecretView({ store, tripId, refId, label = "Localizador" }: { store: SecretStore; tripId: string; refId: string; label?: string }) {
  const [value, setValue] = useState<string>();
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function reveal() {
    setError("");
    try {
      const v = await store.get(tripId, refId);
      if (!v) return setError("Nenhum código guardado neste aparelho ou conta.");
      setValue(v);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(undefined), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir o código.");
    }
  }
  return (
    <span className="secret-view">
      <Lock size={13} aria-hidden="true" />
      <span>{tr(label)}:</span>
      <code aria-live="polite">{value ?? "••••••"}</code>
      {value ? (
        <>
          <button type="button" className="text-button small" onClick={() => navigator.clipboard?.writeText(value)} aria-label={tr("Copiar código")}>
            <Copy size={13} />
          </button>
          <button type="button" className="text-button small" onClick={() => setValue(undefined)}>
            <EyeOff size={13} /> {tr("Ocultar")}
          </button>
        </>
      ) : (
        <button type="button" className="text-button small" onClick={reveal}>
          <Eye size={13} /> {tr("Mostrar")}
        </button>
      )}
      {error && <small role="alert">{tr(error)}</small>}
    </span>
  );
}

/** Field for a new or replaced code inside a form. Empty keeps the current one. */
export function SecretInput({ has, onRemove, label = "Localizador / código da reserva (PNR)" }: { has?: boolean; onRemove?: () => void; label?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="secret-input">
      <label>
        <span>
          <Lock size={13} aria-hidden="true" /> {tr(label)}
        </span>
        <span className="secret-input-row">
          <input
            name="secret"
            type={shown ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            placeholder={has ? tr("Guardado. Digite para trocar") : tr("Opcional")}
          />
          <button type="button" className="icon-button" onClick={() => setShown((x) => !x)} aria-label={shown ? tr("Ocultar") : tr("Mostrar")}>
            {shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          {has && onRemove && (
            <button type="button" className="icon-button" onClick={onRemove} aria-label={tr("Apagar código guardado")}>
              <Trash2 size={15} />
            </button>
          )}
        </span>
      </label>
      <small className="muted">{tr("Fica fora dos dados da viagem: não vai para backups, links, participantes nem para o assistente.")}</small>
    </div>
  );
}
