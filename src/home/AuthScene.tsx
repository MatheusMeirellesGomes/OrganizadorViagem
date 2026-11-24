import { useEffect, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { t as tr } from "../i18n";

/*
 * Sign-in backdrop: real, high-resolution travel photos (Unsplash License)
 * that slowly cross-fade. The caption names a place only when the photo
 * really shows it.
 */
const photo = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=82`;
export const authSlides = [
  { id: "1530789253388-582c481c54b0", place: "Capadócia, Turquia", focus: "60% 40%" },
  { id: "1506905925346-21bda4d32df4", place: "Acima das nuvens", focus: "50% 45%" },
  { id: "1507525428034-b723cf961d3e", place: "Pôr do sol no mar", focus: "50% 55%" },
];

export function AuthScene({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const i = setInterval(() => setIndex((n) => (n + 1) % authSlides.length), 7000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="auth-wrap">
    <section className="auth-scene">
      <div className="auth-slides" aria-hidden="true">
        {authSlides.map((s, i) => (
          <img
            key={s.id}
            src={photo(s.id, 1600)}
            srcSet={`${photo(s.id, 960)} 960w, ${photo(s.id, 1600)} 1600w, ${photo(s.id, 2560)} 2560w`}
            sizes="(max-width: 900px) 100vw, 80vw"
            alt=""
            loading={i ? "lazy" : "eager"}
            style={{ objectPosition: s.focus }}
            className={i === index ? "is-on" : ""}
          />
        ))}
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
        <span className="auth-place">
          <MapPin size={14} aria-hidden="true" /> {tr(authSlides[index].place)}
        </span>
      </div>
      {children}
    </section>
    </div>
  );
}
