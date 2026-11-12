import { useEffect, useMemo, useRef, useState } from "react";
import { Search, LocateFixed, LayoutGrid, Map as MapIcon, Columns2, SlidersHorizontal, History, Loader2 } from "lucide-react";
import { t as tr, tf, getLocale } from "../i18n";
import { decor, hideOnError } from "../decor";
import type { Trip } from "../model";
import type { Place, Point } from "../places";
import { choosePlace } from "../choices";
import { wikiLanguage } from "../catalog-service";
import { attractionGroups } from "./categories";
import { cuisineOptions, mealLabels, type Meal } from "./restaurants";
import {
  activeCount, applyFilters, emptyFilters, forgetHistory, recentSearches, rememberSearch,
  saveFilters, savedFilters, type ExploreKind, type Filters, type SortKey,
} from "./filters";
import { debounced, geocodeAddress, suggest, type Suggestion } from "./search";
import { complementWithOsm, loadMoreAttractions, searchAttractions, searchFood, type ExploreResult } from "./service";
import { ExploreMap } from "./ExploreMap";
import { PlaceCard, SkeletonCard } from "./PlaceCard";
import { PlacePanel, AddToTrip } from "./PlacePanel";
import "./explore.css";

const RADII = [1, 2, 5, 10, 15, 20];
type View = "cards" | "map" | "both";
type CenterKind = "destination" | "hotel" | "place" | "map" | "here";

