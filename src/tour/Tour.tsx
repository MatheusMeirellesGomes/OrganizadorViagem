import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t as tr, tf, useLanguage } from "../i18n";
import { findTarget, placeCard, type TourStep } from "./steps";
import "./tour.css";

type Rect = { top: number; bottom: number; left: number; width: number; height: number };
const pad = 6;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Tour guiado sem biblioteca: escurece a tela, recorta o elemento do passo,
 * mostra título, texto, progresso e Voltar/Próximo. Esc ou X encerram.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (finished: boolean) => void }) {
  useLanguage();
  // Só os passos cujo elemento está na tela agora (ou passos sem alvo).
  const [visible] = useState(() => steps.filter((s) => !s.target || findTarget(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: string } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const step = visible[index];
  const last = index === visible.length - 1;

  const measure = useCallback(() => {
    const el = step?.target ? findTarget(step.target) : null;
    const r = el?.getBoundingClientRect();
    const next = r ? { top: r.top - pad, bottom: r.bottom + pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 } : null;
    setRect(next);
    const c = card.current;
    if (!c) return;
    const nav = document.querySelector(".mobile-nav");
    const navH = nav && getComputedStyle(nav).display !== "none" && !nav.contains(el ?? null) ? nav.getBoundingClientRect().height : 0;
    setPos(placeCard(next, { width: c.offsetWidth, height: c.offsetHeight }, { width: innerWidth, height: innerHeight, bottomInset: navH }));
  }, [step]);

  // Leva o alvo para o meio da tela e mede de novo enquanto rola.
  useLayoutEffect(() => {
    const el = step?.target ? findTarget(step.target) : null;
    el?.scrollIntoView({ block: "center", inline: "center", behavior: reduced() ? "auto" : "smooth" });
    measure();
    const timer = window.setTimeout(measure, reduced() ? 0 : 380);
    title.current?.focus();
    return () => window.clearTimeout(timer);
  }, [step, measure]);

  useEffect(() => {
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    addEventListener("resize", onMove);
    addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", onMove);
      removeEventListener("scroll", onMove, true);
    };
  }, [measure]);

  const close = useCallback(
    (finished: boolean) => {
      onClose(finished);
      // Devolve o foco a quem abriu o tour; se era a página, vai para o conteúdo.
      const back = opener.current as HTMLElement | null;
      if (back && back !== document.body && back.isConnected && !back.classList.contains("skip-content")) back.focus();
      else document.getElementById("main-content")?.focus({ preventScroll: true });
    },
    [onClose],
  );
  const next = () => (last ? close(true) : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Teclado: Esc fecha, setas navegam e o Tab fica dentro do cartão.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    } else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
    else if (e.key === "Tab" && card.current) {
      const items = [...card.current.querySelectorAll<HTMLElement>("button")];
      const first = items[0], end = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!step) return null;
  return (
    <div className="tour" onKeyDown={onKeyDown}>
      <div className="tour-block" aria-hidden="true" />
      {rect ? (
        <div className="tour-spot" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={card}
        className={"tour-card is-" + (pos?.side ?? "center")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
      >
        <div className="tour-head">
          <span className="tour-progress" aria-live="polite">
            {tf("Etapa {current} de {total}", { current: index + 1, total: visible.length })}
          </span>
          <button type="button" className="tour-x" aria-label={tr("Fechar tutorial")} onClick={() => close(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="tour-bar" aria-hidden="true">
          <span style={{ width: `${((index + 1) / visible.length) * 100}%` }} />
        </div>
        <h2 id="tour-title" ref={title} tabIndex={-1}>
          {tr(step.title)}
        </h2>
        <p id="tour-text">{tr(step.text)}</p>
        <div className="tour-foot">
          {!last && (
            <button type="button" className="tour-skip" onClick={() => close(false)}>
              {tr("Pular tutorial")}
            </button>
          )}
          <span className="tour-nav">
            {index > 0 && (
              <button type="button" className="secondary" onClick={back}>
                <ArrowLeft size={16} /> {tr("Voltar")}
              </button>
            )}
            <button type="button" className="primary" onClick={next}>
              {last ? tr("Concluir") : tr("Próximo")} {!last && <ArrowRight size={16} />}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Convite do primeiro acesso. */
export function TourWelcome({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  useLanguage();
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);
  return (
    <div className="tour" onKeyDown={(e) => e.key === "Escape" && onLater()}>
      <div className="tour-dim" aria-hidden="true" />
      <div className="tour-card tour-welcome is-center" role="dialog" aria-modal="true" aria-labelledby="tour-welcome-title" aria-describedby="tour-welcome-text">
        <span className="tour-globe" aria-hidden="true">
          🌍✈️
        </span>
        <h2 id="tour-welcome-title">{tr("Bem-vindo ao Gomes pelo Mundo!")}</h2>
        <p id="tour-welcome-text">{tr("Quer um passeio rápido pelas principais áreas? Leva menos de um minuto e não altera nada nas suas viagens.")}</p>
        <div className="tour-foot">
          <button type="button" className="secondary" onClick={onLater}>
            {tr("Agora não")}
          </button>
          <button type="button" className="primary" ref={start} onClick={onStart}>
            {tr("Iniciar tour")} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
