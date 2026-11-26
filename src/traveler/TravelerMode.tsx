import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Accessibility,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bike,
  BookmarkPlus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  ExternalLink,
  Footprints,
  Globe,
  Hotel,
  ImageOff,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Route as RouteIcon,
  Search,
  Sparkles,
  Train,
  X,
} from "lucide-react";
import { t as tr, tf, formatNumber, getLocale, useLanguage } from "../i18n";
import { categories, distanceKm, validPoint, type Place, type Point } from "../places";
import type { Trip } from "../model";
import { searchAttractions, searchFood } from "../explore/service";
import { verifiedPhoto } from "../explore/photos";
import { suggest as suggestPlaces, geocodeAddress, type Suggestion as SearchHit } from "../explore/search";
import { addToItinerary } from "../explore/trip";
import { wikiLanguage } from "../catalog-service";
import { accessibilityOf, addressOf, filterNearby, openNow, searchServices, serviceKinds, serviceLabel, transportKinds, walkMinutes, withDistance, type NearbyFilters, type ServiceKind } from "./nearby";
import { planWalk, presets, removeStop, reorder, suggestNow, type Preset, type WalkPlan } from "./suggest";
import { externalRoutes, travelRoute, type Mode, type TravelRoute } from "./routes";
import { addWish, collections, defaultCollection, loadWishes, markVisited, removeWish, saveWishes, toSaved, visitedIds, type WishItem } from "./wishlist";
import "./traveler.css";

/*
 * Modo Viajante: mapa com a posição ao vivo (só com o app aberto e com a sua
 * permissão), lugares perto, o que fazer agora, roteiro a pé e Quero Conhecer.
 * A posição nunca é salva nem enviada a ninguém; o GPS para ao sair daqui.
 */

type Fix = { lat: number; lng: number; accuracy?: number; heading?: number | null; manual?: boolean };
type Group = "tourism" | "nature" | "food" | "transport" | "services";
type Tab = "near" | "now" | "walk" | "wish";
const NATURE = new Set(["park", "garden", "nature", "beach", "viewpoint", "mountain", "trail", "waterfall", "zoo", "aquarium", "theme_park", "nature_reserve", "peak", "cave_entrance"]);
const groupColor: Record<Group, string> = { tourism: "#2f6b55", nature: "#3f8a4f", food: "#c7862f", transport: "#3e6fb0", services: "#8a5a86" };
const RADII = [500, 1000, 2000, 5000];

