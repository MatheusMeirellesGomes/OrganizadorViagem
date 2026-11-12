import { ArrowRight } from "lucide-react";
import { t as tr, tf, formatNumber } from "../i18n";
import type { Trip } from "../model";
import { hideOnError } from "../decor";
import { overviewMetrics } from "./metrics";

/** Four photo cards under the hero of the overview, with the person's real numbers. */
export function HomeMetrics({ trips, onOpen }: { trips: Trip[]; onOpen: (page: "trips" | "history") => void }) {
  return (
    <ul className="metric-cards" aria-label={tr("Seus números")}>
      {overviewMetrics(trips).map((m) => (
        <li key={m.key}>
          <button className={"metric-card metric-" + m.key} onClick={() => onOpen(m.page)}>
            <span className="metric-photo" aria-hidden="true">
              <img src={m.photo.url} alt="" loading="lazy" onError={hideOnError} />
            </span>
            <span className="metric-body">
              <strong>{formatNumber(m.value, 0)}</strong>
              <span className="metric-label">{tr(m.label)}</span>
              <span className="metric-text">{tr(m.text)}</span>
              <span className="metric-go">
                {m.page === "history" ? tr("Ver histórico") : tr("Ver viagens")} <ArrowRight size={14} aria-hidden="true" />
              </span>
            </span>
            <span className="metric-source">
              {m.photo.kind === "place" ? tf("Foto de {name} · Wikimedia Commons", { name: m.photo.place.name }) : tr("Imagem ilustrativa")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
