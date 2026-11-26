import { useState } from "react";
import { Check, ExternalLink, Heart, MapPin, Trash2, Undo2 } from "lucide-react";
import { getLocale, t as tr, tf } from "../i18n";
import { collections, loadWishes, markVisited, removeWish, saveWishes, type WishItem } from "../traveler/wishlist";
import { countryName, flag } from "./passport";

/*
 * Quero Conhecer no Meu Espaço: os lugares salvos no Modo Viajante, em
 * coleções. Fica neste aparelho (a cópia na conta depende da migração 005).
 */

export function WishSection({ onTraveler }: { onTraveler?: () => void }) {
  const [list, setList] = useState<WishItem[]>(loadWishes);
  const [group, setGroup] = useState("");
  const [confirm, setConfirm] = useState("");
  const update = (next: WishItem[]) => {
    setList(next);
    saveWishes(next);
  };
  const groups = collections(list);
  const shown = list.filter((w) => !group || w.collection === group);
  const visited = list.filter((w) => w.visitedAt).length;
  const locale = getLocale();

  if (!list.length)
    return (
      <section className="space-card wish-empty">
        <Heart size={28} aria-hidden="true" />
        <p>{tr("Os lugares que você salvar no Modo Viajante, como “Quero conhecer” ou numa coleção sua, aparecem aqui, mesmo fora de qualquer viagem.")}</p>
        {onTraveler && (
          <button type="button" className="primary small" onClick={onTraveler}>
            {tr("Abrir o Modo Viajante")}
          </button>
        )}
      </section>
    );

  return (
    <section className="space-group" aria-labelledby="wish-title">
      <h3 id="wish-title">{tf("{n} lugares · {v} já visitados", { n: list.length, v: visited })}</h3>
      {groups.length > 1 && (
        <div className="wish-groups" role="group" aria-label={tr("Coleções")}>
          <button type="button" aria-pressed={!group} className={!group ? "on" : ""} onClick={() => setGroup("")}>
            {tr("Todas")} <small>{list.length}</small>
          </button>
          {groups.map((g) => (
            <button key={g.name} type="button" aria-pressed={group === g.name} className={group === g.name ? "on" : ""} onClick={() => setGroup(group === g.name ? "" : g.name)}>
              {g.name === "Quero conhecer" ? tr(g.name) : g.name} <small>{g.count}</small>
            </button>
          ))}
        </div>
      )}
      <ul className="wish-list">
        {shown.map((w) => {
          const key = w.place.id + w.collection;
          const cc = (w.place.tags?.country_code || "").toUpperCase();
          const img = w.place.tags?.image;
          const where = [w.place.city, cc ? countryName(cc, locale) : w.place.country].filter(Boolean).join(", ");
          return (
            <li key={key} className={"wish-item" + (w.visitedAt ? " is-visited" : "")}>
              <span className="wish-photo" aria-hidden="true">
                {img && /^https:\/\/(upload|commons)\.wikimedia\.org\//.test(img) ? <img src={img} alt="" loading="lazy" /> : <MapPin size={22} />}
              </span>
              <span className="wish-text">
                <b>{w.place.name}</b>
                <small>
                  {cc && flag(cc) + " "}
                  {where || w.place.address || tr("Local salvo")}
                </small>
                <small>
                  {w.collection === "Quero conhecer" ? tr(w.collection) : w.collection}
                  {w.visitedAt ? " · " + tf("Visitado em {date}", { date: new Date(w.visitedAt).toLocaleDateString(locale) }) : ""}
                </small>
              </span>
              <span className="wish-actions">
                <button type="button" className="secondary small" onClick={() => update(markVisited(list, w.place.id, !w.visitedAt))}>
                  {w.visitedAt ? <Undo2 size={15} /> : <Check size={15} />} {w.visitedAt ? tr("Desmarcar") : tr("Já visitei")}
                </button>
                {w.place.coordinates && (
                  <a className="secondary small" href={"https://www.google.com/maps/search/?" + new URLSearchParams({ api: "1", query: `${w.place.coordinates.lat},${w.place.coordinates.lng}` })} target="_blank" rel="noopener noreferrer" aria-label={tf("Ver {name} no mapa", { name: w.place.name })}>
                    <ExternalLink size={15} /> {tr("Mapa")}
                  </a>
                )}
                {confirm === key ? (
                  <button type="button" className="secondary small danger" onClick={() => { update(removeWish(list, w.place.id, w.collection)); setConfirm(""); }}>
                    <Trash2 size={15} /> {tr("Confirmar remoção")}
                  </button>
                ) : (
                  <button type="button" className="icon-button" aria-label={tf("Remover {name}", { name: w.place.name })} onClick={() => setConfirm(key)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="space-note">{tr("Os lugares marcados como visitados também entram no seu passaporte. Por enquanto, esta lista fica salva neste aparelho e entra no backup.")}</p>
    </section>
  );
}