export function TravelerMode({ trips, activeTrip, onSaveTrip, onClose }: { trips: Trip[]; activeTrip?: Trip; onSaveTrip: (t: Trip) => Promise<boolean>; onClose: () => void }) {
  useLanguage();
  const lang = wikiLanguage(getLocale());
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const line = useRef<L.LayerGroup | null>(null);
  const follow = useRef(true);
  const [fix, setFix] = useState<Fix>();
  const [gps, setGps] = useState<"asking" | "on" | "denied" | "unavailable" | "off">("asking");
  const [choosing, setChoosing] = useState(false);
  const [following, setFollowing] = useState(true);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half");
  const [tab, setTab] = useState<Tab>("near");
  const [group, setGroup] = useState<Group>("tourism");
  const [kinds, setKinds] = useState<ServiceKind[]>([transportKinds[0], transportKinds[1], transportKinds[3]]);
  const [radius, setRadius] = useState(1000);
  const [filters, setFilters] = useState<NearbyFilters>({});
  const [places, setPlaces] = useState<Record<Group, Place[]>>({ tourism: [], nature: [], food: [], transport: [], services: [] });
  const [loadedAt, setLoadedAt] = useState<Partial<Record<Group, string>>>({});
  const [loading, setLoading] = useState<string>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<Place>();
  const [route, setRoute] = useState<TravelRoute>();
  const [routing, setRouting] = useState<Mode>();
  const [routeError, setRouteError] = useState<string>();
  const [wishes, setWishes] = useState<WishItem[]>(() => loadWishes());
  const [preset, setPreset] = useState<Preset>();
  const [walkTime, setWalkTime] = useState(180);
  const [endWithFood, setEndWithFood] = useState(true);
  const [plan, setPlan] = useState<WalkPlan>();
  const [notice, setNotice] = useState<string>();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const searchAbort = useRef<AbortController | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const visited = useMemo(() => visitedIds(wishes), [wishes]);
  const origin: Point | undefined = fix ? { lat: fix.lat, lng: fix.lng } : undefined;

  // Mapa
  useEffect(() => {
    if (!mapEl.current) return;
    const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(activeTrip?.coordinates ? [activeTrip.coordinates.lat, activeTrip.coordinates.lng] : [-15.8, -47.9], activeTrip?.coordinates ? 13 : 4);
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
    me.current = L.layerGroup().addTo(m);
    line.current = L.layerGroup().addTo(m);
    pins.current = L.layerGroup().addTo(m);
    m.on("dragstart", () => {
      follow.current = false;
      setFollowing(false);
    });
    map.current = m;
    const o = new ResizeObserver(() => m.invalidateSize());
    o.observe(mapEl.current);
    return () => {
      o.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // GPS: só enquanto esta tela estiver aberta.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGps("unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGps("on");
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading });
      },
      (e) => setGps(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Escolher a posição tocando no mapa (sem GPS ou por escolha).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pick = (e: L.LeafletMouseEvent) => {
      if (!choosing && gps === "on") return;
      setFix({ lat: e.latlng.lat, lng: e.latlng.lng, manual: true });
      setChoosing(false);
    };
    m.on("click", pick);
    return () => {
      m.off("click", pick);
    };
  }, [choosing, gps]);

  // Marcador azul, precisão e direção.
  useEffect(() => {
    const m = map.current,
      layer = me.current;
    if (!m || !layer || !fix) return;
    layer.clearLayers();
    if (fix.accuracy && fix.accuracy < 2000) L.circle([fix.lat, fix.lng], { radius: fix.accuracy, color: "#2f80ed", weight: 1, fillColor: "#2f80ed", fillOpacity: 0.12, interactive: false }).addTo(layer);
    if (typeof fix.heading === "number" && !Number.isNaN(fix.heading))
      L.marker([fix.lat, fix.lng], {
        interactive: false,
        icon: L.divIcon({ className: "traveler-heading", html: `<span style="transform:rotate(${fix.heading}deg)"></span>`, iconSize: [44, 44] }),
      }).addTo(layer);
    L.circleMarker([fix.lat, fix.lng], { radius: 8, color: "#fff", weight: 3, fillColor: fix.manual ? "#7a5a36" : "#2f80ed", fillOpacity: 1, className: "traveler-me" })
      .bindTooltip(fix.manual ? tr("Local escolhido") : tr("Você está aqui"))
      .addTo(layer);
    if (follow.current) m.setView([fix.lat, fix.lng], Math.max(m.getZoom(), 16), { animate: true });
  }, [fix]);

  // Busca de lugares para o grupo escolhido.
  const load = useCallback(
    async (g: Group, at: Point, r = radius, k = kinds) => {
      loadAbort.current?.abort();
      const stop = new AbortController();
      loadAbort.current = stop;
      setError(undefined);
      setLoading(g === "food" ? tr("Procurando onde comer…") : g === "transport" || g === "services" ? tr("Consultando o OpenStreetMap…") : tr("Procurando lugares por perto…"));
      try {
        let found: Place[];
        if (g === "tourism" || g === "nature") {
          const res = await searchAttractions(at, r, { lang, signal: stop.signal, storage: localStorage });
          found = res.places;
          const tourism = found.filter((p) => !NATURE.has(p.category));
          const nature = found.filter((p) => NATURE.has(p.category));
          setPlaces((old) => ({ ...old, tourism, nature }));
          setLoadedAt((o) => ({ ...o, tourism: res.retrievedAt, nature: res.retrievedAt }));
          return;
        }
        if (g === "food") found = (await searchFood(at, r, [], { lang, signal: stop.signal, storage: localStorage })).places;
        else found = await searchServices(at, r, g === "transport" ? k.filter((x) => transportKinds.includes(x)) : k.filter((x) => serviceKinds.includes(x)), { signal: stop.signal, language: lang });
        setPlaces((old) => ({ ...old, [g]: found }));
        setLoadedAt((o) => ({ ...o, [g]: new Date().toISOString() }));
      } catch (e) {
        if (!stop.signal.aborted) setError(e instanceof Error ? tr(e.message) : tr("Não foi possível buscar agora."));
      } finally {
        if (loadAbort.current === stop) setLoading(undefined);
      }
    },
    [radius, kinds, lang],
  );
  // Primeira busca assim que houver posição.
  const firstLoad = useRef(false);
  useEffect(() => {
    if (origin && !firstLoad.current) {
      firstLoad.current = true;
      load("tourism", origin);
    }
  }, [origin, load]);

  const list = useMemo(() => {
    if (!origin) return [];
    return withDistance(filterNearby(places[group], filters, visited), origin).filter((x) => x.km * 1000 <= radius * 1.05);
  }, [places, group, filters, visited, origin, radius]);

  // Pinos no mapa.
  useEffect(() => {
    const layer = pins.current;
    if (!layer) return;
    layer.clearLayers();
    const shown = tab === "walk" && plan ? plan.stops.map((s) => s.place) : tab === "wish" ? wishes.map((w) => w.place as Place).filter((p) => p.coordinates) : list.map((x) => x.place);
    for (const p of shown.slice(0, 200)) {
      const on = selected?.id === p.id;
      L.circleMarker([p.coordinates.lat, p.coordinates.lng], { radius: on ? 10 : 7, color: "#fff", weight: 2, fillColor: groupColor[groupOf(p)], fillOpacity: 1, className: "traveler-pin" })
        .bindTooltip(p.name)
        .on("click", () => openPlace(p))
        .addTo(layer);
    }
  }, [list, tab, plan, wishes, selected]);

  // Linha do trajeto (rota calculada ou roteiro a pé em linha reta).
  useEffect(() => {
    const layer = line.current;
    if (!layer) return;
    layer.clearLayers();
    if (route) L.polyline(route.line, { color: "#2f80ed", weight: 5, opacity: 0.85 }).addTo(layer);
    else if (tab === "walk" && plan && origin && plan.stops.length)
      L.polyline([[origin.lat, origin.lng], ...plan.stops.map((s) => [s.place.coordinates.lat, s.place.coordinates.lng] as [number, number])], { color: "#2f6b55", weight: 3, dashArray: "6 8" }).addTo(layer);
  }, [route, plan, tab, origin]);

  function recenter() {
    follow.current = true;
    setFollowing(true);
    if (fix) map.current?.setView([fix.lat, fix.lng], Math.max(map.current.getZoom(), 16));
  }
  function openPlace(p: Place) {
    setSelected(p);
    setRoute(undefined);
    setRouteError(undefined);
    follow.current = false;
    setFollowing(false);
    map.current?.setView([p.coordinates.lat, p.coordinates.lng], Math.max(map.current.getZoom(), 16));
    if (sheet === "peek") setSheet("half");
  }
  async function go(mode: Mode, p: Place) {
    if (!origin) return setRouteError(tr("Ative a localização ou escolha onde você está no mapa."));
    setRouting(mode);
    setRouteError(undefined);
    try {
      const r = await travelRoute(mode, origin, p.coordinates);
      setRoute(r);
      map.current?.fitBounds(L.latLngBounds(r.line.map(([a, b]) => [a, b] as [number, number])), { padding: [40, 40] });
    } catch (e) {
      setRouteError(e instanceof Error ? tr(e.message) : tr("Não foi possível calcular agora."));
    } finally {
      setRouting(undefined);
    }
  }
  function saveWish(p: Place, collection = defaultCollection) {
    const { list: next, added } = addWish(wishes, toSaved(p), collection);
    setWishes(next);
    saveWishes(next);
    setNotice(added ? tf("Salvo em {name}.", { name: tr(collection) }) : tr("Este lugar já está salvo."));
  }
  function toggleVisited(p: Place) {
    let next = wishes;
    if (!next.some((w) => w.place.id === p.id)) next = addWish(next, toSaved(p)).list;
    const was = visited.has(p.id);
    next = markVisited(next, p.id, !was);
    setWishes(next);
    saveWishes(next);
    setNotice(was ? tr("Marcação de visitado removida.") : tr("Marcado como visitado."));
  }

  // Busca de destino
  useEffect(() => {
    searchAbort.current?.abort();
    if (query.trim().length < 3) return setHits([]);
    const stop = new AbortController();
    searchAbort.current = stop;
    const t = setTimeout(async () => {
      try {
        const [named, addresses] = await Promise.all([suggestPlaces(query, lang, { signal: stop.signal }).catch(() => []), geocodeAddress(query, lang, { signal: stop.signal }).catch(() => [])]);
        if (!stop.signal.aborted) setHits([...named, ...addresses].slice(0, 8));
      } catch {
        /* sem sugestões */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, lang]);

  const stay = activeTrip?.stays?.find((s) => s.coordinates && validPoint(s.coordinates));
  const nowSuggestions = useMemo(() => {
    if (!origin || !preset) return [];
    const pool = [...places.tourism, ...places.nature, ...places.food];
    return suggestNow(pool, origin, preset, visited);
  }, [origin, preset, places, visited]);
  const needsFood = preset?.id === "eat" && !places.food.length;
  const pool = [...places.tourism, ...places.nature, ...places.food];

  const sheetBody = selected ? (
    <PlaceDetails
      place={selected}
      origin={origin}
      visited={visited.has(selected.id)}
      wished={wishes.some((w) => w.place.id === selected.id)}
      collections={collections(wishes).map((c) => c.name)}
      route={route}
      routing={routing}
      routeError={routeError}
      trips={trips}
      onBack={() => {
        setSelected(undefined);
        setRoute(undefined);
      }}
      onRoute={(m) => go(m, selected)}
      onWish={(c) => saveWish(selected, c)}
      onVisited={() => toggleVisited(selected)}
      onAddToTrip={async (trip, day) => {
        try {
          const next = addToItinerary(trip, toSaved(selected), { day });
          if (await onSaveTrip(next)) setNotice(tf("Adicionado ao dia {day} de {trip}.", { day, trip: trip.title }));
        } catch (e) {
          setNotice(e instanceof Error ? tr(e.message) : tr("Não foi possível adicionar."));
        }
      }}
    />
  ) : (
    <>
      <div className="traveler-tabs" role="tablist" aria-label={tr("Modo Viajante")}>
        {(
          [
            ["near", "Perto de mim", MapPin],
            ["now", "O que fazer agora?", Sparkles],
            ["walk", "Roteiro a pé", RouteIcon],
            ["wish", "Quero conhecer", BookmarkPlus],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            <Icon size={15} aria-hidden="true" /> {tr(label)}
          </button>
        ))}
      </div>

      {tab === "near" && (
        <div className="traveler-pane">
          {(stay || activeTrip) && origin && (
            <div className="traveler-context">
              {stay?.coordinates && (
                <button className="secondary small" onClick={() => openPlace(stayPlace(stay))}>
                  <Hotel size={15} /> {tr("Voltar para minha hospedagem")}
                </button>
              )}
            </div>
          )}
          <div className="traveler-groups" role="group" aria-label={tr("Tipo de lugar")}>
            {(
              [
                ["tourism", "Turismo e cultura"],
                ["nature", "Natureza e lazer"],
                ["food", "Comer"],
                ["transport", "Transporte"],
                ["services", "Serviços"],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                aria-pressed={group === g}
                className={"chip" + (group === g ? " is-on" : "")}
                onClick={() => {
                  setGroup(g);
                  const k = g === "transport" ? [transportKinds[0], transportKinds[1], transportKinds[3]] : g === "services" ? [serviceKinds[0], serviceKinds[3], serviceKinds[4]] : kinds;
                  setKinds(k);
                  if (origin && !loadedAt[g]) load(g, origin, radius, k);
                }}
              >
                <span className="traveler-dot" style={{ background: groupColor[g] }} aria-hidden="true" /> {tr(label)}
              </button>
            ))}
          </div>
          {(group === "transport" || group === "services") && (
            <div className="traveler-kinds" role="group" aria-label={tr("O que procurar")}>
              {(group === "transport" ? transportKinds : serviceKinds).map((k) => {
                const on = kinds.includes(k);
                return (
                  <button key={k.id} aria-pressed={on} className={"chip small" + (on ? " is-on" : "")} onClick={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}>
                    {tr(k.label)}
                  </button>
                );
              })}
              <button className="primary small" disabled={!origin || !kinds.length || !!loading} onClick={() => origin && load(group, origin, radius, kinds)}>
                <Search size={14} /> {tr("Buscar")}
              </button>
            </div>
          )}
          <div className="traveler-filters">
            <label>
              {tr("Raio")}
              <select
                value={radius}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setRadius(r);
                  if (origin && group !== "transport" && group !== "services") load(group, origin, r);
                }}
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r < 1000 ? `${r} m` : `${r / 1000} km`}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["openNow", "Aberto agora"],
                ["free", "Gratuito"],
                ["accessible", "Acessível"],
                ["notVisited", "Não visitados"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} aria-pressed={!!filters[k]} className={"chip small" + (filters[k] ? " is-on" : "")} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}>
                {tr(label)}
              </button>
            ))}
          </div>
          {!origin ? (
            <p className="traveler-empty">{tr("Aguardando sua localização. Você também pode tocar no mapa para escolher onde está.")}</p>
          ) : loading ? (
            <p className="traveler-empty" role="status">
              <Loader2 size={16} className="spin" /> {loading}
            </p>
          ) : error ? (
            <div className="traveler-empty" role="alert">
              <p>{error}</p>
              <button className="secondary small" onClick={() => load(group, origin, radius, kinds)}>
                {tr("Tentar de novo")}
              </button>
            </div>
          ) : !list.length ? (
            <p className="traveler-empty">
              {loadedAt[group] ? tr("Nada encontrado com esses filtros neste raio. Aumente o raio ou tire um filtro.") : group === "transport" || group === "services" ? tr("Escolha o que procurar e toque em Buscar.") : tr("Toque num tipo de lugar para buscar.")}
            </p>
          ) : (
            <ul className="traveler-list">
              {list.slice(0, 80).map(({ place: p, km }) => (
                <PlaceRow key={p.id} place={p} km={km} visited={visited.has(p.id)} onOpen={() => openPlace(p)} />
              ))}
            </ul>
          )}
          <p className="traveler-source">
            {tr("Dados: OpenStreetMap, Wikidata e Wikipédia. Horários, preços e acessibilidade só aparecem quando registrados.")}
          </p>
        </div>
      )}

      {tab === "now" && (
        <div className="traveler-pane">
          <div className="traveler-groups" role="group" aria-label={tr("O que você quer agora?")}>
            {presets.map((p) => (
              <button
                key={p.id}
                aria-pressed={preset?.id === p.id}
                className={"chip" + (preset?.id === p.id ? " is-on" : "")}
                onClick={() => {
                  setPreset(p);
                  if (origin && p.id === "eat" && !loadedAt.food) load("food", origin);
                  else if (origin && !loadedAt.tourism) load("tourism", origin);
                }}
              >
                {tr(p.label)}
              </button>
            ))}
          </div>
          {!preset ? (
            <p className="traveler-empty">{tr("Escolha uma opção. As sugestões usam a distância a pé, o horário registrado e o que você já visitou.")}</p>
          ) : loading ? (
            <p className="traveler-empty" role="status">
              <Loader2 size={16} className="spin" /> {loading}
            </p>
          ) : !nowSuggestions.length ? (
            <p className="traveler-empty">{needsFood ? tr("Buscando lugares para comer…") : tr("Nenhuma sugestão cabe nessa opção aqui perto. Tente outra ou aumente o raio em Perto de mim.")}</p>
          ) : (
            <ul className="traveler-list">
              {nowSuggestions.map((s) => (
                <PlaceRow key={s.place.id} place={s.place} km={s.km} visited={false} extra={[...s.why.map((w) => tr(w)), tf("~{min} min de visita", { min: s.visit })]} onOpen={() => openPlace(s.place)} />
              ))}
            </ul>
          )}
          <p className="traveler-source">{tr("Tempos de caminhada e de visita são estimativas.")}</p>
        </div>
      )}

      {tab === "walk" && (
        <div className="traveler-pane">
          <div className="traveler-filters">
            <label>
              {tr("Tempo disponível")}
              <select value={walkTime} onChange={(e) => setWalkTime(Number(e.target.value))}>
                {[60, 120, 180, 240, 360].map((m) => (
                  <option key={m} value={m}>
                    {tf("{h} h", { h: m / 60 })}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={endWithFood} onChange={(e) => setEndWithFood(e.target.checked)} /> {tr("Terminar num café ou restaurante")}
            </label>
            <button
              className="primary small"
              disabled={!origin || !!loading}
              onClick={async () => {
                if (!origin) return;
                if (!loadedAt.tourism) await load("tourism", origin);
                if (endWithFood && !loadedAt.food) await load("food", origin);
                setPlan(undefined);
                setTab("walk");
              }}
            >
              <Sparkles size={14} /> {tr("Montar roteiro")}
            </button>
          </div>
          <WalkPlanView
            origin={origin}
            pool={pool}
            minutes={walkTime}
            endWithFood={endWithFood}
            visited={visited}
            plan={plan}
            setPlan={setPlan}
            loading={!!loading}
            trips={trips}
            onOpen={openPlace}
            onSaveCollection={(name) => {
              let next = wishes;
              for (const s of plan?.stops ?? []) next = addWish(next, toSaved(s.place), name).list;
              setWishes(next);
              saveWishes(next);
              setNotice(tf("Roteiro salvo em {name}.", { name }));
            }}
            onAddToTrip={async (trip, day) => {
              let next = trip;
              let added = 0;
              for (const s of plan?.stops ?? []) {
                try {
                  next = addToItinerary(next, toSaved(s.place), { day });
                  added++;
                } catch {
                  /* já estava no roteiro */
                }
              }
              if (added && (await onSaveTrip(next))) setNotice(tf("{count} lugares adicionados ao dia {day} de {trip}.", { count: added, day, trip: trip.title }));
              else if (!added) setNotice(tr("Esses lugares já estavam no roteiro."));
            }}
          />
        </div>
      )}

      {tab === "wish" && (
        <WishList
          wishes={wishes}
          origin={origin}
          onOpen={(p) => openPlace(p)}
          onRemove={(id, c) => {
            const next = removeWish(wishes, id, c);
            setWishes(next);
            saveWishes(next);
          }}
          onVisited={(id, v) => {
            const next = markVisited(wishes, id, v);
            setWishes(next);
            saveWishes(next);
          }}
        />
      )}
    </>
  );

  return (
    <div className="traveler" role="dialog" aria-modal="true" aria-label={tr("Modo Viajante")}>
      <div ref={mapEl} className="traveler-map" aria-label={tr("Mapa")} />
      <header className="traveler-top">
        <button className="traveler-exit" onClick={onClose}>
          <ArrowLeft size={18} /> <span>{tr("Encerrar")}</span>
        </button>
        <div className="traveler-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Buscar destino ou endereço")}
            aria-label={tr("Buscar destino ou endereço")}
          />
          {query && (
            <button className="icon-button" aria-label={tr("Limpar busca")} onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
          {!!hits.length && (
            <ul className="traveler-hits">
              {hits.map((h, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      setQuery("");
                      setHits([]);
                      if (!h.point) return;
                      const p: Place = { id: "busca:" + h.point.lat.toFixed(5) + "," + h.point.lng.toFixed(5), name: h.name, coordinates: h.point, category: "other", address: h.context ?? "", city: "", country: "", source: "", retrievedAt: new Date().toISOString(), tags: {} };
                      openPlace(p);
                    }}
                  >
                    <b>{h.name}</b>
                    {h.context && <small>{h.context}</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <div className="traveler-fabs">
        <button className={"traveler-fab" + (following && gps === "on" ? " is-on" : "")} aria-label={tr("Minha localização")} title={tr("Minha localização")} onClick={recenter} disabled={!fix}>
          {following && gps === "on" ? <Navigation size={20} /> : <LocateFixed size={20} />}
        </button>
        <button className={"traveler-fab" + (choosing ? " is-on" : "")} aria-pressed={choosing} aria-label={tr("Escolher minha posição no mapa")} title={tr("Escolher minha posição no mapa")} onClick={() => setChoosing(!choosing)}>
          <MapPin size={20} />
        </button>
      </div>

      <section className={"traveler-sheet is-" + sheet} aria-label={tr("Lugares e ações")}>
        <button className="traveler-handle" aria-label={sheet === "full" ? tr("Recolher painel") : tr("Expandir painel")} onClick={() => setSheet(sheet === "peek" ? "half" : sheet === "half" ? "full" : "peek")}>
          <span aria-hidden="true" />
          {sheet === "full" ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <GpsStatus gps={gps} fix={fix} choosing={choosing} />
        {notice && (
          <p className="traveler-notice" role="status">
            <Check size={14} /> {notice}
            <button className="icon-button" aria-label={tr("Fechar aviso")} onClick={() => setNotice(undefined)}>
              <X size={14} />
            </button>
          </p>
        )}
        <div className="traveler-body">{sheetBody}</div>
      </section>
    </div>
  );
}

function groupOf(p: Place): Group {
  if (p.category.startsWith("svc:")) return transportKinds.some((k) => "svc:" + k.id === p.category) ? "transport" : "services";
  if (["restaurant", "cafe", "bakery", "pastry", "ice_cream", "fast_food", "food_court"].includes(p.category)) return "food";
  return NATURE.has(p.category) ? "nature" : "tourism";
}
const categoryText = (p: Place) => serviceLabel(p.category) ?? categories[p.category] ?? "Lugar";
const distanceText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${formatNumber(km, 1)} km`);
const stayPlace = (s: NonNullable<Trip["stays"]>[number]): Place => ({
  id: "stay:" + s.id, name: s.name, coordinates: s.coordinates!, category: "other", address: s.address, city: s.city, country: "", source: "", retrievedAt: "", tags: { stay: "yes" },
});

function GpsStatus({ gps, fix, choosing }: { gps: string; fix?: Fix; choosing: boolean }) {
  useLanguage();
  if (choosing) return <p className="traveler-gps is-choose">{tr("Toque no mapa no lugar onde você está.")}</p>;
  if (fix?.manual) return <p className="traveler-gps">{tr("Posição escolhida no mapa. O GPS não está sendo usado.")}</p>;
  if (gps === "on" && fix)
    return (
      <p className="traveler-gps is-on">
        <span className="traveler-live" aria-hidden="true" /> {tf("Localização ao vivo · precisão de cerca de {m} m", { m: Math.round(fix.accuracy ?? 0) })}
      </p>
    );
  if (gps === "asking") return <p className="traveler-gps">{tr("Pedindo sua localização ao navegador…")}</p>;
  if (gps === "denied") return <p className="traveler-gps is-warn">{tr("Localização negada. Toque no mapa ou busque um endereço para escolher onde você está.")}</p>;
  return <p className="traveler-gps is-warn">{tr("Localização indisponível neste aparelho. Toque no mapa ou busque um endereço.")}</p>;
}

function PlaceRow({ place: p, km, visited, extra = [], onOpen }: { place: Place; km: number; visited: boolean; extra?: string[]; onOpen: () => void }) {
  useLanguage();
  const open = openNow(p);
  return (
    <li>
      <button className="traveler-row" onClick={onOpen}>
        <span className="traveler-dot" style={{ background: groupColor[groupOf(p)] }} aria-hidden="true" />
        <span className="traveler-row-text">
          <b>{p.name}</b>
          <small>
            {tr(categoryText(p))} · {distanceText(km)} · {tf("{min} min a pé", { min: walkMinutes(km) })}
            {open === true ? " · " + tr("Aberto agora") : open === false ? " · " + tr("Fechado agora") : ""}
            {visited ? " · " + tr("Visitado") : ""}
          </small>
          {!!extra.length && <small className="traveler-why">{extra.join(" · ")}</small>}
        </span>
      </button>
    </li>
  );
}

function PlaceDetails(props: {
  place: Place;
  origin?: Point;
  visited: boolean;
  wished: boolean;
  collections: string[];
  route?: TravelRoute;
  routing?: Mode;
  routeError?: string;
  trips: Trip[];
  onBack: () => void;
  onRoute: (m: Mode) => void;
  onWish: (collection: string) => void;
  onVisited: () => void;
  onAddToTrip: (trip: Trip, day: number) => void;
}) {
  useLanguage();
  const { place: p, origin, route } = props;
  const photo = verifiedPhoto(p, 640);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [collection, setCollection] = useState(props.collections[0] ?? defaultCollection);
  const [newCollection, setNewCollection] = useState("");
  const [tripId, setTripId] = useState(props.trips[0]?.id ?? "");
  const [day, setDay] = useState(1);
  const [steps, setSteps] = useState(false);
  const km = origin ? distanceKm(origin, p.coordinates) : undefined;
  const ext = externalRoutes(origin, p.coordinates, p.name);
  const open = openNow(p);
  const access = accessibilityOf(p.tags);
  const trip = props.trips.find((t) => t.id === tripId);
  return (
    <div className="traveler-details">
      <button className="text-button small traveler-back" onClick={props.onBack}>
        <ArrowLeft size={15} /> {tr("Voltar à lista")}
      </button>
      <div className="traveler-photo">
        {photo && !photoFailed ? (
          <img src={photo.url} alt={tf("Foto de {name}", { name: p.name })} loading="lazy" onError={() => setPhotoFailed(true)} />
        ) : (
          <span className="traveler-nophoto">
            <ImageOff size={22} aria-hidden="true" /> {tr("Sem foto verificada deste lugar")}
          </span>
        )}
      </div>
      <h2>{p.name}</h2>
      <p className="traveler-meta">
        {tr(categoryText(p))}
        {km !== undefined && ` · ${distanceText(km)} · ${tf("{min} min a pé", { min: walkMinutes(km) })} (${tr("estimativa")})`}
      </p>
      <ul className="traveler-facts">
        {addressOf(p) && (
          <li>
            <MapPin size={15} aria-hidden="true" /> {addressOf(p)}
          </li>
        )}
        {p.tags.opening_hours && (
          <li>
            <Clock size={15} aria-hidden="true" /> <span>{p.tags.opening_hours}</span>
            {open !== undefined && <b className={open ? "is-open" : "is-closed"}>{open ? tr("Aberto agora") : tr("Fechado agora")}</b>}
          </li>
        )}
        {p.tags.fee && <li>{p.tags.fee === "no" ? tr("Entrada gratuita (segundo o OpenStreetMap)") : tr("Entrada paga (segundo o OpenStreetMap)")}</li>}
        {access.map((a) => (
          <li key={a}>
            <Accessibility size={15} aria-hidden="true" /> {tr(a)}
          </li>
        ))}
        {p.website && (
          <li>
            <Globe size={15} aria-hidden="true" />{" "}
            <a href={p.website} target="_blank" rel="noreferrer">
              {tr("Site oficial")}
            </a>
          </li>
        )}
        {(p.tags.phone || p.tags["contact:phone"]) && (
          <li>
            <Phone size={15} aria-hidden="true" /> <a href={"tel:" + (p.tags.phone || p.tags["contact:phone"]).split(";")[0].replace(/\s/g, "")}>{p.tags.phone || p.tags["contact:phone"]}</a>
          </li>
        )}
      </ul>

      <h3>{tr("Como chegar")}</h3>
      <div className="traveler-modes">
        {(
          [
            ["foot", "A pé", Footprints],
            ["bike", "Bicicleta", Bike],
            ["car", "Carro", Car],
          ] as const
        ).map(([m, label, Icon]) => (
          <button key={m} className={"secondary small" + (route?.mode === m ? " is-on" : "")} disabled={!origin || !!props.routing} onClick={() => props.onRoute(m)}>
            {props.routing === m ? <Loader2 size={15} className="spin" /> : <Icon size={15} />} {tr(label)}
          </button>
        ))}
      </div>
      {!origin && <p className="traveler-empty">{tr("Ative a localização ou escolha onde você está no mapa.")}</p>}
      {props.routeError && <p className="traveler-error" role="alert">{props.routeError}</p>}
      {route && (
        <div className="traveler-route">
          <p>
            <b>{distanceText(route.km)}</b> · <b>{tf("{min} min", { min: route.minutes })}</b> <small>· {route.provider}</small>
          </p>
          {!!route.steps.length && (
            <>
              <button className="text-button small" aria-expanded={steps} onClick={() => setSteps(!steps)}>
                {steps ? tr("Esconder instruções") : tf("Ver {count} instruções", { count: route.steps.length })}
              </button>
              {steps && (
                <ol className="traveler-steps">
                  {route.steps.map((s, i) => (
                    <li key={i}>
                      {s.text}
                      {s.meters > 0 && <small> · {distanceText(s.meters / 1000)}</small>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
      <div className="traveler-external">
        <a href={ext.googleTransit} target="_blank" rel="noreferrer" className="secondary small">
          <Train size={15} /> {tr("Transporte público")} <ExternalLink size={12} />
        </a>
        <a href={route?.mode === "car" ? ext.googleCar : route?.mode === "bike" ? ext.googleBike : ext.googleWalk} target="_blank" rel="noreferrer" className="secondary small">
          Google Maps <ExternalLink size={12} />
        </a>
        <a href={route?.mode === "car" ? ext.appleCar : ext.appleWalk} target="_blank" rel="noreferrer" className="secondary small">
          Apple Maps <ExternalLink size={12} />
        </a>
        <a href={ext.waze} target="_blank" rel="noreferrer" className="secondary small">
          Waze <ExternalLink size={12} />
        </a>
      </div>
      <p className="traveler-source">{tr("Transporte público com linhas e horários abre no app de mapas: o Gomes pelo Mundo não inventa linhas nem horários.")}</p>

      <h3>{tr("Guardar")}</h3>
      <div className="traveler-save">
        <select value={collection} onChange={(e) => setCollection(e.target.value)} aria-label={tr("Coleção")}>
          {[...new Set([defaultCollection, ...props.collections])].map((c) => (
            <option key={c} value={c}>
              {tr(c)}
            </option>
          ))}
        </select>
        <input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder={tr("ou nova coleção")} aria-label={tr("Nova coleção")} maxLength={60} />
        <button className="primary small" onClick={() => props.onWish(newCollection.trim() || collection)}>
          <BookmarkPlus size={15} /> {tr("Quero conhecer")}
        </button>
        <button className={"secondary small" + (props.visited ? " is-on" : "")} aria-pressed={props.visited} onClick={props.onVisited}>
          <Check size={15} /> {props.visited ? tr("Visitado") : tr("Marcar como visitado")}
        </button>
      </div>
      {!!props.trips.length && (
        <div className="traveler-save">
          <select value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label={tr("Viagem")}>
            {props.trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label>
            {tr("Dia")}
            <input type="number" min={1} max={366} value={day} onChange={(e) => setDay(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="secondary small" disabled={!trip} onClick={() => trip && props.onAddToTrip(trip, day)}>
            <Plus size={15} /> {tr("Adicionar ao roteiro")}
          </button>
        </div>
      )}
      {p.source && (
        <p className="traveler-source">
          <a href={p.source} target="_blank" rel="noreferrer">
            {tr("Ver a fonte")}
          </a>
        </p>
      )}
    </div>
  );
}

function WalkPlanView(props: {
  origin?: Point;
  pool: Place[];
  minutes: number;
  endWithFood: boolean;
  visited: Set<string>;
  plan?: WalkPlan;
  setPlan: (p: WalkPlan | undefined) => void;
  loading: boolean;
  trips: Trip[];
  onOpen: (p: Place) => void;
  onSaveCollection: (name: string) => void;
  onAddToTrip: (trip: Trip, day: number) => void;
}) {
  useLanguage();
  const { origin, pool, minutes, endWithFood, visited, plan, setPlan } = props;
  const [tripId, setTripId] = useState(props.trips[0]?.id ?? "");
  const [day, setDay] = useState(1);
  useEffect(() => {
    if (origin && pool.length && !plan) setPlan(planWalk(pool, origin, minutes, { endWithFood, visited }));
  }, [origin, pool.length, minutes, endWithFood, plan]);
  if (!origin) return <p className="traveler-empty">{tr("Ative a localização ou escolha onde você está no mapa.")}</p>;
  if (props.loading) return <p className="traveler-empty">{tr("Procurando lugares por perto…")}</p>;
  if (!plan) return <p className="traveler-empty">{tr("Escolha o tempo e toque em Montar roteiro.")}</p>;
  if (!plan.stops.length) return <p className="traveler-empty">{tr("Não há lugares que caibam nesse tempo aqui perto. Aumente o tempo.")}</p>;
  const trip = props.trips.find((t) => t.id === tripId);
  return (
    <>
      <p className="traveler-summary">
        {tf("{count} paradas · {km} km a pé · cerca de {h} h {m} min", { count: plan.stops.length, km: formatNumber(plan.km, 1), h: Math.floor(plan.totalMinutes / 60), m: plan.totalMinutes % 60 })}
      </p>
      <ol className="traveler-plan">
        {plan.stops.map((s, i) => (
          <li key={s.place.id}>
            <button className="traveler-row" onClick={() => props.onOpen(s.place)}>
              <span className="traveler-step-n">{i + 1}</span>
              <span className="traveler-row-text">
                <b>{s.place.name}</b>
                <small>{tf("{walk} min a pé · ~{visit} min no lugar · chega em ~{at} min", { walk: s.walk, visit: s.visit, at: s.arrive })}</small>
              </span>
            </button>
            <span className="traveler-plan-actions">
              <button className="icon-button" aria-label={tr("Subir")} disabled={i === 0} onClick={() => setPlan(reorder(plan, origin, i, -1))}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-button" aria-label={tr("Descer")} disabled={i === plan.stops.length - 1} onClick={() => setPlan(reorder(plan, origin, i, 1))}>
                <ArrowDown size={15} />
              </button>
              <button className="icon-button" aria-label={tr("Remover parada")} onClick={() => setPlan(removeStop(plan, origin, i))}>
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className="traveler-source">{tr("Caminho no mapa em linha reta; tempos estimados. Use Como chegar em cada parada para o caminho real.")}</p>
      <div className="traveler-save">
        <button className="secondary small" onClick={() => props.onSaveCollection(tf("Roteiro de {date}", { date: new Date().toLocaleDateString(getLocale()) }))}>
          <BookmarkPlus size={15} /> {tr("Salvar em Quero conhecer")}
        </button>
        <button className="text-button small" onClick={() => setPlan(planWalk(pool, origin, minutes, { endWithFood, visited }))}>
          <Compass size={15} /> {tr("Refazer")}
        </button>
      </div>
      {!!props.trips.length && (
        <div className="traveler-save">
          <select value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label={tr("Viagem")}>
            {props.trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label>
            {tr("Dia")}
            <input type="number" min={1} max={366} value={day} onChange={(e) => setDay(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="secondary small" disabled={!trip} onClick={() => trip && props.onAddToTrip(trip, day)}>
            <Plus size={15} /> {tr("Adicionar à viagem")}
          </button>
        </div>
      )}
    </>
  );
}

function WishList({ wishes, origin, onOpen, onRemove, onVisited }: { wishes: WishItem[]; origin?: Point; onOpen: (p: Place) => void; onRemove: (id: string, collection: string) => void; onVisited: (id: string, v: boolean) => void }) {
  useLanguage();
  const groups = collections(wishes);
  if (!wishes.length) return <p className="traveler-empty">{tr("Nada salvo ainda. Abra um lugar e toque em Quero conhecer.")}</p>;
  return (
    <div className="traveler-pane">
      {groups.map((g) => (
        <section key={g.name} className="traveler-wish-group">
          <h3>
            {tr(g.name)} <small>{g.count}</small>
          </h3>
          <ul className="traveler-list">
            {wishes
              .filter((w) => w.collection === g.name)
              .map((w) => {
                const p = w.place as Place;
                const km = origin && p.coordinates ? distanceKm(origin, p.coordinates) : undefined;
                return (
                  <li key={w.place.id + g.name} className="traveler-wish">
                    <button className="traveler-row" disabled={!p.coordinates} onClick={() => onOpen(p)}>
                      <span className="traveler-dot" style={{ background: groupColor[groupOf(p)] }} aria-hidden="true" />
                      <span className="traveler-row-text">
                        <b>{p.name}</b>
                        <small>
                          {tr(categoryText(p))}
                          {km !== undefined ? " · " + distanceText(km) : ""}
                          {w.visitedAt ? " · " + tr("Visitado") : ""}
                        </small>
                      </span>
                    </button>
                    <span className="traveler-plan-actions">
                      <button className="icon-button" aria-pressed={!!w.visitedAt} aria-label={w.visitedAt ? tr("Desmarcar visitado") : tr("Marcar como visitado")} onClick={() => onVisited(w.place.id, !w.visitedAt)}>
                        <Check size={15} />
                      </button>
                      <button className="icon-button" aria-label={tr("Remover")} onClick={() => onRemove(w.place.id, g.name)}>
                        <X size={15} />
                      </button>
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
