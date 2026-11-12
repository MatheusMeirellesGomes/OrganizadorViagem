import { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { t as tr, tf, formatNumber } from "../i18n";
import type { Trip } from "../model";
import { distanceKm, type Place, type Point } from "../places";
import { wikiLanguage } from "../catalog-service";
import { safeExternalUrl } from "../travel-mode";
import { dateOfDay } from "../planner";
import { addMeal, mealNames, mealSearch, openAt, replaceMeal, type MealKind } from "../meals";
import { searchFood, type ExploreResult } from "./service";
import { applyFilters, emptyFilters } from "./filters";
import { cuisineOptions, priceLevel } from "./restaurants";
import { PlacePhoto } from "./PlaceCard";

export type MealRequest = {
  day: number;
  meal: MealKind;
  time: string;
  near: Point;
  nearName: string;
  radius?: number;
  /** Replace the restaurant of this activity instead of adding a new one. */
  replaceId?: string;
};

/** Restaurants for one meal of the itinerary, near the visit before it (Fase 3). */
export function MealFinder({
  trip,
  request,
  onSave,
  onClose,
  busy,
}: {
  trip: Trip;
  request: MealRequest;
  onSave: (t: Trip) => Promise<boolean>;
  onClose: () => void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<ExploreResult>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [radius, setRadius] = useState(request.radius ?? 1000),
    [prices, setPrices] = useState<number[]>([]),
    [cuisines, setCuisines] = useState<string[]>([]),
    [openOnly, setOpenOnly] = useState(false),
    [vegetarian, setVegetarian] = useState(false),
    [accessible, setAccessible] = useState(false),
    [cost, setCost] = useState<Record<string, string>>({}),
    [currency, setCurrency] = useState(trip.budget?.currency ?? trip.expenses[0]?.currency ?? "EUR"),
    [message, setMessage] = useState("");
  const date = dateOfDay(trip, request.day);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  useEffect(() => {
    const stop = new AbortController();
    setLoading(true);
    setError("");
    searchFood(request.near, Math.max(radius, 1000), [mealSearch[request.meal]], { lang: wikiLanguage(), signal: stop.signal, storage: localStorage })
      .then((r) => !stop.signal.aborted && setResult(r))
      .catch((e) => !stop.signal.aborted && setError(e instanceof Error ? e.message : "Consulta indisponível."))
      .finally(() => !stop.signal.aborted && setLoading(false));
    return () => stop.abort();
  }, [request.near.lat, request.near.lng, request.meal, radius >= 2000]);

  const filters = {
    ...emptyFilters("food"),
    meals: [mealSearch[request.meal]],
    cuisines,
    vegetarian,
    accessible,
    maxKm: radius / 1000,
    sort: "distance" as const,
  };
  const base = result ? applyFilters(result.places, filters, "food", request.near) : [];
  const visible = base.filter((p) => !openOnly || openAt(p, date, request.time) === true);
  const withPrice = prices.length ? visible.filter((p) => prices.includes(priceLevel(p) ?? 0)) : visible;
  const noPrice = prices.length ? visible.filter((p) => !priceLevel(p)) : [];
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function choose(p: Place) {
    try {
      const amount = Number((cost[p.id] ?? "").replace(",", "."));
      const next = request.replaceId
        ? replaceMeal(trip, request.replaceId, p)
        : addMeal(trip, p, { day: request.day, time: request.time, meal: request.meal, cost: amount > 0 ? { amount, currency } : undefined });
      if (await onSave(next)) {
        setMessage(tf("{name} adicionado ao roteiro.", { name: p.name }));
        dialog.current?.close();
      }
    } catch (e) {
      setMessage(e instanceof Error ? tr(e.message) : tr("Não foi possível adicionar."));
    }
  }

  const card = (p: Place) => {
    const open = openAt(p, date, request.time);
    const level = priceLevel(p);
    const menu = safeExternalUrl(p.tags["website:menu"] || p.tags["contact:menu"] || "");
    const site = safeExternalUrl(p.website || "");
    return (
      <li key={p.id} className="meal-card">
        <PlacePhoto place={p} />
        <div>
          <h3>{p.name}</h3>
          <p className="muted">
            {tf("{km} km de {place}", { km: formatNumber(distanceKm(request.near, p.coordinates), 1), place: request.nearName })}
            {p.tags.cuisine && " · " + p.tags.cuisine.replace(/[_;]/g, " ")}
          </p>
          <p className="muted">
            {level ? "€".repeat(level) : tr("Faixa de preço não informada")} ·{" "}
            {open === undefined ? tr("Horário não informado") : open ? tf("Aberto às {time}", { time: request.time }) : tf("Fechado às {time}", { time: request.time })}
          </p>
          <p className="muted">{[p.address, p.city].filter(Boolean).join(", ")}</p>
          <div className="meal-links">
            {menu && <a href={menu} target="_blank" rel="noreferrer">{tr("Cardápio")} <ExternalLink size={12} /></a>}
            {site && <a href={site} target="_blank" rel="noreferrer">{tr("Site")} <ExternalLink size={12} /></a>}
          </div>
          {!request.replaceId && (
            <label className="meal-cost">
              {tr("Gasto previsto (opcional)")}
              <span>
                <input inputMode="decimal" value={cost[p.id] ?? ""} onChange={(e) => setCost((c) => ({ ...c, [p.id]: e.target.value }))} placeholder="0,00" aria-label={tf("Gasto previsto em {name}", { name: p.name })} />
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={tr("Moeda")}>
                  {["EUR", "BRL", "USD", "GBP"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </span>
            </label>
          )}
          <button className="primary" disabled={busy} onClick={() => choose(p)}>
            {request.replaceId ? tr("Usar este restaurante") : tf("Adicionar às {time}", { time: request.time })}
          </button>
        </div>
      </li>
    );
  };

  return (
    <dialog ref={dialog} className="place-panel meal-finder" aria-labelledby="meal-title" onClose={onClose}>
      <div className="place-panel-inner">
        <button className="icon-button place-panel-close" onClick={() => dialog.current?.close()} aria-label={tr("Fechar")}>
          <X size={20} />
        </button>
        <h2 id="meal-title" style={{ paddingTop: 18 }}>
          {request.replaceId ? tr("Substituir restaurante") : tf("{meal} perto de {place}", { meal: tr(mealNames[request.meal]), place: request.nearName })}
        </h2>
        <p className="muted">{tf("Dia {number} · {time} · até {km} km", { number: request.day, time: request.time, km: formatNumber(radius / 1000, 1) })}</p>
        <div className="chip-row">
          {[500, 1000, 2000].map((r) => (
            <button key={r} className={"chip" + (radius === r ? " is-on" : "")} aria-pressed={radius === r} onClick={() => setRadius(r)}>
              {formatNumber(r / 1000, 1)} km
            </button>
          ))}
        </div>
        <div className="chip-row wrap">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className={"chip" + (prices.includes(n) ? " is-on" : "")} aria-pressed={prices.includes(n)} onClick={() => setPrices((x) => toggle(x, n))}>
              {"€".repeat(n)}
            </button>
          ))}
          {cuisineOptions.map((c) => (
            <button key={c.id} className={"chip" + (cuisines.includes(c.id) ? " is-on" : "")} aria-pressed={cuisines.includes(c.id)} onClick={() => setCuisines((x) => toggle(x, c.id))}>
              {tr(c.label)}
            </button>
          ))}
        </div>
        <div className="check-grid">
          <label className="check-row"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> {tf("Só aberto às {time} (horário cadastrado)", { time: request.time })}</label>
          <label className="check-row"><input type="checkbox" checked={vegetarian} onChange={(e) => setVegetarian(e.target.checked)} /> {tr("Opções vegetarianas")}</label>
          <label className="check-row"><input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> {tr("Acessível para cadeira de rodas")}</label>
        </div>
        <p role="status" className="muted">{loading ? tr("Buscando restaurantes…") : message}</p>
        {error && <p role="alert">{tr(error)}</p>}
        {!loading && !error && !withPrice.length && !noPrice.length && <p>{tr("Nenhum restaurante com esses filtros. Aumente a distância ou tire filtros.")}</p>}
        {prices.length > 0 && <h3>{tr("Com faixa de preço informada")}</h3>}
        <ul className="meal-list">{withPrice.slice(0, 20).map(card)}</ul>
        {noPrice.length > 0 && (
          <details>
            <summary>{tf("{count} sem faixa de preço informada", { count: noPrice.length })}</summary>
            <ul className="meal-list">{noPrice.slice(0, 20).map(card)}</ul>
          </details>
        )}
        <p className="muted">© OpenStreetMap contributors · ODbL. {tr("Nenhum preço, avaliação ou horário é inventado.")}</p>
      </div>
    </dialog>
  );
}