export function Explore({ trips, onSave, saving }: { trips: Trip[]; onSave: (t: Trip) => Promise<boolean>; saving: boolean }) {
  const lang = wikiLanguage();
  const [kind, setKind] = useState<ExploreKind>("attractions"),
    [text, setText] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [suggesting, setSuggesting] = useState(false),
    [active, setActive] = useState(-1),
    [center, setCenter] = useState<Point>(),
    [centerLabel, setCenterLabel] = useState(""),
    [centerKind, setCenterKind] = useState<CenterKind>("destination"),
    [radiusKm, setRadiusKm] = useState(5),
    [meals, setMeals] = useState<Meal[]>([]),
    [result, setResult] = useState<ExploreResult>(),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [filters, setFilters] = useState<Filters>(emptyFilters("attractions")),
    [showFilters, setShowFilters] = useState(false),
    [view, setView] = useState<View>("both"),
    [selected, setSelected] = useState<string>(),
    [opened, setOpened] = useState<string>(),
    [adding, setAdding] = useState<string>(),
    [limit, setLimit] = useState(24),
    [targetTrip, setTargetTrip] = useState(trips[0]?.id ?? ""),
    [filterName, setFilterName] = useState(""),
    [, refresh] = useState(0);
  const searchRef = useRef<AbortController | null>(null);
  const runSuggest = useMemo(
    () => debounced((t, signal) => suggest(t, lang, { signal })),
    [lang],
  );

  // Suggestions while typing (Wikidata only; never the address service).
  useEffect(() => {
    if (text.trim().length < 2 || text === centerLabel) {
      setSuggestions([]);
      return;
    }
    setSuggesting(true);
    runSuggest(text).then((s) => {
      if (s) {
        setSuggestions(s);
        setActive(-1);
        setSuggesting(false);
      }
    });
  }, [text]);

  // Search whenever the center, radius, kind or meals change.
  useEffect(() => {
    if (!center) return;
    void search(center);
    return () => searchRef.current?.abort();
  }, [center?.lat, center?.lng, radiusKm, kind, meals.join()]);

  async function search(point: Point, previous?: ExploreResult) {
    searchRef.current?.abort();
    const stop = new AbortController();
    searchRef.current = stop;
    setLoading(true);
    setError("");
    setProgress("");
    if (!previous) {
      setResult(undefined);
      setLimit(24);
    }
    const options = {
      lang,
      signal: stop.signal,
      storage: localStorage,
      onProgress: (done: number, total: number) => setProgress(tf("Consultando o OpenStreetMap… {done} de {total}", { done, total })),
      onStage: (stage: string) => setProgress(tr(stage)),
    };
    try {
      const r =
        kind === "food"
          ? await searchFood(point, radiusKm * 1000, meals, { ...options, previous })
          : previous
            ? await loadMoreAttractions(previous, options)
            : await searchAttractions(point, radiusKm * 1000, options);
      if (!stop.signal.aborted) setResult(r);
    } catch (e) {
      if (!stop.signal.aborted) setError(e instanceof Error ? e.message : "Consulta indisponível.");
    } finally {
      if (!stop.signal.aborted) {
        setLoading(false);
        setProgress("");
      }
    }
  }

  function choose(s: Suggestion) {
    setText(s.name);
    setSuggestions([]);
    setCenter(s.point);
    setCenterLabel(s.name);
    setCenterKind(s.destination ? "destination" : "place");
    if (!s.destination) setRadiusKm((r) => Math.min(r, 2));
    rememberSearch(s.name, s.point);
  }

  async function submitSearch() {
    if (active >= 0 && suggestions[active]) return choose(suggestions[active]);
    if (suggestions[0]) return choose(suggestions[0]);
    // Nothing on Wikidata: try the text as an address on OpenStreetMap.
    setSuggesting(true);
    try {
      const found = await geocodeAddress(text, lang);
      if (found.length === 1) choose(found[0]);
      else if (found.length) setSuggestions(found);
      else setMessage(tr("Nada encontrado. Tente o nome da cidade, um endereço ou escolha um ponto no mapa."));
    } catch {
      setMessage(tr("A busca de endereços não respondeu. Tente de novo em instantes."));
    } finally {
      setSuggesting(false);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setMessage(tr("Este navegador não informa a localização."));
    setMessage(tr("Aguardando a permissão de localização…"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMessage("");
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCenterLabel(tr("Minha localização"));
        setCenterKind("here");
      },
      () => setMessage(tr("Localização não autorizada. Você pode buscar uma cidade ou tocar no mapa.")),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  const hotels = trips.flatMap((t) => (t.stays ?? []).filter((s) => s.coordinates).map((s) => ({ trip: t, stay: s })));
  const all = result?.places ?? [];
  const visible = useMemo(
    () => applyFilters(all, { ...filters, maxKm: Math.min(filters.maxKm, radiusKm) }, kind, center),
    [all, filters, kind, center, radiusKm],
  );
  const openedPlace = all.find((p) => p.id === opened);
  const addingPlace = all.find((p) => p.id === adding);
  const savedIds = new Set(trips.find((t) => t.id === targetTrip)?.placeChoices?.map((c) => c.place.id) ?? []);
  const nActive = activeCount(filters, kind);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setLimit(24);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const groupCounts = Object.fromEntries(attractionGroups.map((g) => [g.id, all.filter((p) => g.categories.includes(p.category)).length]));

  function select(id: string, scroll = false) {
    setSelected(id);
    if (scroll) document.getElementById("place-" + id.replace(/[^\w-]/g, "_"))?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="explore">
      <section className="panel explore-hero">
        <div className="section-head">
          <div>
            <p className="eyebrow">{tr("DESCUBRA O SEU PRÓXIMO CAMINHO")}</p>
            <h2>{tr("Explore lugares do mundo inteiro")}</h2>
            <p>{tr("Busque uma cidade, bairro, endereço, atração ou restaurante.")}</p>
          </div>
          <img className="head-photo" src={decor.roadWide} alt="" loading="lazy" onError={hideOnError} />
        </div>

        <form
          className="explore-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void submitSearch();
          }}
        >
          <div className="explore-combobox">
            <label htmlFor="explore-q" className="sr-only">
              {tr("Buscar destino ou lugar")}
            </label>
            <Search size={18} aria-hidden="true" />
            <input
              id="explore-q"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="explore-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? "sug-" + active : undefined}
              autoComplete="off"
              value={text}
              placeholder={tr("Ex.: Madrid, Palácio Real, Rua Augusta 100, 40.41, -3.70")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(suggestions.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(-1, i - 1));
                } else if (e.key === "Escape") setSuggestions([]);
              }}
            />
            {suggesting && <Loader2 className="spin" size={18} aria-label={tr("Buscando…")} />}
            {suggestions.length > 0 && (
              <ul id="explore-suggestions" role="listbox" className="explore-suggestions">
                {suggestions.map((s, i) => (
                  <li
                    key={(s.qid ?? s.name) + i}
                    id={"sug-" + i}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(s);
                    }}
                  >
                    <strong>{s.name}</strong>
                    <span>{tr(s.context)}</span>
                  </li>
                ))}
                <li role="option" aria-selected={false} className="explore-suggestion-address" onMouseDown={(e) => { e.preventDefault(); setSuggestions([]); void geocodeAddress(text, lang).then((f) => (f.length ? setSuggestions(f) : setMessage(tr("Nenhum endereço encontrado.")))); }}>
                  {tr("Procurar como endereço no OpenStreetMap")}
                </li>
              </ul>
            )}
          </div>
          <button className="primary">{tr("Buscar")}</button>
          <button type="button" className="secondary" onClick={useMyLocation}>
            <LocateFixed size={17} /> {tr("Minha localização")}
          </button>
        </form>
        {recentSearches().length > 0 && !center && (
          <div className="chip-row" aria-label={tr("Buscas recentes")}>
            <History size={16} aria-hidden="true" />
            {recentSearches().map((r) => (
              <button key={r.name} className="chip" onClick={() => choose({ name: r.name, point: r.point, context: "", destination: true, source: "wikidata" })}>
                {r.name}
              </button>
            ))}
            <button className="text-button" onClick={() => { forgetHistory(); refresh((n) => n + 1); }}>
              {tr("Apagar histórico")}
            </button>
          </div>
        )}
        <p role="status" className="muted">{message}</p>

        <div className="explore-controls">
          <div className="segmented" role="group" aria-label={tr("O que procurar")}>
            {(["attractions", "food"] as ExploreKind[]).map((k) => (
              <button
                key={k}
                aria-pressed={k === kind}
                className={k === kind ? "is-on" : ""}
                onClick={() => {
                  setKind(k);
                  setFilters(emptyFilters(k));
                }}
              >
                {k === "food" ? tr("Restaurantes e cafés") : tr("Atrações e passeios")}
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label={tr("Raio da busca")}>
            <span className="chip-label">{tr("Raio")}</span>
            {RADII.map((r) => (
              <button key={r} className={"chip" + (r === radiusKm ? " is-on" : "")} aria-pressed={r === radiusKm} onClick={() => setRadiusKm(r)}>
                {r} km
              </button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label={tr("Centro da busca")}>
            <span className="chip-label">{tr("A partir de")}</span>
            <span className="chip is-on center-chip">
              {center ? `${tr({ destination: "Cidade pesquisada", hotel: "Hotel", place: "Atração selecionada", map: "Ponto no mapa", here: "Minha localização" }[centerKind])}: ${centerLabel}` : tr("Escolha um destino")}
            </span>
            {hotels.length > 0 && (
              <select
                aria-label={tr("Usar um hotel cadastrado como centro")}
                value=""
                onChange={(e) => {
                  const h = hotels[Number(e.target.value)];
                  if (!h) return;
                  setCenter(h.stay.coordinates);
                  setCenterLabel(h.stay.name);
                  setCenterKind("hotel");
                }}
              >
                <option value="">{tr("Usar hotel cadastrado…")}</option>
                {hotels.map((h, i) => (
                  <option key={h.stay.id} value={i}>
                    {h.stay.name} · {h.trip.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          {kind === "food" && (
            <div className="chip-row" role="group" aria-label={tr("Refeições e tipos")}>
              {(Object.keys(mealLabels) as Meal[]).map((m) => (
                <button key={m} className={"chip" + (meals.includes(m) ? " is-on" : "")} aria-pressed={meals.includes(m)} onClick={() => { setMeals((x) => toggle(x, m)); set("meals", toggle(filters.meals, m)); }}>
                  {tr(mealLabels[m])}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {!center && (
        <section className="explore-empty panel">
          <img src={decor.map} alt="" loading="lazy" onError={hideOnError} />
          <div>
            <h3>{tr("Comece por um destino")}</h3>
            <p>{tr("Pesquise uma cidade, use sua localização ou toque no mapa. A busca considera o raio escolhido de verdade, de 1 a 20 km.")}</p>
          </div>
        </section>
      )}

      {(center || view !== "cards") && (
        <section className="explore-results">
          <div className="explore-toolbar">
            <div>
              <h2 aria-live="polite">
                {loading && !result ? tr("Buscando lugares…") : tf("{count} lugares encontrados", { count: visible.length })}
              </h2>
              {result && (
                <p className="muted">
                  {kind === "food" ? tr("Fonte: OpenStreetMap") : tr("Fonte: Wikidata e Wikipédia")}
                  {result.complemented ? " + OpenStreetMap" : ""} ·{" "}
                  {tf("{state} em {date}", {
                    state: result.cached ? tr("Consulta salva") : tr("Consulta recebida"),
                    date: new Date(result.retrievedAt).toLocaleString(getLocale()),
                  })}
                </p>
              )}
              {progress && <p className="muted" role="status">{progress}</p>}
            </div>
            <div className="explore-toolbar-actions">
              <div className="segmented" role="group" aria-label={tr("Visualização")}>
                {([["cards", LayoutGrid, "Cards"], ["map", MapIcon, "Mapa"], ["both", Columns2, "Cards + mapa"]] as const).map(([v, Icon, label]) => (
                  <button key={v} aria-pressed={view === v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>
                    <Icon size={16} aria-hidden="true" /> <span>{tr(label)}</span>
                  </button>
                ))}
              </div>
              <label className="sort-select">
                <span className="sr-only">{tr("Ordenar")}</span>
                <select value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
                  {kind === "attractions" && <option value="relevance">{tr("Relevância")}</option>}
                  <option value="distance">{tr("Mais próximos")}</option>
                  <option value="name">{tr("Nome A–Z")}</option>
                  <option value="price">{tr("Menor preço (quando informado)")}</option>
                </select>
              </label>
              <button className="secondary" aria-expanded={showFilters} onClick={() => setShowFilters((x) => !x)}>
                <SlidersHorizontal size={16} /> {tr("Filtros")} {nActive > 0 && <span className="count-badge">{nActive}</span>}
              </button>
              {nActive > 0 && (
                <button className="text-button" onClick={() => setFilters(emptyFilters(kind))}>
                  {tr("Limpar filtros")}
                </button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="explore-filters panel">
              <label>
                {tr("Filtrar por nome")}
                <input value={filters.text} onChange={(e) => set("text", e.target.value)} />
              </label>
              {kind === "attractions" ? (
                <>
                  <fieldset>
                    <legend>{tr("Categorias")}</legend>
                    <div className="chip-row">
                      {attractionGroups.filter((g) => groupCounts[g.id]).map((g) => (
                        <button key={g.id} className={"chip" + (filters.groups.includes(g.id) ? " is-on" : "")} aria-pressed={filters.groups.includes(g.id)} onClick={() => set("groups", toggle(filters.groups, g.id))}>
                          {tr(g.label)} <span className="muted">{groupCounts[g.id]}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="form-grid">
                    <label>
                      {tr("Entrada")}
                      <select value={filters.fee} onChange={(e) => set("fee", e.target.value as Filters["fee"])}>
                        <option value="all">{tr("Todas")}</option>
                        <option value="free">{tr("Gratuitas")}</option>
                        <option value="paid">{tr("Pagas")}</option>
                      </select>
                    </label>
                    <label>
                      {tr("Ambiente")}
                      <select value={filters.setting} onChange={(e) => set("setting", e.target.value as Filters["setting"])}>
                        <option value="all">{tr("Todos")}</option>
                        <option value="indoor">{tr("Interno (museus, igrejas, palácios…)")}</option>
                        <option value="outdoor">{tr("Ao ar livre (parques, praças, mirantes…)")}</option>
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <fieldset>
                    <legend>{tr("Culinária")}</legend>
                    <div className="chip-row">
                      {[...cuisineOptions, { id: "other", label: "Outras" }].map((c) => (
                        <button key={c.id} className={"chip" + (filters.cuisines.includes(c.id) ? " is-on" : "")} aria-pressed={filters.cuisines.includes(c.id)} onClick={() => set("cuisines", toggle(filters.cuisines, c.id))}>
                          {tr(c.label)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>{tr("Faixa de preço")}</legend>
                    <div className="chip-row">
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} className={"chip" + (filters.prices.includes(n) ? " is-on" : "")} aria-pressed={filters.prices.includes(n)} onClick={() => set("prices", toggle(filters.prices, n))}>
                          {"€".repeat(n)} {tr(["Econômico", "Intermediário", "Alto", "Luxo"][n - 1])}
                        </button>
                      ))}
                    </div>
                    <p className="muted">
                      {tf("{count} de {total} lugares têm faixa de preço cadastrada.", {
                        count: all.filter((p) => p.tags.price_range || p.tags["price:range"]).length,
                        total: all.length,
                      })}
                    </p>
                  </fieldset>
                  <div className="check-grid">
                    <label className="check-row"><input type="checkbox" checked={filters.openNow} onChange={(e) => set("openNow", e.target.checked)} /> {tr("Aberto agora (horário cadastrado)")}</label>
                    <label className="check-row"><input type="checkbox" checked={filters.vegetarian} onChange={(e) => set("vegetarian", e.target.checked)} /> {tr("Opções vegetarianas")}</label>
                    <label className="check-row"><input type="checkbox" checked={filters.reservation} onChange={(e) => set("reservation", e.target.checked)} /> {tr("Aceita reserva")}</label>
                  </div>
                </>
              )}
              <label>
                {tf("Distância máxima: {km} km", { km: Math.min(filters.maxKm, radiusKm) })}
                <input type="range" min="0.5" max={radiusKm} step="0.5" value={Math.min(filters.maxKm, radiusKm)} onChange={(e) => set("maxKm", Number(e.target.value))} />
              </label>
              <div className="check-grid">
                <label className="check-row"><input type="checkbox" checked={filters.family} onChange={(e) => set("family", e.target.checked)} /> {kind === "food" ? tr("Adequado para famílias (área infantil ou cadeirão)") : tr("Para crianças (zoológicos, aquários e parques temáticos)")}</label>
                <label className="check-row"><input type="checkbox" checked={filters.accessible} onChange={(e) => set("accessible", e.target.checked)} /> {tr("Acessível para cadeira de rodas")}</label>
                <label className="check-row"><input type="checkbox" checked={filters.withPhoto} onChange={(e) => set("withPhoto", e.target.checked)} /> {tr("Só com foto verificada")}</label>
                <label className="check-row"><input type="checkbox" checked={filters.includeUnknown} onChange={(e) => set("includeUnknown", e.target.checked)} /> {tr("Incluir lugares sem a informação filtrada")}</label>
              </div>
              <div className="saved-filters">
                <label>
                  {tr("Salvar estes filtros como")}
                  <input value={filterName} maxLength={40} onChange={(e) => setFilterName(e.target.value)} placeholder={tr("Ex.: Jantar barato")} />
                </label>
                <button className="secondary" disabled={!filterName.trim()} onClick={() => { saveFilters(filterName.trim(), kind, filters); setFilterName(""); refresh((n) => n + 1); }}>
                  {tr("Salvar filtros")}
                </button>
                {savedFilters().filter((s) => s.kind === kind).map((s) => (
                  <button key={s.name} className="chip" onClick={() => setFilters({ ...emptyFilters(kind), ...s.filters })}>
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="muted">{tr("Filtros e buscas recentes ficam salvos só neste aparelho. Avaliações e tempo de visita não aparecem porque as fontes livres não têm esses dados.")}</p>
            </div>
          )}

          {kind === "food" && (
            <label className="target-trip">
              {tr("Viagem para salvar")}
              <select value={targetTrip} onChange={(e) => setTargetTrip(e.target.value)}>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          )}

          <div className={"explore-layout view-" + view}>
            {view !== "map" && (
              <div className="explore-list">
                {error && (
                  <div className="panel explore-error" role="alert">
                    <p>{tr(error)}</p>
                    <button className="secondary" onClick={() => center && search(center)}>{tr("Tentar novamente")}</button>
                  </div>
                )}
                <div className="explore-grid">
                  {loading && !result && Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
                  {visible.slice(0, limit).map((p) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      center={center}
                      selected={p.id === selected}
                      saved={savedIds.has(p.id)}
                      busy={saving}
                      onSelect={() => setSelected(p.id)}
                      onOpen={() => setOpened(p.id)}
                      onAdd={() => setAdding(p.id)}
                      onSave={async () => {
                        const t = trips.find((x) => x.id === targetTrip) ?? trips[0];
                        if (!t) return setMessage(tr("Crie uma viagem em Minhas viagens para salvar lugares."));
                        if (await onSave(choosePlace(t, p, "want"))) setMessage(tf("{name} salvo em Quero ir de {trip}.", { name: p.name, trip: t.title }));
                      }}
                    />
                  ))}
                </div>
                {result && !loading && !visible.length && !error && (
                  <div className="panel explore-none">
                    <img src={decor.calm} alt="" loading="lazy" onError={hideOnError} />
                    <p>{all.length ? tr("Nenhum lugar corresponde aos filtros. Limpe os filtros ou aumente o raio.") : tr("As fontes não têm lugares cadastrados nesta área. Aumente o raio ou escolha outro ponto.")}</p>
                    {nActive > 0 && <button className="secondary" onClick={() => setFilters(emptyFilters(kind))}>{tr("Limpar filtros")}</button>}
                  </div>
                )}
                {visible.length > limit && (
                  <button className="secondary explore-more" onClick={() => setLimit((n) => n + 24)}>
                    {tf("Mostrar mais ({count} restantes)", { count: visible.length - limit })}
                  </button>
                )}
                {result?.hasMore && visible.length <= limit && (
                  <button className="secondary explore-more" disabled={loading} onClick={() => center && search(center, result)}>
                    {loading ? tr("Carregando…") : tr("Carregar mais lugares da fonte")}
                  </button>
                )}
                {result && kind === "attractions" && !result.complemented && (
                  <button
                    className="text-button explore-more"
                    disabled={loading}
                    onClick={async () => {
                      if (!center || !result) return;
                      setLoading(true);
                      try {
                        setResult(await complementWithOsm(result, center, radiusKm * 1000, { lang, storage: localStorage, onProgress: (d, t) => setProgress(tf("Consultando o OpenStreetMap… {done} de {total}", { done: d, total: t })) }));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Consulta indisponível.");
                      } finally {
                        setLoading(false);
                        setProgress("");
                      }
                    }}
                  >
                    {tr("Completar com lugares do OpenStreetMap")}
                  </button>
                )}
              </div>
            )}
            {view !== "cards" && (
              <ExploreMap
                center={center}
                radius={radiusKm * 1000}
                places={visible}
                selectedId={selected}
                onSelect={(id) => select(id, true)}
                onDetails={(id) => setOpened(id)}
                onPick={(p) => {
                  setCenter(p);
                  setCenterLabel(`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`);
                  setCenterKind("map");
                }}
                onSearchHere={(p) => {
                  setCenter(p);
                  setCenterLabel(`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`);
                  setCenterKind("map");
                }}
              />
            )}
          </div>
          <p className="muted explore-credits">
            {kind === "attractions" && (
              <>
                <a href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">{tr("Wikidata · CC0")}</a>
                {" · "}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">{tr("Wikipédia · CC BY-SA")}</a>
                {" · "}
                {tr("Fotos: Wikimedia Commons, com autor e licença em cada foto.")}{" "}
              </>
            )}
            {(kind === "food" || result?.complemented) && (
              <>
                © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{tr("OpenStreetMap contributors · ODbL")}</a>{" "}
              </>
            )}
            {tr("Nenhum preço, avaliação ou horário é inventado.")}
          </p>
        </section>
      )}

      {openedPlace && (
        <PlacePanel
          place={openedPlace}
          all={all}
          center={center}
          trips={trips}
          onSave={onSave}
          busy={saving}
          targetTrip={targetTrip}
          onClose={() => setOpened(undefined)}
          onOpen={(id) => setOpened(id)}
          onShowOnMap={() => {
            setSelected(openedPlace.id);
            setOpened(undefined);
            if (view === "cards") setView("both");
          }}
          onSearchNear={(p, name) => {
            setOpened(undefined);
            setCenter(p);
            setCenterLabel(name);
            setCenterKind("place");
          }}
        />
      )}
      {addingPlace && (
        <dialog
          className="place-panel add-dialog"
          open
          aria-labelledby="add-title"
          onKeyDown={(e) => e.key === "Escape" && setAdding(undefined)}
        >
          <div className="place-panel-inner">
            <h2 id="add-title">{tf("Adicionar {name}", { name: addingPlace.name })}</h2>
            <AddToTrip place={addingPlace} trips={trips} onSave={onSave} busy={saving} initialTrip={targetTrip} onDone={(m) => { setMessage(m); setAdding(undefined); }} />
            <button className="text-button" onClick={() => setAdding(undefined)}>{tr("Cancelar")}</button>
          </div>
        </dialog>
      )}
    </div>
  );
}
