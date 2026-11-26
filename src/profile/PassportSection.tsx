import { useMemo, useState } from "react";
import { Plus, Stamp as StampIcon, X } from "lucide-react";
import type { Trip } from "../model";
import { getLocale, t as tr, tf, formatNumber } from "../i18n";
import { loadWishes } from "../traveler/wishlist";
import { allCountries, buildPassport, countryName, flag } from "./passport";
import type { Profile } from "./profile";
import "./passport.css";

const none: string[] = [];
const monthYear = (iso?: string) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString(getLocale(), { month: "short", year: "numeric", timeZone: "UTC" }) : "");

export function PassportSection({ trips, profile, onSave, onOpenTrip, busy }: { trips: Trip[]; profile: Profile; onSave: (p: Profile) => Promise<boolean>; onOpenTrip: (t: Trip) => void; busy?: boolean }) {
  const [adding, setAdding] = useState("");
  const manual = profile.visitedCountries ?? none;
  const passport = useMemo(() => buildPassport(trips, manual, loadWishes()), [trips, manual]);
  const locale = getLocale();
  const options = useMemo(
    () =>
      allCountries
        .filter((c) => !passport.countries.some((x) => x.code === c))
        .map((c) => [c, countryName(c, locale)] as const)
        .sort((a, b) => a[1].localeCompare(b[1], locale)),
    [passport, locale],
  );
  const visitedContinents = passport.continents.filter((c) => c.visited > 0).length;

  const add = async () => {
    if (!adding) return;
    if (await onSave({ ...profile, visitedCountries: [...manual, adding] })) setAdding("");
  };
  const remove = (code: string) => onSave({ ...profile, visitedCountries: manual.filter((c) => c !== code) });

  return (
    <>
      <section className="passport-cover" aria-label={tr("Resumo do passaporte")}>
        <div className="passport-emblem" aria-hidden="true">
          <StampIcon size={26} />
        </div>
        <div className="passport-id">
          <span>{tr("PASSAPORTE · GOMES PELO MUNDO")}</span>
          <b>{profile.name || tr("Viajante")}</b>
        </div>
        <ul className="passport-numbers">
          <li>
            <strong>{formatNumber(passport.countries.length)}</strong>
            <span>{passport.countries.length === 1 ? tr("país") : tr("países")}</span>
          </li>
          <li>
            <strong>{formatNumber(visitedContinents)}</strong>
            <span>{visitedContinents === 1 ? tr("continente") : tr("continentes")}</span>
          </li>
          <li>
            <strong>{formatNumber(passport.cities)}</strong>
            <span>{passport.cities === 1 ? tr("cidade") : tr("cidades")}</span>
          </li>
          <li>
            <strong>{formatNumber(passport.stamps.length)}</strong>
            <span>{passport.stamps.length === 1 ? tr("viagem concluída") : tr("viagens concluídas")}</span>
          </li>
        </ul>
      </section>

      <section className="space-group" aria-labelledby="pp-continents">
        <h3 id="pp-continents">{tr("Continentes")}</h3>
        <ul className="passport-continents">
          {passport.continents.map((c) => (
            <li key={c.id} className={"ct-" + c.id + (c.visited ? " on" : "")}>
              <span>
                <b>{tr(c.label)}</b>
                <small>{tf("{n} de {total}", { n: c.visited, total: c.total })}</small>
              </span>
              <span className="passport-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(c.visited ? 4 : 0, (c.visited / c.total) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-group" aria-labelledby="pp-countries">
        <h3 id="pp-countries">{tr("Países que você já conheceu")}</h3>
        {passport.countries.length ? (
          <ul className="passport-countries">
            {passport.countries.map((c) => (
              <li key={c.code}>
                <span className="passport-flag" aria-hidden="true">
                  {flag(c.code)}
                </span>
                <span>
                  <b>{countryName(c.code, locale)}</b>
                  <small>{c.trips.length ? (c.trips.length === 1 ? c.trips[0] : tf("{n} viagens", { n: c.trips.length })) : c.wish ? tr("Do Quero Conhecer") : tr("Marcado por você")}</small>
                </span>
                {c.manual && !c.trips.length && !c.wish && (
                  <button type="button" className="icon-button" aria-label={tf("Desmarcar {country}", { country: countryName(c.code, locale) })} disabled={busy} onClick={() => void remove(c.code)}>
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">{tr("Quando uma viagem for concluída, os países dela aparecem aqui. Você também pode marcar países que já conheceu antes de usar o app.")}</p>
        )}
        <div className="passport-add">
          <label htmlFor="pp-add">{tr("Já esteve em outro país?")}</label>
          <span>
            <select id="pp-add" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{tr("Escolha o país")}</option>
              {options.map(([code, name]) => (
                <option key={code} value={code}>
                  {flag(code)} {name}
                </option>
              ))}
            </select>
            <button type="button" className="secondary small" disabled={!adding || busy} onClick={() => void add()}>
              <Plus size={15} /> {tr("Marcar")}
            </button>
          </span>
        </div>
      </section>

      <section className="space-group" aria-labelledby="pp-stamps">
        <h3 id="pp-stamps">{tr("Carimbos")}</h3>
        {passport.stamps.length ? (
          <ul className="passport-stamps">
            {passport.stamps.map((s, i) => (
              <li key={s.trip.id}>
                <button type="button" className={"stamp stamp-" + (i % 5)} onClick={() => onOpenTrip(s.trip)} style={{ ["--tilt" as string]: `${((i * 37) % 9) - 4}deg` }}>
                  <span className="stamp-flags" aria-hidden="true">
                    {s.countries.slice(0, 3).map(flag).join(" ") || "✈"}
                  </span>
                  <b>{s.trip.destination || s.trip.title}</b>
                  <small>{[monthYear(s.start), s.end && s.end.slice(0, 7) !== (s.start || "").slice(0, 7) ? monthYear(s.end) : ""].filter(Boolean).join(" – ") || tr("Sem data")}</small>
                  <em>{s.trip.title}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">{tr("Cada viagem concluída vira um carimbo aqui.")}</p>
        )}
      </section>
    </>
  );
}
