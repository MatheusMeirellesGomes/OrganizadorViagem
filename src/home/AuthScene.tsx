import { useEffect, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { t as tr } from "../i18n";

/*
 * Sign-in backdrop: real, high-resolution travel photos (Unsplash License)
 * that slowly cross-fade. The caption names a place only when the photo
 * really shows it.
 */
const photo = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
/**
 * Fotos reais (Licença Unsplash). A legenda só nomeia o lugar quando a foto
 * mostra mesmo aquele lugar; paisagens genéricas recebem uma legenda genérica.
 * As três primeiras são as originais da tela de entrada.
 */
export const authSlides = [
  { id: "1530789253388-582c481c54b0", place: "Capadócia, Turquia", focus: "60% 40%" },
  { id: "1506905925346-21bda4d32df4", place: "Acima das nuvens", focus: "50% 45%" },
  { id: "1507525428034-b723cf961d3e", place: "Pôr do sol no mar", focus: "50% 55%" },
  { id: "1545161296-d9c2c241f2ad", place: "Matterhorn, Suíça", focus: "50% 30%" },
  { id: "1534106474077-f9e9c6f5a47c", place: "Seceda, Dolomitas, Itália", focus: "50% 50%" },
  { id: "1614722860207-909e0e8dfd99", place: "Fernando de Noronha, Brasil", focus: "45% 50%" },
  { id: "1483729558449-99ef09a8c325", place: "Rio de Janeiro, Brasil", focus: "60% 50%" },
  { id: "1590246185449-e9e2ddd683bb", place: "Cataratas do Iguaçu", focus: "60% 30%" },
  { id: "1585208798174-6cedd86e019a", place: "Lisboa, Portugal", focus: "50% 50%" },
  { id: "1552832230-c0197dd311b5", place: "Coliseu, Roma", focus: "50% 50%" },
  { id: "1511739001486-6bfe10ce785f", place: "Torre Eiffel, Paris", focus: "50% 40%" },
  { id: "1501785888041-af3ef285b470", place: "Lago di Braies, Itália", focus: "50% 55%" },
  { id: "1499092346589-b9b6be3e94b2", place: "Manhattan, Nova York", focus: "50% 50%" },
  { id: "1526481280693-3bfa7568e0f3", place: "Monte Fuji, Japão", focus: "50% 50%" },
  { id: "1513407030348-c983a97b98d8", place: "Tóquio à noite, Japão", focus: "50% 50%" },
  { id: "1573843981267-be1999ff37cd", place: "Maldivas", focus: "50% 50%" },
  { id: "1542401886-65d6c61db217", place: "Dunas no deserto", focus: "50% 50%" },
  { id: "1489363855452-7327672b1608", place: "Estrada entre montanhas", focus: "50% 60%" },
  { id: "1436491865332-7a61a109cc05", place: "Em pleno voo", focus: "50% 50%" },
];

const orderKey = "gomes-entrada-ordem";
/** Embaralha a ordem a cada acesso, sem começar pela mesma foto da última vez. */
export function slideOrder(count: number, last: number | null, random = Math.random): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count > 1 && order[0] === last) order.push(order.shift()!);
  return order;
}

export function AuthScene({ children }: { children: ReactNode }) {
  const [order] = useState(() => {
    let last: number | null = null;
    try {
      const v = Number(localStorage.getItem(orderKey));
      if (Number.isInteger(v)) last = v;
    } catch {
      /* sem armazenamento */
    }
    const o = slideOrder(authSlides.length, last);
    try {
      localStorage.setItem(orderKey, String(o[0]));
    } catch {
      /* sem armazenamento */
    }
    return o;
  });
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const i = setInterval(() => setStep((n) => n + 1), 7000);
    return () => clearInterval(i);
  }, []);
  // Só a foto atual e a próxima ficam na página (a próxima já carrega por trás).
  const usable = order.filter((i) => !failed.has(i));
  const current = usable.length ? usable[step % usable.length] : -1;
  const next = usable.length > 1 ? usable[(step + 1) % usable.length] : -1;
  const slide = current >= 0 ? authSlides[current] : null;
  return (
    <div className="auth-wrap">
    <section className="auth-scene">
      <div className="auth-slides" aria-hidden="true">
        {[current, next]
          .filter((i) => i >= 0)
          .map((i) => {
            const s = authSlides[i];
            return (
              <img
                key={s.id}
                src={photo(s.id, 1600)}
                srcSet={`${photo(s.id, 960)} 960w, ${photo(s.id, 1600)} 1600w, ${photo(s.id, 2560)} 2560w`}
                sizes="(max-width: 900px) 100vw, 80vw"
                alt=""
                decoding="async"
                style={{ objectPosition: s.focus }}
                className={i === current ? "is-on" : ""}
                onError={() => setFailed((f) => new Set(f).add(i))}
              />
            );
          })}
      </div>
      <div className="auth-shade" aria-hidden="true" />
      <div className="auth-copy">
        <div className="auth-brand">
          <img src="/gomes-landscape-g.png" alt="" width="64" height="64" />
          <span>
            GOMES<small>PELO MUNDO</small>
          </span>
        </div>
        <h1>{tr("Seu mundo começa aqui.")}</h1>
        <p>{tr("Roteiros, passagens, hospedagens e lembranças da família, organizados num só lugar.")}</p>
        {slide && (
          <span className="auth-place">
            <MapPin size={14} aria-hidden="true" /> {tr(slide.place)}
          </span>
        )}
      </div>
      {children}
    </section>
    </div>
  );
}
