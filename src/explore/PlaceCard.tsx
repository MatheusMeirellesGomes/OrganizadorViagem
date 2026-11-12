import { useState } from "react";
import {
  Landmark, Castle, Church, TreePine, Mountain, Waves, Utensils, Coffee, IceCream, Croissant,
  Building2, Camera, Ticket, Theater, ShoppingBasket, Binoculars, PawPrint, MapPin,
} from "lucide-react";
import { t as tr, tf, formatNumber, formatMoney } from "../i18n";
import { categories, distanceKm, type Place, type Point } from "../places";
import { verifiedPhoto } from "./photos";
import { familyCategories, outdoorCategories, indoorCategories } from "./categories";
import { openNow, priceLevel } from "./restaurants";
import { safeExternalUrl } from "../travel-mode";

const icons: Record<string, typeof Landmark> = {
  palace: Landmark, castle: Castle, place_of_worship: Church, park: TreePine, garden: TreePine,
  mountain: Mountain, trail: Mountain, beach: Waves, nature: Waves, restaurant: Utensils,
  fast_food: Utensils, food_court: Utensils, cafe: Coffee, ice_cream: IceCream, bakery: Croissant,
  pastry: Croissant, museum: Building2, gallery: Building2, culture: Theater, stadium: Ticket,
  marketplace: ShoppingBasket, viewpoint: Binoculars, zoo: PawPrint, aquarium: PawPrint,
};
export const iconFor = (category: string) => icons[category] ?? MapPin;

/** Real photo of the place, or a neutral category illustration clearly labelled. */
export function PlacePhoto({ place, large = false, credit = true }: { place: Place; large?: boolean; credit?: boolean }) {
  const photo = verifiedPhoto(place, large ? 960 : 640);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const Icon = iconFor(place.category);
  if (!photo || state === "failed")
    return (
      <div className={"place-photo place-photo-empty cat-" + place.category}>
        <Icon size={large ? 44 : 34} strokeWidth={1.5} aria-hidden="true" />
        <span>{state === "failed" ? tr("Foto indisponível agora") : tr("Sem foto verificada")}</span>
      </div>
    );
  return (
    <figure className={"place-photo " + (state === "loading" ? "is-loading" : "")}>
      <img
        src={photo.url}
        alt={tf("Foto de {name}", { name: place.name })}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState("ok")}
        onError={() => setState("failed")}
      />
      {credit && <PhotoCredit place={place} />}
    </figure>
  );
}

export function PhotoCredit({ place: p }: { place: Place }) {
  const photo = verifiedPhoto(p);
  if (!photo) return null;
  const page = "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(photo.file.replace(/ /g, "_"));
  const license = safeExternalUrl(p.tags.image_license_url || "");
  return (
    <figcaption className="photo-credit">
      <Camera size={12} aria-hidden="true" />{" "}
      <a href={page} target="_blank" rel="noreferrer">
        {p.tags.image_artist || tr("Wikimedia Commons")}
      </a>
      {p.tags.image_license && (
        <>
          {" · "}
          {license ? (
            <a href={license} target="_blank" rel="noreferrer">
              {p.tags.image_license}
            </a>
          ) : (
            p.tags.image_license
          )}
        </>
      )}
    </figcaption>
  );
}

/** Price text only from registered data. */
export function priceText(p: Place): string | undefined {
  if (p.tags.fee === "no") return tr("Gratuito");
  if (p.tags.charge && p.tags.currency) {
    const n = Number(p.tags.charge);
    if (Number.isFinite(n)) return tf("A partir de {price}", { price: formatMoney(n, p.tags.currency) });
  }
  if (p.tags.fee === "yes") return tr("Pago");
  const level = priceLevel(p);
  if (level) return "€".repeat(level);
  return;
}

/** Small honest labels: each one comes from a registered tag or the category itself. */
export function badgesFor(p: Place, now = new Date()): string[] {
  const b: string[] = [];
  const price = priceText(p);
  if (price) b.push(price);
  if (p.tags.heritage === "yes") b.push(tr("Patrimônio"));
  if (familyCategories.has(p.category)) b.push(tr("Ideal para famílias"));
  if (outdoorCategories.has(p.category)) b.push(tr("Ao ar livre"));
  else if (indoorCategories.has(p.category)) b.push(tr("Ambiente interno"));
  if (p.tags.wheelchair === "yes") b.push(tr("Acessível"));
  if (["recommended", "required"].includes(p.tags.reservation ?? "")) b.push(tr("Reserva recomendada"));
  const open = openNow(p, now);
  if (open !== undefined) b.push(open ? tr("Aberto agora") : tr("Fechado agora"));
  if (["yes", "only"].includes(p.tags["diet:vegetarian"] ?? "")) b.push(tr("Opções vegetarianas"));
  return b.slice(0, 4);
}

export function PlaceCard({
  place: p,
  center,
  selected,
  saved,
  onOpen,
  onSelect,
  onSave,
  onAdd,
  busy,
}: {
  place: Place;
  center?: Point;
  selected: boolean;
  saved: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onSave: () => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const where = [p.tags["addr:suburb"], p.city || p.tags["addr:city"]].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ");
  const cuisine = p.tags.cuisine?.split(/[;,]/).slice(0, 2).join(", ").replace(/_/g, " ");
  return (
    <article
      className={"place-card" + (selected ? " is-selected" : "")}
      id={"place-" + p.id.replace(/[^\w-]/g, "_")}
      onMouseEnter={onSelect}
      onFocus={onSelect}
    >
      <div className="place-card-photo">
        <button onClick={onOpen} aria-label={tf("Ver detalhes de {name}", { name: p.name })}>
          <PlacePhoto place={p} credit={false} />
        </button>
        {verifiedPhoto(p) && <PhotoCredit place={p} />}
      </div>
      <div className="place-card-body">
        <p className="place-card-meta">
          <span>{tr(categories[p.category] ?? "Outros lugares")}</span>
          {center && <span>{tf("{km} km", { km: formatNumber(distanceKm(center, p.coordinates), 1) })}</span>}
        </p>
        <h3>
          <button className="text-link" onClick={onOpen}>
            {p.name}
          </button>
        </h3>
        {p.tags.official_name && <p className="place-card-official" lang="und">{p.tags.official_name}</p>}
        {(where || cuisine) && <p className="place-card-where">{[where, cuisine].filter(Boolean).join(" · ")}</p>}
        <ul className="place-badges" aria-label={tr("Informações")}>
          {badgesFor(p).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div className="place-card-actions">
          <button className="secondary" onClick={onOpen}>
            {tr("Detalhes")}
          </button>
          <button className="secondary" onClick={onSave} disabled={busy} aria-pressed={saved}>
            {saved ? tr("Salvo") : tr("Salvar")}
          </button>
          <button className="primary" onClick={onAdd} disabled={busy}>
            {tr("Adicionar ao roteiro")}
          </button>
        </div>
      </div>
    </article>
  );
}

export function SkeletonCard() {
  return (
    <div className="place-card skeleton" aria-hidden="true">
      <div className="place-photo" />
      <div className="place-card-body">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
