import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { t as tr, useLanguage } from "../i18n";
import { loadTourState, restartEvent, restartTour, saveTourStatus, tours, type TourName } from "./steps";
import { Tour, TourWelcome } from "./Tour";

/**
 * Decide quando mostrar o convite e cada tour.
 * - Primeiro acesso, na Visão geral: convite com "Iniciar tour" e "Agora não".
 * - Primeira viagem aberta depois do tour inicial: tour curto da viagem.
 * - "Reiniciar tutorial" em Configurações volta para a Visão geral e começa de novo.
 */
export function TourHost({ onHome, onTrip, blocked, goHome }: { onHome: boolean; onTrip: boolean; blocked: boolean; goHome: () => void }) {
  const [active, setActive] = useState<"welcome" | TourName | null>(null);

  useEffect(() => {
    if (active || blocked) return;
    const state = loadTourState();
    let next: "welcome" | TourName | null = null;
    if (onHome && !state.home) next = "welcome";
    else if (onTrip && state.home === "done" && !state.trip) next = "trip";
    if (!next) return;
    const timer = window.setTimeout(() => setActive(next), 700);
    return () => window.clearTimeout(timer);
  }, [onHome, onTrip, blocked, active]);

  useEffect(() => {
    const restart = () => {
      goHome();
      window.setTimeout(() => setActive("home"), 350);
    };
    addEventListener(restartEvent, restart);
    return () => removeEventListener(restartEvent, restart);
  }, [goHome]);

  if (active === "welcome")
    return (
      <TourWelcome
        onStart={() => setActive("home")}
        onLater={() => {
          saveTourStatus("home", "skipped");
          setActive(null);
        }}
      />
    );
  if (active === "home" || active === "trip")
    return (
      <Tour
        key={active}
        steps={tours[active]}
        onClose={(finished) => {
          saveTourStatus(active, finished ? "done" : "skipped");
          setActive(null);
        }}
      />
    );
  return null;
}

/** Linha de Configurações para rever o tutorial. */
export function TourSetting() {
  useLanguage();
  return (
    <li>
      <span>
        <b>{tr("Tutorial")}</b>
        <small>{tr("Um passeio rápido pelas principais áreas do app.")}</small>
      </span>
      <button type="button" className="secondary small" onClick={restartTour}>
        <RotateCcw size={15} /> {tr("Reiniciar tutorial")}
      </button>
    </li>
  );
}
